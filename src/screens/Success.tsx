import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { config } from '../config'
import { getDispenser } from '../services/dispenser'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'

type Phase = 'dispensing' | 'done' | 'pickup' | 'failed'

/**
 * Pós-pagamento.
 *
 * Só se chega aqui com a encomenda em `paid`, confirmada pelo servidor.
 *
 * Dois desfechos possíveis:
 *  · máquina — abre o compartimento e o produto cai ali;
 *  · balcão  — o produto não está carregado, o cliente já pagou e leva um
 *              código para levantar lá dentro.
 *
 * Se o motor falhar, o dinheiro já entrou. O ecrã de erro tem de dizer
 * exatamente o que fazer a seguir, e não limitar-se a pedir desculpa.
 */
export function Success() {
  const navigate = useNavigate()
  const { product, order, reset, setOrderStatus } = useSession()
  const [phase, setPhase] = useState<Phase>('dispensing')
  const [seconds, setSeconds] = useState(Math.round(config.successResetMs / 1000))
  const started = useRef(false)

  const pickupCode = order ? order.id.slice(0, 6).toUpperCase() : ''

  useEffect(() => {
    if (!order || !product) {
      navigate('/kiosk', { replace: true })
      return
    }
    // React 18 em modo estrito corre os efeitos duas vezes. Um despacho a
    // dobrar entrega dois produtos por um pagamento.
    if (started.current) return
    started.current = true

    if (order.fulfilment === 'counter' || !order.slotId) {
      setOrderStatus('paid')
      setPhase('pickup')
      return
    }

    const slotId = order.slotId
    setOrderStatus('dispensing')
    void getDispenser()
      .dispense(slotId)
      .then((result) => {
        if (result.ok) {
          track({ type: 'dispense_ok', slotId })
          setOrderStatus('dispensed')
          setPhase('done')
        } else {
          track({ type: 'dispense_failed', slotId, reason: result.reason })
          setOrderStatus('failed')
          setPhase('failed')
        }
      })
  }, [order, product, navigate, setOrderStatus])

  // A contagem só arranca quando o produto já saiu. Reiniciar a estação com
  // uma pessoa à espera de um erro por resolver seria perder o cliente.
  useEffect(() => {
    if (phase !== 'done') return
    const id = setInterval(() => setSeconds((s) => s - 1), 1000)
    const done = setTimeout(() => {
      reset()
      navigate('/kiosk')
    }, config.successResetMs)
    return () => {
      clearInterval(id)
      clearTimeout(done)
    }
  }, [phase, navigate, reset])

  if (!order || !product) return null

  const finish = () => {
    reset()
    navigate('/kiosk')
  }

  return (
    <Frame dark bare legal={legal.supplement}>
      <div className="finish">
        {phase === 'dispensing' && (
          <>
            <span className="finish__seal" aria-hidden="true">
              ↓
            </span>
            <p className="eyebrow">Pagamento confirmado</p>
            <h1 className="display">A preparar…</h1>
            <p className="subtitle" style={{ maxWidth: '26ch' }}>
              O compartimento {order.slotId} está a abrir. Não se afaste.
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <span className="finish__seal" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">Compra concluída</p>
            <h1 className="display">Obrigado!</h1>
            <p className="subtitle" style={{ maxWidth: '26ch' }}>
              Retire o {product.name} na zona de entrega.
            </p>
            <p className="countdown">Nova sessão em {Math.max(0, seconds)}s</p>
          </>
        )}

        {phase === 'pickup' && (
          <>
            <span className="finish__seal" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">Pagamento confirmado</p>
            <h1 className="display">Está pago!</h1>
            <p className="subtitle" style={{ maxWidth: '32ch' }}>
              Entre na loja e mostre este código. Entregamos-lhe o {product.name} na
              hora.
            </p>
            <strong className="ticket-code">{pickupCode}</strong>
            <Button onClick={finish}>Já anotei, concluir</Button>
          </>
        )}

        {phase === 'failed' && (
          <>
            <span
              className="finish__seal"
              aria-hidden="true"
              style={{ background: '#A5382E', color: '#fff' }}
            >
              !
            </span>
            <p className="eyebrow">Precisamos de o ajudar</p>
            <h1 className="display">Produto preso</h1>
            <p className="subtitle" style={{ maxWidth: '32ch' }}>
              O pagamento foi bem-sucedido, mas o compartimento {order.slotId} não
              abriu. Vá ao balcão com este código e resolvemos já:
            </p>
            <strong className="ticket-code">{pickupCode}</strong>
            <Button variant="secondary" onClick={finish}>
              Concluir
            </Button>
          </>
        )}
      </div>
    </Frame>
  )
}
