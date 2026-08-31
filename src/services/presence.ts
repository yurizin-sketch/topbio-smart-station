/**
 * Saber que está alguém à frente do tablet.
 *
 * A assistente tem de falar antes de a pessoa tocar em nada — senão não é uma
 * assistente, é um botão. Por isso a estação precisa de perceber sozinha que
 * alguém parou à frente dela.
 *
 * COMO: câmara frontal do tablet, a comparar a imagem com o vazio.
 *
 * Não é reconhecimento de pessoas. Não guarda imagem nenhuma, não envia nada
 * para lado nenhum e nunca mostra o vídeo. O que sai daqui é um único bit —
 * "está alguém" / "não está" — calculado dentro do próprio tablet. A imagem
 * vive uns milissegundos num canvas de 96x72 e é apagada pela seguinte.
 *
 * PORQUE NÃO É SÓ "DETETAR MOVIMENTO": quem para à frente de um ecrã fica
 * quase quieto. Comparar cada imagem com a anterior daria "ninguém" dois
 * segundos depois de a pessoa chegar — exatamente ao contrário do que
 * queremos. Por isso guardamos um retrato do balcão vazio e comparamos com
 * esse: uma pessoa parada continua a ser diferente do vazio para sempre.
 *
 * O retrato do vazio actualiza-se devagar enquanto não está ninguém, para o
 * sol da tarde e as luzes da loja não passarem por cliente.
 */

/** O que a câmara conclui. Um bit e um número para diagnóstico. */
export interface PresenceReading {
  near: boolean
  /** Fração do enquadramento diferente do balcão vazio. 0 a 1. */
  occupancy: number
}

export interface PresenceDetector {
  /** Pede a câmara e começa a observar. Silencioso se já estiver a correr. */
  start(): Promise<void>
  stop(): void
  subscribe(fn: (reading: PresenceReading) => void): () => void
  /** Porque é que não está a funcionar. `null` = está bom. */
  readonly failure: string | null
}

/** Botões para afinar na loja sem mexer no algoritmo. */
export interface PresenceTuning {
  /** Quanto tempo a pessoa tem de ficar à frente antes de a saudarmos. */
  dwellMs: number
  /** Quanto tempo o balcão tem de estar vazio antes de darmos a pessoa por ida. */
  leaveMs: number
  /** Fração do ecrã ocupada a partir da qual há alguém. */
  enterRatio: number
  /** Abaixo disto o balcão está vazio. Mais baixo que `enterRatio` de propósito:
   *  sem esta folga a assistente ligava e desligava com a pessoa a respirar. */
  leaveRatio: number
  /** Diferença de luz que conta como "este pixel mudou". 0-255. */
  pixelDelta: number
  /** Imagens por segundo. Baixo porque isto corre o dia todo com bateria. */
  fps: number
  /**
   * Fim de linha para presenças eternas.
   *
   * Se alguém deixar uma caixa em frente à câmara, o balcão fica "ocupado"
   * para sempre e a estação nunca mais saúda ninguém. Passado este tempo sem
   * ninguém tocar no ecrã, esquecemos o retrato antigo e recomeçamos.
   */
  stuckMs: number
}

export const defaultTuning: PresenceTuning = {
  dwellMs: 2_000,
  leaveMs: 4_000,
  enterRatio: 0.18,
  leaveRatio: 0.1,
  pixelDelta: 26,
  fps: 5,
  stuckMs: 3 * 60_000,
}

const WIDTH = 96
const HEIGHT = 72
const PIXELS = WIDTH * HEIGHT

/** Com que rapidez o retrato do vazio acompanha a luz da loja. */
const BACKGROUND_BLEND = 0.05

class CameraPresence implements PresenceDetector {
  failure: string | null = null

  private tuning: PresenceTuning
  private listeners = new Set<(r: PresenceReading) => void>()
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private timer: number | null = null

  /** O balcão vazio, em luminância. `null` até à primeira imagem. */
  private background: Float32Array | null = null
  private near = false
  /** Desde quando é que a leitura está do outro lado da fronteira. */
  private since = 0
  private nearSince = 0

  constructor(tuning: PresenceTuning = defaultTuning) {
    this.tuning = tuning
  }

  async start(): Promise<void> {
    if (this.stream || typeof navigator === 'undefined') return
    if (!navigator.mediaDevices?.getUserMedia) {
      this.failure = 'Este dispositivo não expõe câmara ao navegador.'
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
    } catch (error) {
      // O caso normal é a pessoa ao balcão ainda não ter dado autorização.
      // Não é uma avaria: a estação continua a funcionar ao toque.
      this.failure =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Câmara por autorizar. A estação funciona ao toque.'
          : 'Câmara indisponível. A estação funciona ao toque.'
      return
    }

    const video = document.createElement('video')
    video.srcObject = this.stream
    video.muted = true
    video.playsInline = true
    await video.play().catch(() => undefined)
    this.video = video

    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    // `willReadFrequently` evita que o browser mande o canvas para a GPU: aqui
    // só lemos pixels, nunca desenhamos no ecrã, e a viagem de volta é cara.
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })

    this.failure = null
    this.timer = window.setInterval(() => this.tick(), 1000 / this.tuning.fps)
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.video = null
    this.ctx = null
    this.background = null
    this.near = false
  }

  subscribe(fn: (reading: PresenceReading) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Esquece o balcão vazio e volta a aprendê-lo. */
  reseed(): void {
    this.background = null
    this.near = false
    this.since = 0
  }

  private tick(): void {
    const { video, ctx } = this
    if (!video || !ctx || video.readyState < 2) return

    ctx.drawImage(video, 0, 0, WIDTH, HEIGHT)
    const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT)

    // Luminância em vez de RGB: uma pessoa muda o brilho de onde está, e um
    // canal só é três vezes menos contas para a mesma resposta.
    const frame = new Float32Array(PIXELS)
    for (let i = 0; i < PIXELS; i++) {
      const p = i * 4
      frame[i] = 0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0)
    }

    if (!this.background) {
      // Primeira imagem: assumimos que o balcão está vazio. Se estiver alguém
      // à frente no arranque, o `stuckMs` desfaz o engano sozinho.
      this.background = frame
      return
    }

    const background = this.background
    let changed = 0
    for (let i = 0; i < PIXELS; i++) {
      if (Math.abs((frame[i] ?? 0) - (background[i] ?? 0)) > this.tuning.pixelDelta) changed++
    }
    const occupancy = changed / PIXELS

    const now = Date.now()
    const { dwellMs, leaveMs, enterRatio, leaveRatio, stuckMs } = this.tuning

    if (!this.near) {
      if (occupancy >= enterRatio) {
        if (!this.since) this.since = now
        if (now - this.since >= dwellMs) {
          this.near = true
          this.nearSince = now
          this.since = 0
          this.emit({ near: true, occupancy })
          return
        }
      } else {
        this.since = 0
        // Só aprendemos o balcão com o balcão vazio. Aprendê-lo com gente à
        // frente seria ensinar à estação que aquela pessoa é mobiliário.
        for (let i = 0; i < PIXELS; i++) {
          const learnt = background[i] ?? 0
          background[i] = learnt + ((frame[i] ?? 0) - learnt) * BACKGROUND_BLEND
        }
      }
    } else {
      if (occupancy <= leaveRatio) {
        if (!this.since) this.since = now
        if (now - this.since >= leaveMs) {
          this.near = false
          this.since = 0
          this.emit({ near: false, occupancy })
          return
        }
      } else {
        this.since = 0
        if (now - this.nearSince >= stuckMs) this.reseed()
      }
    }

    this.emit({ near: this.near, occupancy })
  }

  private emit(reading: PresenceReading): void {
    this.listeners.forEach((fn) => fn(reading))
  }
}

/**
 * Detetor que nunca vê ninguém.
 *
 * É o que corre quando não há câmara, quando ninguém autorizou, e nos testes.
 * A estação inteira continua a funcionar: perde a saudação automática, ganha
 * o toque no ecrã de sempre.
 */
class NoPresence implements PresenceDetector {
  failure = 'Deteção de presença desligada.'
  async start(): Promise<void> {}
  stop(): void {}
  subscribe(): () => void {
    return () => {}
  }
}

let detector: PresenceDetector | null = null

export function getPresence(): PresenceDetector {
  if (!detector) {
    detector =
      typeof window !== 'undefined' && typeof document !== 'undefined'
        ? new CameraPresence()
        : new NoPresence()
  }
  return detector
}

/** Para trocar por hardware a sério (sensor PIR, por exemplo) sem tocar no resto. */
export function setPresence(next: PresenceDetector): void {
  detector?.stop()
  detector = next
}
