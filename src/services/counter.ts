import { config, getStationId, rememberStationId, stationIsRegistered } from '../config'
import { ApiError, apiEnabled, clearSession, login, post, type Session } from './api'
import {
  applyRemote,
  findByCode,
  flush,
  listOpen,
  markCancelled,
  settleLocal,
  type StoredOrder,
} from './orders'
import type { Order, PaymentMethod } from '../types'

/**
 * As operações do balcão.
 *
 * Uma regra em todas: fala-se com o servidor, e se não houver servidor ou não
 * houver rede, faz-se em casa e fica em fila. O que nunca acontece é o balcão
 * ficar sem poder entregar um produto a quem está à frente dele com o código
 * na mão — quem está na fila não tem culpa da linha da loja.
 */

type RemoteOrder = Omit<Order, 'method'> & {
  method: PaymentMethod | null
  paidAt: number | null
  closedAt: number | null
}

/**
 * Uma sessão de balcão, ou `null` quando não há servidor nenhum configurado.
 *
 * `null` não é falha — é o modo da demonstração publicada, onde tudo o que
 * existe é o livro deste browser.
 */
export type CounterSession = Session | null

export interface Unlocked {
  session: CounterSession
  /** O nome que aparece no cabeçalho: a loja em que este tablet está. */
  stationName: string
}

/**
 * Entrar no balcão.
 *
 * Com servidor, quem valida o PIN é ele, contra o resumo guardado na tabela
 * `stations` — o PIN não viaja em claro para lado nenhum a não ser para o
 * worker, e não está escrito em ficheiro nenhum deste repositório.
 *
 * Sem servidor configurado vale o PIN do `config`, que está no pacote do
 * browser e portanto não protege nada. É o suficiente para a demonstração e
 * para o cliente curioso não cair no painel do balcão por engano.
 *
 * Com servidor configurado mas inalcançável há uma última porta: o PIN de
 * recurso do `config`. Abre uma sessão só local — sem bilhete, a trabalhar em
 * casa — e é estreita de propósito. Só se chega a ela quando o servidor não
 * respondeu de todo; a um PIN a que o servidor disse «não» (401), não. Assim
 * ninguém abre o balcão à força bruta: tinha de derrubar a ligação primeiro, e
 * mesmo aí só entra quem saiba o PIN de recurso.
 */
export async function counterLogin(stationId: string, secret: string): Promise<Unlocked> {
  if (!apiEnabled()) {
    if (secret !== config.staffPin) throw new ApiError('credenciais', 401)
    return { session: null, stationName: 'Estação local' }
  }

  try {
    const session = await login('balcao', secret, stationId.trim())

    // O servidor confirmou o posto. A partir daqui este tablet sabe quem é, e as
    // vendas do quiosque deixam de sair com um nome que ninguém registou.
    if (session.stationId) rememberStationId(session.stationId)

    // Havia vendas à espera de sessão para poderem ser fechadas. Agora há.
    void flush()

    return {
      session,
      stationName: session.stationName ?? session.stationId ?? stationId,
    }
  } catch (e) {
    // Servidor mudo (rede em baixo, worker em baixo) e o PIN de recurso certo:
    // abre-se o balcão sem ligação. Note-se que só entra por aqui quem NÃO teve
    // resposta — um 401 do servidor cai a seguir, sem passar por esta porta.
    if (e instanceof ApiError && e.offline && secret === config.staffPin) {
      return {
        session: null,
        // Se o tablet já soube que posto era, mostra-o; senão fica só «Balcão».
        stationName: stationIsRegistered() ? getStationId() : '',
      }
    }
    throw e
  }
}

export function counterLogout(): void {
  clearSession()
}

/**
 * O código tal como o servidor o guarda.
 *
 * O funcionário escreve o que vê no ecrã do cliente, e o que vê é `TB-4821`.
 * Uns escrevem o traço, outros não, e há ainda os códigos de recurso de seis
 * caracteres dos pedidos antigos — esses só existem em casa.
 */
function normalize(raw: string): string {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (code.startsWith('TB-')) return code
  return code.length === 4 ? `TB-${code}` : code
}

export interface Queue {
  orders: StoredOrder[]
  /** A lista veio do servidor. A falso, é só o que este aparelho tem. */
  remote: boolean
}

/** A fila do balcão: o que está por entregar neste posto. */
export async function counterPending(session: CounterSession): Promise<Queue> {
  if (!session) return { orders: listOpen(), remote: false }
  try {
    const out = await post<{ ok: true; orders: RemoteOrder[] }>(
      '/api/orders/pending',
      {},
      session.token,
    )
    // Autoritária: é a fila completa daquele posto. Um pedido que cá esteja em
    // aberto e não venha nela foi fechado noutro tablet.
    applyRemote(out.orders, true)
    return { orders: listOpen(), remote: true }
  } catch (e) {
    if (e instanceof ApiError && e.offline) return { orders: listOpen(), remote: false }
    throw e
  }
}

/**
 * Procurar pelo código que o cliente traz.
 *
 * Pergunta-se ao servidor porque o cliente pode ter comprado noutro tablet da
 * mesma loja. Se ele não conhecer o código, ainda se procura em casa: pode ser
 * uma venda feita com a rede em baixo, que ainda não saiu daqui.
 */
export async function counterFind(session: CounterSession, raw: string): Promise<StoredOrder | null> {
  const local = () => findByCode(raw)
  if (!session) return local()

  try {
    const out = await post<{ ok: true; order: RemoteOrder }>(
      '/api/orders/find',
      { code: normalize(raw) },
      session.token,
    )
    applyRemote([out.order])
    return findByCode(out.order.ticketCode ?? raw) ?? local()
  } catch (e) {
    if (e instanceof ApiError && (e.offline || e.status === 404)) return local()
    throw e
  }
}

/**
 * Recebeu e entregou.
 *
 * No servidor isto é uma transacção só: marca entregue, regista como o dinheiro
 * entrou e desconta o stock. Ou entra tudo ou não entra nada — não há como
 * ficar mercadoria entregue sem venda registada.
 *
 * `method` é `null` para quem já estava pago: esse não volta a pagar.
 */
export async function counterSettle(
  session: CounterSession,
  order: StoredOrder,
  method: PaymentMethod | null,
): Promise<void> {
  if (!session) {
    settleLocal(order.id, method)
    return
  }

  try {
    const out = await post<{ ok: true; order: RemoteOrder; ja?: boolean }>(
      '/api/orders/settle',
      { id: order.id, method },
      session.token,
    )
    applyRemote([out.order])
  } catch (e) {
    // Sem rede fecha-se em casa e fica em fila. O cliente está à frente do
    // balcão: não se manda embora quem já pagou por causa da linha.
    if (e instanceof ApiError && e.offline) {
      settleLocal(order.id, method)
      return
    }
    throw e
  }
}

export async function counterCancel(session: CounterSession, order: StoredOrder): Promise<void> {
  if (!session) {
    markCancelled(order.id)
    return
  }
  try {
    await post('/api/orders/cancel', { id: order.id }, session.token)
    markCancelled(order.id)
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      markCancelled(order.id)
      return
    }
    throw e
  }
}

/** O que dizer a quem está ao balcão quando o servidor recusa. */
export function explain(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Não foi possível concluir. Tente outra vez.'
  switch (e.code) {
    case 'credenciais':
      return 'PIN ou posto incorretos.'
    case 'demasiadas-tentativas':
      return 'Demasiadas tentativas. Espere um minuto.'
    case 'sessao':
      return 'A sessão expirou. Introduza o PIN outra vez.'
    case 'permissao':
      return 'Esta sessão não tem acesso a esta operação.'
    case 'nao-encontrado':
      return 'Não há nenhum pedido com esse código.'
    case 'cancelado':
      return 'Este pedido foi cancelado e não pode ser entregue.'
    case 'metodo':
      return 'Falta dizer como o dinheiro entrou.'
    case 'sem-base-de-dados':
    case 'sem-segredo-de-sessao':
      return 'O servidor ainda não está configurado. Fale com a matriz.'
    case 'limite':
      return 'Demasiados pedidos ao servidor. Espere um momento.'
    case 'sem-rede':
    case 'sem-servidor':
      return 'Sem ligação ao servidor.'
    default:
      return 'Não foi possível concluir. Tente outra vez.'
  }
}
