import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { config } from '../config'
import { useSession } from './session'
import { track } from '../services/telemetry'

/**
 * Devolve a estação ao ecrã de atração quando ninguém lhe toca.
 *
 * Sem isto, uma pessoa que desiste a meio deixa a escolha dela no ecrã, e a
 * seguinte encontra uma sessão a meio que não é sua — no ecrã de pagamento,
 * isso é pior do que feio.
 *
 * O ecrã de atração e o de sucesso ficam de fora: um já é o estado de repouso,
 * o outro tem o seu próprio temporizador e não deve ser interrompido enquanto
 * o produto está a ser despachado.
 *
 * O /staff também: não é sessão de cliente nenhum. Um funcionário que estivesse
 * a contar dinheiro e visse o painel fugir para o ecrã de atração ao fim de 90
 * segundos teria de repetir o login a cada atendimento.
 */
const EXEMPT = new Set(['/kiosk', '/success', '/staff'])

export function useIdleReset(): void {
  const navigate = useNavigate()
  const location = useLocation()
  const { reset } = useSession()
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const path = location.pathname

  useEffect(() => {
    if (EXEMPT.has(path)) return

    const bump = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        track({ type: 'session_timeout', screen: path })
        reset()
        navigate('/kiosk', { replace: true })
      }, config.idleTimeoutMs)
    }

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    bump()

    return () => {
      clearTimeout(timer.current)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [path, navigate, reset])
}
