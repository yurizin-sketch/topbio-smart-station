import type { SlotId } from '../types'

/**
 * Camada de despacho — a fronteira entre o software e o hardware.
 *
 * A máquina ainda não está escolhida, e é exatamente por isso que esta
 * interface existe. Nenhum ecrã fala com hardware: falam todos com este
 * contrato. Quando a máquina chegar, escreve-se um adaptador novo e mais
 * nada muda.
 *
 * Ao escolher a máquina, o requisito não negociável é: tem de aceitar uma
 * ordem de despacho vinda de um computador externo, por MDB, série (RS232/485)
 * ou HTTP. Se o fornecedor não souber responder a isso, a máquina não serve.
 */

export type DispenseFailure =
  | 'slot_empty'
  | 'slot_jammed'
  | 'offline'
  | 'timeout'
  | 'unknown'

export type DispenseResult =
  | { ok: true; slotId: SlotId }
  | { ok: false; slotId: SlotId; reason: DispenseFailure }

export interface DispenserStatus {
  online: boolean
  /** Compartimentos que a máquina reporta como bloqueados. */
  jammedSlots: SlotId[]
  lastSeenAt: number
}

export interface Dispenser {
  readonly kind: string
  status(): Promise<DispenserStatus>
  dispense(slotId: SlotId): Promise<DispenseResult>
}

/**
 * Adaptador de desenvolvimento.
 * Simula a latência real de um motor de mola (~4 s) e falha de vez em quando,
 * porque o ecrã de erro tem de ser testado tantas vezes como o de sucesso.
 */
export class MockDispenser implements Dispenser {
  readonly kind = 'mock'

  constructor(private readonly failureRate = 0) {}

  async status(): Promise<DispenserStatus> {
    return { online: true, jammedSlots: [], lastSeenAt: Date.now() }
  }

  async dispense(slotId: SlotId): Promise<DispenseResult> {
    await new Promise((r) => setTimeout(r, 4000))
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return { ok: false, slotId, reason: 'slot_jammed' }
    }
    return { ok: true, slotId }
  }
}

/**
 * Esqueleto do adaptador real, via um pequeno agente HTTP a correr no PC
 * da máquina (a ponte para MDB/série). Fica documentado para não se perder a
 * decisão, mas só se implementa quando a máquina estiver escolhida.
 */
export class HttpBridgeDispenser implements Dispenser {
  readonly kind = 'http-bridge'

  constructor(private readonly baseUrl: string) {}

  async status(): Promise<DispenserStatus> {
    const res = await fetch(`${this.baseUrl}/status`)
    if (!res.ok) throw new Error(`bridge status ${res.status}`)
    return (await res.json()) as DispenserStatus
  }

  async dispense(slotId: SlotId): Promise<DispenseResult> {
    try {
      const res = await fetch(`${this.baseUrl}/dispense`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotId }),
      })
      if (!res.ok) return { ok: false, slotId, reason: 'unknown' }
      return (await res.json()) as DispenseResult
    } catch {
      return { ok: false, slotId, reason: 'offline' }
    }
  }
}

let current: Dispenser = new MockDispenser()

export function getDispenser(): Dispenser {
  return current
}

export function setDispenser(next: Dispenser): void {
  current = next
}
