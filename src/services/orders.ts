import type { Order } from '../types'

/**
 * Livro de encomendas partilhado entre o quiosque e o /staff.
 *
 * Hoje é `localStorage`, o que só funciona porque as duas páginas correm no
 * mesmo browser (o tablet à porta da loja). É deliberadamente o mínimo que
 * torna o balcão utilizável antes de existir backend.
 *
 * Quando o Firestore entrar, só este ficheiro muda: `listOpen` passa a ser uma
 * query por `status`, `subscribe` passa a `onSnapshot` e `markPaid` deixa de
 * ser uma escrita local para ser uma Cloud Function. A assinatura das funções
 * foi escolhida a pensar nisso — nenhum ecrã sabe onde os dados vivem.
 *
 * ⚠️ Enquanto for localStorage, quem limpar os dados do browser apaga os
 * tickets por levantar. Não fechar a loja com pedidos em aberto.
 */

const KEY = 'topbio.station.orders.v1'
const EVENT = 'topbio:orders-changed'

/** Passadas 24h um pedido já não interessa a ninguém ao balcão. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type StoredOrder = Order & {
  /** Momento em que o balcão fechou o pedido (entregue ou cancelado). */
  closedAt?: number
}

/**
 * Estados que interessam ao balcão. Tudo o resto (`created`, `dispensing`, …)
 * é ruído de meio-caminho que o funcionário nunca precisa de ver.
 */
const OPEN_STATUSES: ReadonlyArray<Order['status']> = ['awaiting_counter', 'paid']

/**
 * O código que o cliente mostra depois de já ter pago por MB WAY. É derivado do
 * id, não guardado, para não haver duas fontes de verdade.
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
  const merged: StoredOrder = { ...previous, ...order }
  if (at >= 0) orders[at] = merged
  else orders.push(merged)
  write(orders)
}

/**
 * Aceita tanto o ticket por pagar (`TB-XXXX`) como o código de levantamento de
 * quem já pagou por MB WAY. O funcionário não sabe qual é qual — lê o que está
 * no ecrã do cliente e escreve.
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

/** O funcionário recebeu o dinheiro ao balcão. Só depois disto se entrega. */
export function markPaid(id: string): StoredOrder | null {
  return patch(id, { status: 'paid', method: 'counter' })
}

export function markDispensed(id: string): StoredOrder | null {
  return patch(id, { status: 'dispensed', closedAt: Date.now() })
}

export function markCancelled(id: string): StoredOrder | null {
  return patch(id, { status: 'cancelled', closedAt: Date.now() })
}

function patch(id: string, fields: Partial<StoredOrder>): StoredOrder | null {
  const orders = read()
  const at = orders.findIndex((o) => o.id === id)
  const found = at >= 0 ? orders[at] : undefined
  if (!found) return null
  const next: StoredOrder = { ...found, ...fields }
  orders[at] = next
  write(orders)
  return next
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
