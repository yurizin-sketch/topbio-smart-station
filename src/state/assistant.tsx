import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { config } from '../config'
import {
  getAssistant,
  WELCOME,
  OPENING_STEPS,
  type AssistantChoice,
  type AssistantTurn,
} from '../services/assistant'
import { getPresence } from '../services/presence'
import { getVoice } from '../services/voice'
import { track } from '../services/telemetry'
import { useSession } from './session'
import type { GoalId } from '../types'

/**
 * A assistente, ligada ao resto da estação.
 *
 * Junta três peças que não se conhecem umas às outras: a câmara diz que chegou
 * alguém, o cérebro diz o que responder, a voz diz em voz alta. Aqui decide-se
 * *quando* é que cada uma entra — e sobretudo quando é que se calam, que é a
 * parte difícil de uma máquina que fala numa loja.
 */

/** O nome do ecrã, tal como o cérebro o conhece. */
function screenOf(pathname: string): string {
  if (pathname.startsWith('/product/')) return 'product'
  const name = pathname.replace(/^\//, '').replace(/\//g, '-')
  if (!name || name === 'kiosk') return 'attract'
  if (name === 'checkout-mbway') return 'mbway'
  if (name === 'checkout-ticket') return 'ticket'
  if (name === 'checkout-success' || name === 'success') return 'success'
  return name
}

interface AssistantApi {
  /** O que ela está a dizer agora. `null` = calada, sem balão no ecrã. */
  turn: AssistantTurn | null
  /** Está a formular a resposta. */
  thinking: boolean
  /** A boca mexe enquanto isto for verdade. */
  speaking: boolean
  /** O funcionário desligou o som. Ela continua a escrever no balão. */
  muted: boolean
  /** A voz do tablet ainda não foi destrancada por um toque. */
  needsUnlock: boolean
  /** Está alguém à frente da câmara. `null` = sem câmara. */
  present: boolean | null
  /** Porque é que a câmara não está a ver. */
  presenceFailure: string | null
  say(said: string): void
  /** O cliente tocou nela a pedir ajuda. Recomeça a conversa. */
  summon(): void
  choose(choice: AssistantChoice): void
  dismiss(): void
  toggleMute(): void
}

const AssistantContext = createContext<AssistantApi | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { products, goal, product, selectGoal } = useSession()

  const [turn, setTurn] = useState<AssistantTurn | null>(null)
  const [thinking, setThinking] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [present, setPresent] = useState<boolean | null>(null)
  const [presenceFailure, setPresenceFailure] = useState<string | null>(null)

  const screen = screenOf(location.pathname)
  const voice = getVoice()
  const brain = getAssistant()

  // O contexto muda a cada render mas só interessa no momento em que se fala.
  // Numa ref, não dispara efeitos; num estado, disparava todos.
  const contextRef = useRef({ screen, goal, products, product })
  contextRef.current = { screen, goal, products, product }

  const lastGreetRef = useRef(0)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  /** Diz a frase: balão sempre, voz só se houver voz e som ligado. */
  const perform = useCallback(
    (next: AssistantTurn) => {
      setTurn(next)
      if (!mutedRef.current) voice.speak(next.say)
    },
    [voice],
  )

  const ask = useCallback(
    async (said: string | null) => {
      const { screen: s, goal: g, products: all, product: open } = contextRef.current
      const context = {
        screen: s,
        goal: g,
        productId: open?.id ?? null,
        // O que está no ecrã, para o modelo escolher daqui e não inventar.
        visible: all.slice(0, 24).map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
        })),
      }

      // A abertura da casa não passa pelo modelo: é sempre a mesma, sai no
      // instante e não depende de a rede estar boa àquela hora. Ver `WELCOME`
      // em `services/assistant.ts` -- a conversa a sério começa a partir dali.
      if (said === null) {
        perform(WELCOME.inicio)
        return WELCOME.inicio
      }
      const opening = OPENING_STEPS[said]
      if (opening) {
        perform(opening)
        return opening
      }

      setThinking(true)
      try {
        const next = await brain.reply(context, said)
        // Uma resposta vazia é uma resposta: significa "não tenho nada a
        // acrescentar neste ecrã". Melhor calar do que encher.
        if (next.say) perform(next)
        else setTurn(null)
        return next
      } finally {
        setThinking(false)
      }
    },
    [brain, perform],
  )

  /* ── A voz precisa de um toque para o dia inteiro ──────────────────────── */

  useEffect(() => {
    if (unlocked) return
    const unlock = () => {
      voice.unlock()
      setUnlocked(true)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [voice, unlocked])

  useEffect(() => voice.subscribe(() => setSpeaking(voice.speaking)), [voice])

  /* ── A câmara ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Só depois do primeiro toque.
    //
    // Duas razões. A do navegador: pedir a câmara sem ninguém ter tocado em
    // nada é o padrão que o Chrome trata como abusivo e bloqueia. A da loja:
    // assim a autorização aparece a quem abre a porta de manhã, e não a um
    // cliente que se aproximou para ver um preço. Autorizada uma vez, o
    // navegador não volta a perguntar.
    if (!unlocked) return

    const presence = getPresence()
    let live = true

    presence.start().then(() => {
      if (!live) return
      setPresenceFailure(presence.failure)
      if (!presence.failure) setPresent(false)
    })

    const off = presence.subscribe((reading) => {
      if (!live) return
      setPresent(reading.near)
    })

    return () => {
      live = false
      off()
      presence.stop()
    }
  }, [unlocked])

  /* ── Chegou alguém ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (present !== true) return
    // Só saudamos quem chega ao ecrã de repouso. Interromper alguém a meio de
    // um pagamento porque a câmara se entusiasmou seria assustador.
    if (contextRef.current.screen !== 'attract') return

    const now = Date.now()
    if (now - lastGreetRef.current < config.assistant.greetCooldownMs) return
    lastGreetRef.current = now

    track({ type: 'assistant_greeted' })
    void ask(null)
  }, [present, ask])

  /* ── Mudou de ecrã ────────────────────────────────────────────────────── */

  const greetedScreenRef = useRef<string | null>(null)
  useEffect(() => {
    if (screen === greetedScreenRef.current) return
    greetedScreenRef.current = screen

    if (screen === 'attract') {
      // Volta ao repouso: cliente novo a caminho, conversa limpa.
      voice.stop()
      setTurn(null)
      brain.forget()
      return
    }
    void ask(`__ecra__:${screen}`)
  }, [screen, ask, brain, voice])

  /* ── O que o cliente responde ─────────────────────────────────────────── */

  const say = useCallback(
    (said: string) => {
      void ask(said)
    },
    [ask],
  )

  // Tocar na personagem é o caminho de quem não espera pela câmara — e de quem
  // lhe fechou o balão e se arrependeu. Volta ao princípio da conversa, com as
  // opções todas, porque quem pede ajuda quer escolhas e não um comentário.
  const summon = useCallback(() => {
    lastGreetRef.current = Date.now()
    void ask(null)
  }, [ask])

  const choose = useCallback(
    (choice: AssistantChoice) => {
      track({ type: 'assistant_choice', value: choice.value })

      // Uma escolha que é um objetivo leva o cliente lá. É para isto que ela
      // serve: encurtar o caminho, não comentá-lo.
      if (isGoalId(choice.value)) {
        selectGoal(choice.value)
        navigate('/recommendations')
        return
      }
      if (choice.value === 'browse') {
        navigate('/catalog')
        return
      }
      void ask(choice.value)
    },
    [ask, navigate, selectGoal],
  )

  const dismiss = useCallback(() => {
    voice.stop()
    setTurn(null)
  }, [voice])

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      if (!was) voice.stop()
      return !was
    })
  }, [voice])

  const api = useMemo<AssistantApi>(
    () => ({
      turn,
      thinking,
      speaking,
      muted,
      needsUnlock: !unlocked,
      present,
      presenceFailure,
      say,
      summon,
      choose,
      dismiss,
      toggleMute,
    }),
    [
      turn,
      thinking,
      speaking,
      muted,
      unlocked,
      present,
      presenceFailure,
      say,
      summon,
      choose,
      dismiss,
      toggleMute,
    ],
  )

  return <AssistantContext.Provider value={api}>{children}</AssistantContext.Provider>
}

const GOAL_IDS: GoalId[] = [
  'sono',
  'energia',
  'performance',
  'beleza',
  'imunidade',
  'peso',
  'foco',
  'mobilidade',
]

function isGoalId(value: string): value is GoalId {
  return (GOAL_IDS as string[]).includes(value)
}

export function useAssistant(): AssistantApi {
  const api = useContext(AssistantContext)
  if (!api) throw new Error('useAssistant fora do AssistantProvider')
  return api
}
