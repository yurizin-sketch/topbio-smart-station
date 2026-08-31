/**
 * A voz da assistente.
 *
 * Usa a voz que já vem no tablet (Web Speech API): não custa nada, não precisa
 * de internet e responde no instante. Fica atrás de uma interface porque no dia
 * em que a voz do sistema não chegar — e não chega, é robótica — troca-se por
 * áudio gerado no servidor sem mexer em mais nada.
 *
 * IMPORTANTE, O TOQUE DA MANHÃ: os navegadores não deixam uma página falar
 * antes de alguém lhe tocar. É uma regra contra páginas que gritam sozinhas, e
 * aplica-se a nós na mesma. Um toque em qualquer parte do ecrã destranca a voz
 * para o resto do dia — a página fica aberta, o desbloqueio fica com ela. Por
 * isso quem abre a loja toca uma vez no tablet e está feito; o ecrã de atração
 * avisa quando isso ainda não aconteceu.
 */

export interface Voice {
  /** Há voz portuguesa neste aparelho e já está destrancada. */
  readonly ready: boolean
  /** Está a falar neste momento. Serve para a boca da personagem mexer. */
  readonly speaking: boolean
  /** Chamar a partir de um toque real. Sem isto nada sai. */
  unlock(): void
  speak(text: string): void
  stop(): void
  subscribe(fn: () => void): () => void
}

/** Preferência de vozes, da melhor para a pior. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Português de Portugal primeiro, sempre. A diferença para pt-BR ouve-se à
  // primeira sílaba e numa loja em Portugal soa a call center estrangeiro.
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'pt-pt') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null
  )
}

class WebSpeechVoice implements Voice {
  speaking = false

  private unlocked = false
  private voice: SpeechSynthesisVoice | null = null
  private listeners = new Set<() => void>()

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => {
      this.voice = pickVoice(window.speechSynthesis.getVoices())
      this.emit()
    }
    load()
    // A lista chega vazia no primeiro pedido em quase todos os browsers.
    window.speechSynthesis.addEventListener('voiceschanged', load)
  }

  get ready(): boolean {
    return this.unlocked && this.voice !== null
  }

  unlock(): void {
    if (this.unlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    // Uma frase vazia dita a partir do toque conta como autorização para todas
    // as seguintes. Não se ouve nada.
    const primer = new SpeechSynthesisUtterance('')
    primer.volume = 0
    window.speechSynthesis.speak(primer)
    this.unlocked = true
    this.emit()
  }

  speak(text: string): void {
    if (!this.ready || !text.trim()) return
    const synth = window.speechSynthesis
    // Uma assistente que acumula frases fala por cima de si própria e da
    // pessoa. A última coisa que há para dizer é sempre a única que interessa.
    synth.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = this.voice
    utterance.lang = this.voice?.lang ?? 'pt-PT'
    // Ligeiramente mais devagar do que a predefinição: numa loja com música e
    // conversa, a velocidade normal perde-se.
    utterance.rate = 0.95
    utterance.pitch = 1.05
    utterance.onstart = () => {
      this.speaking = true
      this.emit()
    }
    const done = () => {
      this.speaking = false
      this.emit()
    }
    utterance.onend = done
    utterance.onerror = done
    synth.speak(utterance)
  }

  stop(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    this.speaking = false
    this.emit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

/** Voz que não fala. Para quando não há síntese e para os testes. */
class SilentVoice implements Voice {
  ready = false
  speaking = false
  unlock(): void {}
  speak(): void {}
  stop(): void {}
  subscribe(): () => void {
    return () => {}
  }
}

let voice: Voice | null = null

export function getVoice(): Voice {
  if (!voice) {
    voice =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? new WebSpeechVoice()
        : new SilentVoice()
  }
  return voice
}

export function setVoice(next: Voice): void {
  voice?.stop()
  voice = next
}
