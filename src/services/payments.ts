import type { Order } from '../types'
import { config, stationIsRegistered } from '../config'
import { ApiError, apiEnabled, post } from './api'
import { orderPayload } from './orders'

/**
 * Pagar no próprio tablet: MB WAY por QR code, pela Easypay.
 *
 * O tablet nunca fala com a Easypay. Pede ao servidor uma ligação de
 * pagamento, mostra-a em QR, e depois pergunta ao servidor se já entrou
 * dinheiro. Quem diz «pago» é o servidor, e só depois de a própria Easypay lho
 * confirmar (ver `server/api.js`) — o tablet não tem como saber, e um tablet
 * que se pudesse convencer de que alguém pagou entregava frascos de graça.
 *
 * Tudo o que falha aqui acaba no mesmo sítio: a ficha do balcão, onde se paga
 * como sempre se pagou. Um cliente de pé à frente do ecrã não fica preso por o
 * pagamento estar em baixo.
 */

export type PaymentStart =
  /** Há ligação: mostrar o QR. */
  | { kind: 'qr'; url: string; demo: boolean }
  /** Pagamento no tablet indisponível agora. Segue-se para o balcão. */
  | { kind: 'off'; reason: string }

export type PaymentState = 'pending' | 'paid' | 'failed'

export async function startPayment(order: Order): Promise<PaymentStart> {
  if (config.payments.demo) {
    return { kind: 'qr', url: `https://pay.easypay.pt/demonstracao-${order.id.slice(0, 8)}`, demo: true }
  }
  if (!apiEnabled()) return { kind: 'off', reason: 'sem-servidor' }
  // Um posto que o servidor não conhece não tem venda lá dentro para pagar.
  if (!stationIsRegistered()) return { kind: 'off', reason: 'posto-por-registar' }

  try {
    // A venda tem de existir do outro lado antes de se pedir o pagamento: é de
    // lá que sai o valor a cobrar, não deste pedido. Repetir a criação é
    // seguro — o servidor tem um `ON CONFLICT` à espera.
    await post('/api/orders/create', { order: orderPayload(order) })
    const res = await post<{ url: string }>('/api/pay/start', { orderId: order.id })
    if (!res?.url) return { kind: 'off', reason: 'sem-ligacao' }
    return { kind: 'qr', url: res.url, demo: false }
  } catch (e) {
    return { kind: 'off', reason: e instanceof ApiError ? e.code : 'desconhecido' }
  }
}

/**
 * Já pagaram?
 *
 * Uma rede em baixo responde «ainda não», não «falhou»: a pessoa pode estar a
 * meio de confirmar na app, e o pagamento entra na mesma — a pergunta
 * seguinte apanha-o.
 */
export async function paymentStatus(orderId: string): Promise<PaymentState> {
  try {
    const res = await post<{ state: PaymentState }>('/api/pay/status', { orderId })
    return res?.state ?? 'pending'
  } catch {
    return 'pending'
  }
}

export interface InvoiceData {
  invoiceName?: string
  nif?: string
  invoiceEmail: string
}

/**
 * Guardar os dados da fatura na venda, do lado do servidor.
 *
 * Vão direto ao servidor e não pela fila do livro de casa: só se chega aqui
 * depois de pagar no tablet, e isso já exigiu rede. Se falhar, o ecrã manda
 * pedir a fatura ao balcão — não fica nada a meio, guardado neste aparelho.
 */
export async function saveInvoice(orderId: string, data: InvoiceData): Promise<boolean> {
  if (config.payments.demo) return true
  try {
    await post('/api/orders/invoice', { orderId, ...data })
    return true
  } catch {
    return false
  }
}

/** Chega para apanhar o engano de dedo; quem confirma a sério é o email a chegar. */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * NIF português válido.
 *
 * Nove algarismos, o último é o dígito de controlo (módulo 11). Apanha os
 * enganos de quem escreve com pressa num ecrã de pé — um número trocado
 * passava para a fatura e só se dava por isso na contabilidade.
 */
export function nifValido(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false
  // Primeiros algarismos que a AT atribui: 1–3 particulares, 45 não
  // residentes, 5 empresas, 6 Estado, 7/8/9 outras entidades.
  if (!/^(1|2|3|45|5|6|7|8|9)/.test(nif)) return false
  let soma = 0
  for (let i = 0; i < 8; i++) soma += Number(nif[i]) * (9 - i)
  const resto = soma % 11
  const controlo = resto < 2 ? 0 : 11 - resto
  return controlo === Number(nif[8])
}
