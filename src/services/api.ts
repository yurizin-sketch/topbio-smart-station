import { config } from '../config'

/**
 * A porta para o servidor da estação.
 *
 * Só o transporte: montar o endereço, pôr o bilhete de sessão no cabeçalho,
 * desistir a tempo e traduzir uma recusa num erro que os ecrãs saibam ler.
 * Quem sabe o que cada caminho quer dizer é o `counter.ts`; aqui não há regra
 * de negócio nenhuma.
 *
 * Do outro lado está o `server/api.js`. As respostas de erro de lá vêm sempre
 * na mesma forma — `{ "erro": "credenciais" }` — e é esse código que sobe até
 * ao ecrã, porque é ele que diz se se pede o PIN outra vez ou se se avisa que
 * a rede caiu.
 */

/** Uma recusa do servidor, com o motivo que ele deu. */
export class ApiError extends Error {
  constructor(
    /** O `erro` que veio no corpo: `sessao`, `credenciais`, `nao-encontrado`… */
    readonly code: string,
    /** O estado HTTP. Zero quando nem se chegou a falar com o servidor. */
    readonly status: number,
  ) {
    super(`servidor respondeu ${status}: ${code}`)
    this.name = 'ApiError'
  }

  /**
   * A sessão acabou ou nunca valeu.
   *
   * O servidor distingue isto de «não tem autorização» de propósito, e o ecrã
   * do balcão trata os dois de maneira diferente: a um pede-se o PIN outra vez,
   * ao outro não há nada a fazer.
   */
  get expired(): boolean {
    return this.status === 401
  }

  /** Não houve conversa: sem servidor configurado, sem rede, ou demorou demais. */
  get offline(): boolean {
    return this.status === 0
  }
}

/** Há servidor configurado neste build. */
export function apiEnabled(): boolean {
  return Boolean(config.api.endpoint)
}

function endereco(path: string): string {
  // O endereço do worker vem sem barra no fim. Sem a acrescentar, o `new URL`
  // lê o último segmento como se fosse um ficheiro e substitui-o — um
  // endpoint com caminho perderia o caminho, calado.
  const base = config.api.endpoint.endsWith('/')
    ? config.api.endpoint
    : `${config.api.endpoint}/`
  return new URL(path.replace(/^\//, ''), base).toString()
}

/**
 * Um pedido ao servidor.
 *
 * Tudo é POST, mesmo o que só lê: é o que o worker aceita, e poupa a distinção
 * entre corpo e parâmetros de endereço num sítio onde ela não rende nada.
 */
export async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  if (!apiEnabled()) throw new ApiError('sem-servidor', 0)

  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), config.api.timeoutMs)

  let response: Response
  try {
    response = await fetch(endereco(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: abort.signal,
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    // Rede em baixo, worker em baixo, ou passámos do tempo. Para quem chamou é
    // tudo a mesma coisa: não se sabe o que aconteceu do outro lado.
    throw new ApiError('sem-rede', 0)
  } finally {
    window.clearTimeout(timer)
  }

  const data: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const erro = (data as { erro?: unknown })?.erro
    throw new ApiError(typeof erro === 'string' ? erro : 'desconhecido', response.status)
  }

  return data as T
}

/* ── A sessão de quem está ao balcão ──────────────────────────────────────── */

export interface Session {
  /** O bilhete assinado. Vai no `authorization` de cada pedido. */
  token: string
  /** Quando deixa de valer, em milissegundos desde a época. */
  exp: number
  scope: 'balcao' | 'matriz'
  /** Só no balcão: o posto a que esta sessão dá acesso. */
  stationId?: string
  stationName?: string
}

const SESSION_KEY = 'topbio.session.v1'

/**
 * A sessão vive no `sessionStorage`, não no `localStorage`.
 *
 * Fechar o separador fecha a sessão. Num tablet de loja, que fica ligado o dia
 * todo e não é de ninguém em particular, é a diferença entre uma sessão de
 * balcão que acaba quando o turno acaba e uma que fica lá para quem vier a
 * seguir. O bilhete expira sozinho ao fim de doze horas de qualquer maneira.
 */
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    // Um bilhete fora de prazo não se manda ao servidor para ouvir «não»:
    // trata-se aqui como se não existisse.
    if (!s?.token || typeof s.exp !== 'number' || s.exp <= Date.now()) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Sem memória a sessão dura o tempo do ecrã aberto. Chega para cobrar.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Nada a fazer, e nada que valha a pena dizer a quem está ao balcão.
  }
}

interface LoginResponse {
  ok: true
  token: string
  exp: number
  scope: 'balcao' | 'matriz'
  stationId?: string
  stationName?: string
}

/**
 * Entrar.
 *
 * O `stationId` só conta no balcão — é a loja cujo PIN se está a dar. A matriz
 * não tem posto: a palavra-passe é uma só e abre as contas de todas as lojas.
 */
export async function login(
  scope: 'balcao' | 'matriz',
  secret: string,
  stationId?: string,
): Promise<Session> {
  const out = await post<LoginResponse>('/api/login', { scope, secret, stationId })
  const session: Session = {
    token: out.token,
    exp: out.exp,
    scope: out.scope,
    stationId: out.stationId,
    stationName: out.stationName,
  }
  saveSession(session)
  return session
}
