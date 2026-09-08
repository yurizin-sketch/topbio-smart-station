import { config } from '../config'
import type { Order } from '../types'

/*
   A ficha do balcão.

   Isto foi, até há pouco, uma camada de pagamentos com um gateway lá dentro
   que dava a compra por paga ao fim de oito segundos. Servia para desenhar os
   ecrãs, e era uma bomba-relógio: publicado numa loja, entregava produtos sem
   ninguém ter pago.

   O quiosque deixou de cobrar. Não fala com bancos, não lê cartões, não sabe
   nem pode saber se alguém pagou. O que faz é isto: emite um código, marca a
   hora em que ele deixa de valer, e manda a pessoa ao balcão.

   Quem transforma isso em dinheiro é uma pessoa, no `/staff`. É a única
   maneira de a estação não poder mentir sobre o que recebeu.
*/

export interface Ticket {
  orderId: string
  /** O código que o cliente leva ao balcão, ex.: `TB-4821`. */
  code: string
  /** A partir daqui a unidade volta à prateleira. */
  expiresAt: number
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
 * Emite a ficha de uma encomenda.
 *
 * Não vai à rede e não pode falhar: o cliente está de pé à frente do ecrã à
 * espera de um código para levar dois passos mais à frente, e uma espera aqui
 * seria uma espera por nada.
 */
export function issueTicket(order: Order): Ticket {
  return {
    orderId: order.id,
    code: makeTicketCode(),
    expiresAt: Date.now() + config.ticketValidityMs,
  }
}
