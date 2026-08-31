import type { Order, OrderStatus, PaymentMethod } from '../types'
import { config } from '../config'

/**
 * Camada de pagamentos.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ REGRA QUE NUNCA SE QUEBRA                                            ║
 * ║ O quiosque nunca decide que um pagamento foi feito. Ele pergunta ao   ║
 * ║ servidor e espera. Quem marca `paid` é o webhook da SIBS (MB WAY) ou  ║
 * ║ um funcionário autenticado (balcão). Se o ecrã pudesse confirmar      ║
 * ║ sozinho, qualquer pessoa com o inspetor do browser esvaziava a        ║
 * ║ loja de graça.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Fluxo MB WAY (SIBS API Market / SIBS Payment Gateway):
 *   1. quiosque  → backend:  "criar pagamento, 15,00 €, telemóvel 9XXXXXXXX"
 *   2. backend   → SIBS:     POST /payments  (com as credenciais do comerciante)
 *   3. SIBS      → cliente:  notificação push na app MB WAY
 *   4. cliente confirma no telemóvel
 *   5. SIBS      → backend:  webhook  status=Success
 *   6. backend marca a encomenda como `paid`
 *   7. quiosque, que está a ouvir a encomenda, vê `paid` e manda despachar
 *
 * Fluxo balcão (POS à porta da loja):
 *   1. quiosque cria a encomenda com `awaiting_counter` e um código curto
 *   2. a unidade fica reservada até expirar
 *   3. cliente leva o código ao balcão e paga lá
 *   4. funcionário confirma no /staff → backend marca `paid`
 *   5. entrega manual ou despacho automático, conforme se decidir
 */

export interface PaymentIntent {
  orderId: string
  method: PaymentMethod
  /** Só para MB WAY: conteúdo do QR alternativo à introdução do número. */
  qrPayload?: string
  /** Só para balcão: código legível, ex.: `TB-4821`. */
  ticketCode?: string
  expiresAt: number
}

export interface PaymentGateway {
  readonly kind: string
  /** Pede ao servidor para iniciar o pagamento. Não confirma nada. */
  start(order: Order, phone?: string): Promise<PaymentIntent>
  /**
   * Ouve o estado da encomenda no servidor.
   * Em produção: `onSnapshot` do documento da encomenda no Firestore.
   * Devolve a função para cancelar a subscrição.
   */
  observe(orderId: string, onChange: (status: OrderStatus) => void): () => void
  /** Cliente carregou em cancelar. */
  cancel(orderId: string): Promise<void>
}

/** Gera um código de balcão curto, legível em voz alta e sem ambiguidades. */
export function makeTicketCode(): string {
  // Sem I, O, 0, 1 — para ninguém ditar mal o código ao funcionário.
  const alphabet = '23456789ACDEFGHJKLMNPQRSTUVWXYZ'
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `TB-${out}`
}

/**
 * Implementação de desenvolvimento.
 * Simula o tempo real de resposta do MB WAY para o ecrã de espera ser
 * desenhado com o ritmo certo — cerca de 8 s até o cliente confirmar.
 */
export class MockGateway implements PaymentGateway {
  readonly kind = 'mock'
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  async start(order: Order, phone?: string): Promise<PaymentIntent> {
    await new Promise((r) => setTimeout(r, 700))
    if (order.method === 'counter') {
      return {
        orderId: order.id,
        method: 'counter',
        ticketCode: makeTicketCode(),
        expiresAt: Date.now() + config.ticketValidityMs,
      }
    }
    return {
      orderId: order.id,
      method: 'mbway',
      qrPayload: `MBWAY:${order.id}:${order.amountCents}:${phone ?? ''}`,
      expiresAt: Date.now() + config.mbwayTimeoutMs,
    }
  }

  observe(orderId: string, onChange: (status: OrderStatus) => void): () => void {
    onChange('awaiting_payment')
    const timer = setTimeout(() => onChange('paid'), 8000)
    this.timers.set(orderId, timer)
    return () => {
      clearTimeout(timer)
      this.timers.delete(orderId)
    }
  }

  async cancel(orderId: string): Promise<void> {
    const timer = this.timers.get(orderId)
    if (timer) clearTimeout(timer)
    this.timers.delete(orderId)
  }
}

let current: PaymentGateway = new MockGateway()

export function getGateway(): PaymentGateway {
  return current
}

export function setGateway(next: PaymentGateway): void {
  current = next
}
