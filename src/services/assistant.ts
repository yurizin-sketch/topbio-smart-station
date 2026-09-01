import type { GoalId } from '../types'
import { config } from '../config'

/**
 * O cérebro da assistente.
 *
 * Duas implementações, a mesma interface:
 *
 * - `ScriptedAssistant` — falas escritas por nós. Não precisa de internet, não
 *   custa nada e nunca diz nada que não esteja aqui. É o que corre quando não
 *   há servidor configurado e é a rede de segurança quando o servidor falha.
 * - `HttpAssistant` — fala com o nosso servidor, que por sua vez fala com o
 *   modelo. A chave da API nunca passa por aqui: este repositório é público e
 *   uma chave em código público é uma chave gasta por estranhos.
 *
 * A REGRA QUE NÃO SE NEGOCEIA: nada do que a assistente diz pode prometer que
 * um suplemento cura, trata ou previne seja o que for. Não é preferência de
 * estilo, é o Regulamento (CE) 1924/2006 e vale para as falas escritas e para
 * o modelo. No servidor a regra vai no system prompt; aqui vai na revisão de
 * cada linha. Uma assistente entusiasmada é o caminho mais curto para uma
 * coima.
 */

/** O que a assistente sabe do momento em que está a falar. */
export interface AssistantContext {
  /** Onde está o cliente: 'attract', 'goals', 'recommendations', … */
  screen: string
  goal: GoalId | null
  /** O que está no ecrã. O modelo escolhe daqui e não inventa catálogo. */
  visible: { id: string; name: string; priceCents: number }[]
  /** O produto aberto, se houver. */
  productId: string | null
}

/** Uma resposta tocável. Num tablet vale mais que um teclado. */
export interface AssistantChoice {
  label: string
  /** O que dizer ao cérebro se a pessoa tocar aqui. */
  value: string
}

export interface AssistantTurn {
  /** A frase. Vai para o balão e para a voz, tal e qual. */
  say: string
  choices: AssistantChoice[]
  /** Levar o cliente a este objetivo, se ele concordar. */
  goal?: GoalId | null
  /** Realçar estes produtos no ecrã. Ids do nosso catálogo, nunca inventados. */
  highlight?: string[]
}

export interface Assistant {
  /** Primeira frase, quando alguém chega. */
  greet(context: AssistantContext): Promise<AssistantTurn>
  /** A pessoa tocou numa resposta ou mudou de ecrã. */
  reply(context: AssistantContext, said: string): Promise<AssistantTurn>
  /** Recomeçar do zero. Cliente novo, conversa nova. */
  forget(): void
}

/* ──────────────────────────────────────────────────────────────────────────
   Falas escritas

   Atenção ao idioma: **só o que a Cláudia diz é português do Brasil**. Foi escolha
   da loja e combina com a voz dela (ver `pickVoice` em `voice.ts`). Todo o
   resto — botões, títulos, avisos, a tarja legal — continua em português
   europeu, porque é a estação a falar com clientes portugueses, não ela.

   Ou seja: aqui dentro escreve-se "tela", "você está vendo", "o app". Em
   qualquer outro ficheiro escreve-se "ecrã", "está a ver", "a app".
   ────────────────────────────────────────────────────────────────────────── */

const OPENINGS: [string, ...string[]] = [
  'Oi! Eu sou a Cláudia. Posso te ajudar a escolher?',
  'Bem-vindo à TopBio. Quer que eu te ajude a escolher?',
  'Oi! Se quiser, eu te ajudo a achar o que você procura.',
]

const GOAL_CHOICES: AssistantChoice[] = [
  { label: 'Dormir melhor', value: 'sono' },
  { label: 'Mais energia', value: 'energia' },
  { label: 'Treino', value: 'performance' },
  { label: 'Só quero ver', value: 'browse' },
]

/**
 * As falas de cada ecrã.
 *
 * Escritas para serem ouvidas, não lidas: frases curtas, sem parênteses, sem
 * listas. E sem uma única promessa de efeito — nota-se que dizem "para a sua
 * rotina" e nunca "para o seu problema".
 */
const LINES: Record<string, string> = {
  attract: 'Oi! Eu sou a Cláudia. Posso te ajudar a escolher?',
  goals: 'Me diz o que você procura que eu mostro as opções da casa.',
  recommendations: 'Aqui está o que a gente tem pra isso. Quer saber mais de algum?',
  catalog: 'Esse é o catálogo todo. Se preferir, me diz o que você procura.',
  product: 'Se quiser levar, é só tocar em comprar. Você retira no balcão.',
  checkout: 'Você pode pagar por MB WAY ou no balcão. Como prefere?',
  mbway: 'Leia o código com o app MB WAY. Eu espero.',
  ticket: 'Leve esse código no balcão. O colega resolve o resto.',
  success: 'Está pago. Mostre o comprovante no balcão e é seu.',
}

class ScriptedAssistant implements Assistant {
  private opening = 0

  async greet(_context: AssistantContext): Promise<AssistantTurn> {
    const say = OPENINGS[this.opening % OPENINGS.length] ?? OPENINGS[0]
    this.opening++
    return { say, choices: GOAL_CHOICES }
  }

  async reply(context: AssistantContext, said: string): Promise<AssistantTurn> {
    const known = LINES[context.screen]
    if (said === 'browse') {
      return { say: 'Claro. Fique à vontade, estou aqui se precisar.', choices: [] }
    }
    // A fala do ecrã onde a pessoa está. Se for um ecrã sem fala escrita,
    // calamo-nos: uma assistente que fala por falar é pior que uma calada.
    return { say: known ?? '', choices: [] }
  }

  forget(): void {
    this.opening = 0
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Modelo, através do nosso servidor
   ────────────────────────────────────────────────────────────────────────── */

interface WireTurn {
  say?: unknown
  choices?: unknown
  goal?: unknown
  highlight?: unknown
}

/** O que o servidor devolve não é de confiança até passar por aqui. */
function parseTurn(raw: unknown): AssistantTurn | null {
  if (!raw || typeof raw !== 'object') return null
  const wire = raw as WireTurn
  if (typeof wire.say !== 'string' || !wire.say.trim()) return null

  const choices: AssistantChoice[] = Array.isArray(wire.choices)
    ? wire.choices
        .filter(
          (c): c is AssistantChoice =>
            !!c &&
            typeof (c as AssistantChoice).label === 'string' &&
            typeof (c as AssistantChoice).value === 'string',
        )
        // Quatro botões é o que cabe sem o ecrã virar um formulário.
        .slice(0, 4)
    : []

  return {
    say: wire.say.trim(),
    choices,
    goal: typeof wire.goal === 'string' ? (wire.goal as GoalId) : null,
    highlight: Array.isArray(wire.highlight)
      ? wire.highlight.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

class HttpAssistant implements Assistant {
  private history: { role: 'assistant' | 'user'; content: string }[] = []
  private fallback = new ScriptedAssistant()

  constructor(private endpoint: string) {}

  greet(context: AssistantContext): Promise<AssistantTurn> {
    return this.ask(context, null)
  }

  reply(context: AssistantContext, said: string): Promise<AssistantTurn> {
    return this.ask(context, said)
  }

  forget(): void {
    this.history = []
    this.fallback.forget()
  }

  private async ask(context: AssistantContext, said: string | null): Promise<AssistantTurn> {
    if (said) this.history.push({ role: 'user', content: said })

    // Um cliente não espera. Passado o tempo limite ficamos com a fala escrita,
    // que é pior mas chega sempre — melhor uma frase modesta agora do que uma
    // frase brilhante com a pessoa já a sair pela porta.
    const abort = new AbortController()
    const timeout = window.setTimeout(() => abort.abort(), config.assistant.timeoutMs)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          context,
          // Só a parte recente. A conversa de um quiosque dura um minuto e
          // mandar tudo é pagar tokens por coisa nenhuma.
          history: this.history.slice(-config.assistant.historyTurns),
        }),
      })
      if (!response.ok) throw new Error(`assistente respondeu ${response.status}`)

      const turn = parseTurn(await response.json())
      if (!turn) throw new Error('resposta da assistente ilegível')

      this.history.push({ role: 'assistant', content: turn.say })
      return turn
    } catch {
      return said === null ? this.fallback.greet(context) : this.fallback.reply(context, said)
    } finally {
      window.clearTimeout(timeout)
    }
  }
}

let assistant: Assistant | null = null

export function getAssistant(): Assistant {
  if (!assistant) {
    const url = config.assistant.endpoint
    assistant = url ? new HttpAssistant(url) : new ScriptedAssistant()
  }
  return assistant
}

export function setAssistant(next: Assistant): void {
  assistant = next
}

/** A estação está a falar com o modelo, ou só a debitar falas escritas. */
export function assistantIsLive(): boolean {
  return Boolean(config.assistant.endpoint)
}
