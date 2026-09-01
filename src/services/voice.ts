/**
 * A voz da assistente.
 *
 * Há duas, e a interface existe precisamente para as poder trocar.
 *
 * A do tablet (Web Speech API) não custa nada, não precisa de internet e
 * responde no instante — mas usa as vozes instaladas no aparelho, e isso não se
 * controla daqui. O PC da loja só tem pt-PT: lê o texto brasileiro da Cláudia com
 * sotaque de Lisboa, e soa a robô.
 *
 * A do servidor (ElevenLabs, através do worker) soa a pessoa e é sempre a mesma
 * em qualquer aparelho, mas custa por caráter e demora uns instantes. É a que
 * usamos quando há worker configurado. A local fica por baixo a apanhar a fala
 * sempre que a de cima falha — ver `RemoteVoice`.
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

import { config } from '../config'

/** Preferência de vozes, da melhor para a pior. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Português do Brasil primeiro, por escolha da loja. Também é a voz
  // portuguesa mais fácil de encontrar: quase todo o Android e Chrome traz
  // pt-BR de origem, enquanto o pt-PT falta em muitos aparelhos.
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'pt-br') ??
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
    utterance.lang = this.voice?.lang ?? 'pt-BR'
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

/**
 * Silêncio de um quinto de segundo, para gastar a autorização do toque.
 *
 * O browser só deixa tocar som depois de a pessoa mexer no ecrã, e essa
 * autorização cola-se ao elemento `<audio>`, não ao documento. Tocamos isto no
 * primeiro toque do dia e guardamos o elemento para todas as falas seguintes.
 */
const SILENCE =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgIA='

/**
 * Voz do servidor (ElevenLabs, através do worker).
 *
 * Soa a pessoa e é sempre a mesma, venha o aparelho com as vozes que vier — o
 * PC da loja, por exemplo, só traz pt-PT e lia o texto brasileiro da Cláudia com
 * sotaque de Lisboa. Em troca custa por caráter e demora uns instantes.
 *
 * Por isso nunca anda sozinha: leva sempre a voz local ao lado e passa-lhe a
 * fala à primeira contrariedade — rede lenta, worker em baixo, chave sem saldo.
 * Quem está ao balcão ouve resposta na mesma, só que com outra voz.
 */
class RemoteVoice implements Voice {
  speaking = false

  private audio: HTMLAudioElement | null = null
  private unlocked = false
  private listeners = new Set<() => void>()
  private pending: AbortController | null = null
  /** Falas já pagas nesta sessão. A estação repete-se o dia todo. */
  private cache = new Map<string, string>()

  constructor(
    private readonly endpoint: string,
    private readonly fallback: Voice,
  ) {}

  get ready(): boolean {
    return this.unlocked || this.fallback.ready
  }

  unlock(): void {
    this.fallback.unlock()
    if (this.unlocked || typeof window === 'undefined') return

    const audio = new Audio()
    audio.preload = 'auto'
    audio.addEventListener('ended', () => this.settle())
    audio.addEventListener('error', () => this.settle())
    audio.src = SILENCE
    void audio.play().catch(() => {})

    this.audio = audio
    this.unlocked = true
    this.emit()
  }

  speak(text: string): void {
    const say = text.trim()
    if (!say) return

    this.stop()
    const audio = this.audio
    if (!audio) {
      this.fallback.speak(say)
      return
    }

    const cached = this.cache.get(say)
    if (cached) {
      this.play(audio, cached)
      return
    }

    const control = new AbortController()
    this.pending = control
    const timer = window.setTimeout(() => control.abort(), config.voice.timeoutMs)

    void fetch(new URL('speak', this.endpoint).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: say }),
      signal: control.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.blob()
      })
      .then((blob) => {
        if (control !== this.pending) return
        const url = URL.createObjectURL(blob)
        this.remember(say, url)
        this.play(audio, url)
      })
      .catch(() => {
        // Também cai aqui o nosso próprio abort. Se outra fala entrou pelo
        // meio, esta já não interessa a ninguém.
        if (control !== this.pending) return
        this.fallback.speak(say)
      })
      .finally(() => {
        window.clearTimeout(timer)
        if (control === this.pending) this.pending = null
      })
  }

  stop(): void {
    this.pending?.abort()
    this.pending = null
    this.fallback.stop()
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
    }
    this.settle()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private play(audio: HTMLAudioElement, url: string): void {
    audio.src = url
    this.speaking = true
    this.emit()
    void audio.play().catch(() => this.settle())
  }

  /**
   * Guarda a fala e deita fora a mais antiga quando o mapa enche.
   *
   * O `revokeObjectURL` não é zelo a mais: estas máquinas ficam ligadas semanas
   * seguidas e sem ele o áudio ia-se acumulando em memória até o tablet
   * engasgar a meio de uma venda.
   */
  private remember(text: string, url: string): void {
    this.cache.set(text, url)
    while (this.cache.size > config.voice.cacheEntries) {
      const oldest = this.cache.keys().next()
      if (oldest.done) break
      const stale = this.cache.get(oldest.value)
      if (stale) URL.revokeObjectURL(stale)
      this.cache.delete(oldest.value)
    }
  }

  private settle(): void {
    if (!this.speaking) return
    this.speaking = false
    this.emit()
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
    const local =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? new WebSpeechVoice()
        : new SilentVoice()
    // Havendo worker, a voz vem de lá: é sempre a mesma e é sempre brasileira,
    // independentemente do que o aparelho tenha instalado. A local fica
    // debaixo, pronta a apanhar a fala se a rede ou a chave falharem.
    voice = config.assistant.endpoint ? new RemoteVoice(config.assistant.endpoint, local) : local
  }
  return voice
}

export function setVoice(next: Voice): void {
  voice?.stop()
  voice = next
}
