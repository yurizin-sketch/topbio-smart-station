import type { Order, PaymentMethod } from '../types'
import { stationIsRegistered } from '../config'
import { ApiError, apiEnabled, loadSession, post } from './api'

/**
 * Livro de encomendas da estação.
 *
 * O livro de casa é a fonte de verdade do quiosque, e é de propósito: uma loja
 * com a internet em baixo continua a vender, a emitir códigos e a entregar ao
 * balcão. Só depois de estar escrito aqui é que se tenta contar ao servidor.
 *
 * O que o servidor sabe entra por `applyRemote` — é assim que este tablet vê os
 * pedidos que outro tablet da mesma loja emitiu. O que o servidor ainda não
 * ouviu fica marcado em `sync` e sai na próxima vez que houver rede.
 *
 * ⚠️ Um pedido só está seguro depois de `sync` desaparecer. Antes disso vive
 * neste aparelho e mais lado nenhum — quem limpar os dados do browser apaga-o.
 */

const KEY = 'topbio.station.orders.v1'
const EVENT = 'topbio:orders-changed'

/** Passadas 24h um pedido já não interessa a ninguém ao balcão. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type StoredOrder = Order & {
  /** Momento em que o balcão fechou o pedido (entregue ou cancelado). */
  closedAt?: number
  /** Momento em que o dinheiro entrou. Vem do servidor ou do fecho local. */
  paidAt?: number
  /**
   * O que este tablet ainda deve contar ao servidor sobre este pedido.
   *
   * Ausente quer dizer que não há nada por enviar. Enquanto estiver preenchido,
   * o que está aqui é mais recente do que o que o servidor sabe — e por isso
   * `applyRemote` não lhe toca.
   */
  sync?: 'create' | 'settle' | 'cancel'
}

/** Como um pedido chega do servidor: as colunas nulas do SQL vêm a `null`. */
type RemoteOrder = Omit<Order, 'method'> & {
  method: PaymentMethod | null
  paidAt: number | null
  closedAt: number | null
}

/**
 * Estados que interessam ao balcão. Tudo o resto (`created`, `expired`, …)
 * é ruído de meio-caminho que o funcionário nunca precisa de ver.
 */
const OPEN_STATUSES: ReadonlyArray<Order['status']> = ['awaiting_counter', 'paid']

/**
 * Código de recurso, derivado do id e não guardado, para não haver duas fontes
 * de verdade. Serve os pedidos antigos que ficaram no aparelho sem
 * `ticketCode` — hoje todos nascem com um.
 */
export function pickupCodeFor(order: Pick<Order, 'id'>): string {
  return order.id.slice(0, 6).toUpperCase()
}

function read(): StoredOrder[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - MAX_AGE_MS
    return (parsed as StoredOrder[]).filter((o) => o?.id && o.createdAt > cutoff)
  } catch {
    // localStorage cheio, desativado ou com lixo de uma versão anterior. Um
    // balcão sem histórico é mau; um quiosque que rebenta a meio é pior.
    return []
  }
}

function write(orders: StoredOrder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders))
  } catch {
    return
  }
  // O evento `storage` do browser só chega às *outras* tabs. Este é para a
  // própria, onde o quiosque acabou de escrever.
  window.dispatchEvent(new Event(EVENT))
}

export function listOrders(): StoredOrder[] {
  return read().sort((a, b) => b.createdAt - a.createdAt)
}

/** Por entregar, do mais antigo para o mais recente: quem espera há mais tempo aparece primeiro. */
export function listOpen(): StoredOrder[] {
  return read()
    .filter((o) => OPEN_STATUSES.includes(o.status))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function upsertOrder(order: Order): void {
  const orders = read()
  const at = orders.findIndex((o) => o.id === order.id)
  const previous = at >= 0 ? orders[at] : undefined
  const merged: StoredOrder = {
    ...previous,
    ...order,
    // Só um pedido novo entra na fila de envio. Um que já lá esteve e foi
    // aceite não volta a entrar — o quiosque reescreve a mesma encomenda várias
    // vezes ao longo de uma sessão e não há nada de novo para contar.
    sync: previous ? previous.sync : 'create',
  }
  if (at >= 0) orders[at] = merged
  else orders.push(merged)
  write(orders)
  void flush()
}

/**
 * Aceita o ticket (`TB-XXXX`) e também o código de recurso dos pedidos
 * antigos. O funcionário não sabe qual é qual — lê o que está no ecrã do
 * cliente e escreve.
 */
export function findByCode(input: string): StoredOrder | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, '')
  if (code.length < 4) return null
  const withPrefix = code.startsWith('TB-') ? code : `TB-${code}`
  return (
    read().find(
      (o) => o.ticketCode === code || o.ticketCode === withPrefix || pickupCodeFor(o) === code,
    ) ?? null
  )
}

/**
 * Recebeu e entregou, sem servidor à mão.
 *
 * As duas coisas escrevem-se de uma vez porque acontecem de uma vez: o
 * funcionário recebe o dinheiro e entrega o frasco no mesmo gesto. Separá-las
 * em duas escritas só criava um intervalo em que o pedido podia ficar entregue
 * sem registo de pago.
 *
 * O `method` é obrigatório para quem ainda devia — e não tem valor por defeito
 * de propósito. Ao fim do dia a matriz quer saber quanto entrou em numerário,
 * quanto em MB WAY e quanto em cartão, e um valor assumido aqui é um número
 * errado num relatório que ninguém consegue explicar.
 */
export function settleLocal(id: string, method: PaymentMethod | null): StoredOrder | null {
  const now = Date.now()
  const found = read().find((o) => o.id === id)
  if (!found) return null
  return patch(id, {
    status: 'delivered',
    method: method ?? found.method,
    paidAt: found.paidAt ?? now,
    closedAt: now,
    // Só se põe na fila se houver servidor para onde a mandar. Na demonstração
    // publicada não há, e uma fila que nunca drena é lixo que fica.
    sync: apiEnabled() ? 'settle' : undefined,
  })
}

export function markCancelled(id: string): StoredOrder | null {
  return patch(id, {
    status: 'cancelled',
    closedAt: Date.now(),
    sync: apiEnabled() ? 'cancel' : undefined,
  })
}

function patch(id: string, fields: Partial<StoredOrder>): StoredOrder | null {
  const orders = read()
  const at = orders.findIndex((o) => o.id === id)
  const found = at >= 0 ? orders[at] : undefined
  if (!found) return null
  const next: StoredOrder = { ...found, ...fields }
  orders[at] = next
  write(orders)
  void flush()
  return next
}

/* ── O que o servidor sabe ────────────────────────────────────────────────── */

function fromRemote(r: RemoteOrder): Partial<StoredOrder> {
  // O SQL devolve `null` nas colunas por preencher; o livro de casa usa
  // ausência. Sem esta passagem, um `paidAt: null` do servidor apagava a hora
  // que o fecho local tinha escrito.
  return {
    ...r,
    method: r.method ?? null,
    paidAt: r.paidAt ?? undefined,
    closedAt: r.closedAt ?? undefined,
  }
}

/**
 * Trazer para casa o que o servidor sabe.
 *
 * `authoritative` diz que a lista recebida é a fila completa daquele posto — e
 * então um pedido que cá esteja em aberto, sem nada por enviar, e que não venha
 * na lista, já foi fechado noutro tablet. Deixá-lo na fila era pôr o
 * funcionário a procurar um pedido que outra pessoa já entregou.
 */
export function applyRemote(remote: RemoteOrder[], authoritative = false): void {
  const local = read()
  const antes = JSON.stringify(local)
  const chegaram = new Set(remote.map((r) => r.id))
  const byId = new Map(local.map((o) => [o.id, o]))

  for (const r of remote) {
    const mine = byId.get(r.id)
    // Um pedido com escrita por enviar sabe mais do que o servidor: ele ainda
    // não ouviu falar dela. O servidor não apaga uma entrega que já aconteceu.
    if (mine?.sync) continue
    byId.set(r.id, { ...mine, ...fromRemote(r) } as StoredOrder)
  }

  let merged = [...byId.values()]
  if (authoritative) {
    // Um pedido acabado de nascer fica de fora desta limpeza. O envio e a
    // consulta correm ao mesmo tempo: a lista pode ter sido calculada no
    // servidor um instante antes de a criação lá chegar, e sem esta folga o
    // pedido desaparecia da fila até à consulta seguinte.
    const recente = Date.now() - 60_000
    merged = merged.filter(
      (o) =>
        o.sync ||
        chegaram.has(o.id) ||
        o.createdAt > recente ||
        !OPEN_STATUSES.includes(o.status),
    )
  }

  // Sem esta comparação, cada consulta ao servidor escrevia na mesma, disparava
  // o evento, e o ecrã do balcão voltava a consultar — um ciclo que só parava
  // quando o separador congelasse.
  const depois = JSON.stringify(merged)
  if (depois !== antes) write(merged)
}

/* ── A fila de envio ──────────────────────────────────────────────────────── */

let flushing = false

function clearSync(id: string): void {
  const orders = read()
  const at = orders.findIndex((o) => o.id === id)
  const found = at >= 0 ? orders[at] : undefined
  if (!found) return
  const { sync: _sync, ...resto } = found
  orders[at] = resto as StoredOrder
  write(orders)
}

function payload(o: StoredOrder) {
  return {
    id: o.id,
    stationId: o.stationId,
    ticketCode: o.ticketCode ?? pickupCodeFor(o),
    productId: o.productId,
    amountCents: o.amountCents,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
  }
}

/**
 * Contar ao servidor o que ficou por contar.
 *
 * Corre sozinha a cada escrita e quando a rede volta. Não devolve erro a
 * ninguém: se não der agora, dá à próxima — quem está ao balcão não tem nada a
 * fazer com esta informação.
 */
export async function flush(): Promise<void> {
  // Sem posto registado não vale a pena bater à porta: o servidor recusa tudo
  // com `posto-desconhecido` enquanto o tablet não souber quem é.
  if (flushing || !apiEnabled() || !stationIsRegistered()) return
  flushing = true
  try {
    for (const order of read()) {
      if (!order.sync) continue
      try {
        // O registo do pedido vai sempre à frente, mesmo quando o que falta é o
        // fecho: se a venda foi feita com a rede em baixo, o servidor nunca
        // ouviu falar dela e um `settle` sozinho não encontrava nada. Repetir a
        // criação é seguro — do outro lado há um `ON CONFLICT` à espera.
        await post('/api/orders/create', { order: payload(order) })

        if (order.sync !== 'create') {
          const session = loadSession()
          // Fechar um pedido exige sessão de balcão. Sem ela fica em fila: é
          // uma escrita de dinheiro, não se manda sem quem responda por ela.
          if (session?.scope !== 'balcao') continue
          if (order.sync === 'settle') {
            await post('/api/orders/settle', { id: order.id, method: order.method }, session.token)
          } else {
            await post('/api/orders/cancel', { id: order.id }, session.token)
          }
        }

        clearSync(order.id)
      } catch (e) {
        // Rede em baixo: parar já. Insistir nos outros era esperar o tempo
        // todo do timeout por cada pedido em fila.
        if (e instanceof ApiError && e.offline) return
        // Recusa com resposta (400, 404, 409): repetir dava sempre o mesmo.
        // Tira-se da fila para não bater na mesma porta para sempre — o pedido
        // fica em casa com o estado que tem.
        clearSync(order.id)
      }
    }
  } finally {
    flushing = false
  }
}

/** Avisa quando o livro muda, venha a mudança desta tab ou de outra. */
export function subscribe(onChange: () => void): () => void {
  const local = () => onChange()
  const cross = (e: StorageEvent) => {
    if (e.key === KEY) onChange()
  }
  window.addEventListener(EVENT, local)
  window.addEventListener('storage', cross)
  return () => {
    window.removeEventListener(EVENT, local)
    window.removeEventListener('storage', cross)
  }
}

// A loja pode passar horas sem rede e voltar sem ninguém tocar no tablet. Este
// é o momento em que o que ficou por contar sai daqui.
if (typeof window !== 'undefined') window.addEventListener('online', () => void flush())
