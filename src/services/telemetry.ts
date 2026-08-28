import { getStationId } from '../config'

/**
 * Telemetria da estação.
 *
 * Só eventos de produto: que objetivo foi escolhido, que produto foi visto,
 * onde é que as sessões morrem. Nada que identifique quem está à frente do
 * ecrã — sem isso não há tratamento de dados pessoais e o RGPD sai da
 * equação para este fluxo.
 *
 * Regra: nunca passar por aqui número de telemóvel, nome ou meio de
 * pagamento completo.
 */

export type StationEvent =
  | { type: 'session_start' }
  | { type: 'goal_selected'; goal: string }
  | { type: 'product_viewed'; productId: string }
  | { type: 'checkout_started'; productId: string; method: string }
  | { type: 'payment_confirmed'; orderId: string }
  | { type: 'payment_failed'; orderId: string; reason: string }
  | { type: 'dispense_ok'; slotId: string }
  | { type: 'dispense_failed'; slotId: string; reason: string }
  | { type: 'session_timeout'; screen: string }

export interface TelemetrySink {
  send(event: StationEvent & { stationId: string; at: number }): void
}

/** Em desenvolvimento fica na consola; em produção vai para o backend. */
class ConsoleSink implements TelemetrySink {
  send(event: StationEvent & { stationId: string; at: number }): void {
    if (import.meta.env.DEV) console.info('[station]', event)
  }
}

let sink: TelemetrySink = new ConsoleSink()

export function setTelemetrySink(next: TelemetrySink): void {
  sink = next
}

export function track(event: StationEvent): void {
  try {
    sink.send({ ...event, stationId: getStationId(), at: Date.now() })
  } catch {
    // Telemetria nunca pode partir uma venda.
  }
}
