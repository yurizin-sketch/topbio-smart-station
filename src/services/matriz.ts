import { ApiError, apiEnabled, login, post, type Session } from './api'

/**
 * A vista do armazém.
 *
 * O balcão vê uma loja; a matriz vê todas. É a diferença que justifica um
 * serviço à parte em vez de mais um botão no `/staff`: quem entra aqui não
 * entra com o PIN de uma loja nenhuma, entra com a palavra-passe do armazém, e
 * o que recebe não são os pedidos de um tablet — é o mapa.
 *
 * Tudo isto é leitura. Não há aqui nenhuma operação que mude o que quer que
 * seja numa loja, e é de propósito: o armazém confere, as lojas é que mexem.
 */

export interface MatrizSession {
  readonly token: string
  readonly exp: number
}

/** Uma loja, como o servidor a conhece. */
export interface PostoRow {
  readonly id: string
  readonly name: string
  readonly active: number
  readonly tracksStock: number
}

/** Quanto vendeu cada loja no período. */
export interface VendasPorPosto {
  readonly stationId: string
  readonly vendas: number
  readonly totalCents: number
}

/** Quanto vendeu cada produto, loja a loja. */
export interface VendasPorProduto {
  readonly stationId: string
  readonly productId: string
  readonly vendas: number
  readonly totalCents: number
}

/** Quanto entrou por cada forma de pagamento, somando as lojas todas. */
export interface VendasPorMetodo {
  readonly method: string
  readonly vendas: number
  readonly totalCents: number
}

/** Unidades em cada loja. */
export interface StockRow {
  readonly stationId: string
  readonly productId: string
  readonly qty: number
}

export interface Overview {
  readonly ok: true
  readonly from: number
  readonly to: number
  readonly stations: PostoRow[]
  readonly porPosto: VendasPorPosto[]
  readonly porProduto: VendasPorProduto[]
  readonly porMetodo: VendasPorMetodo[]
  readonly stock: StockRow[]
}

/**
 * Entrar no armazém.
 *
 * Sem servidor isto não existe de todo — ao contrário do balcão, que ainda tem
 * um PIN local para safar a loja quando a rede cai. Aqui não há plano B que
 * faça sentido: os números de todas as lojas só existem do lado do servidor, e
 * inventar uma vista vazia offline era mentir a quem vem conferir contas.
 */
export async function matrizLogin(password: string): Promise<MatrizSession> {
  if (!apiEnabled()) throw new Error('Sem servidor configurado.')
  const session = await login('matriz', password)
  return { token: session.token, exp: session.exp }
}

/**
 * O mapa do período. `dias` conta para trás a partir de agora.
 *
 * O servidor conta só o que foi mesmo pago — códigos emitidos e nunca
 * levantados não entram. É a conta certa para quem confere dinheiro, e é por
 * isso que os totais daqui não batem com o número de pedidos abertos no
 * balcão.
 */
export async function overview(
  session: MatrizSession,
  dias = 30,
): Promise<Overview> {
  const to = Date.now()
  const from = to - dias * 24 * 60 * 60 * 1000
  return post<Overview>('/api/matriz/overview', { from, to }, session.token)
}

/**
 * O que se diz a quem está a olhar, quando isto corre mal.
 *
 * Mesmas regras do balcão: a pessoa está de pé à espera de um número, não quer
 * saber de códigos HTTP. A única distinção que lhe interessa mesmo é entre «a
 * palavra-passe está errada» e «a rede não chega aqui», porque a primeira ela
 * resolve e a segunda não.
 */
export function explainMatriz(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Palavra-passe do armazém errada.'
    if (error.status === 403) return 'Esta sessão não tem acesso ao armazém.'
    if (error.status === 429) return 'Demasiadas tentativas. Espere um pouco.'
    if (error.status === 503) return 'O servidor ainda não tem o armazém ligado.'
    if (error.status === 0) return 'Sem ligação ao servidor.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Não foi possível carregar os dados.'
}

/**
 * Sessão declarada por outro leitor.
 *
 * Reaproveita-se o guarda-sessões do transporte: o `Session` que o `login`
 * devolve já traz `scope`, e só interessa aqui se for o do armazém.
 */
export function asMatriz(session: Session | null): MatrizSession | null {
  if (!session || session.scope !== 'matriz') return null
  return { token: session.token, exp: session.exp }
}
