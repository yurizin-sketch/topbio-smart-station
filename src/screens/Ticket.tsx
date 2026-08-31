import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Receipt } from '../components/ui'
import { useSession } from '../state/session'
import { getGateway } from '../services/payments'
import { legal } from '../data/legal'
import type { PaymentIntent } from '../services/payments'

/**
 * Ticket para pagamento ao balcão.
 *
 * A estação está dentro da loja e o balcão é a dois passos, por isso este ecrã
 * não pode prender a pessoa: emite o código, reserva a unidade e liberta o
 * ecrã. Quem confirma o pagamento é o funcionário, na página de staff — nunca
 * este ecrã.
 */
export function Ticket() {
  const navigate = useNavigate()
  const { product, order, updateOrder, reset } = useSession()
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!product || !order) {
      navigate('/goals', { replace: true })
      return
    }
    let alive = true
    void getGateway()
      .start(order)
      .then((result) => {
        if (!alive) return
        setIntent(result)
        updateOrder({
          status: 'awaiting_counter',
          ticketCode: result.ticketCode,
          expiresAt: result.expiresAt,
        })
      })
    return () => {
      alive = false
    }
    // Corre uma vez por encomenda: emitir um segundo ticket para a mesma
    // encomenda reservaria stock a dobrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  useEffect(() => {
    if (!intent) return
    const tick = () => {
      const ms = intent.expiresAt - Date.now()
      setMinutesLeft(Math.max(0, Math.ceil(ms / 60_000)))
    }
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [intent])

  if (!product || !order) return null

  const finish = () => {
    reset()
    navigate('/kiosk')
  }

  return (
    <Frame legal={legal.supplement}>
      <p className="eyebrow">Pagamento na loja</p>
      <h1 className="title">Leve este código ao balcão</h1>

      <div className="pay">
        <div>
          {intent?.ticketCode ? (
            <Receipt
              code={intent.ticketCode}
              order={order}
              productName={product.name}
              state="to_pay"
            />
          ) : (
            <div className="notice notice--info">A emitir a ficha…</div>
          )}
        </div>

        <div className="panel">
          {/* Produto e valor já estão na ficha ao lado. Repeti-los aqui punha o
              cliente a comparar dois sítios para ver se batia certo. */}
          <p className="section-label">Como levantar</p>

          {minutesLeft !== null && (
            <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-lg)' }}>
              {`Código válido durante ${minutesLeft} minuto${minutesLeft === 1 ? '' : 's'}. Se expirar, é só voltar aqui.`}
            </div>
          )}

          <ol className="subtitle" style={{ paddingLeft: '1.2em' }}>
            <li>Leve este código ao balcão.</li>
            <li>Faça o pagamento com o nosso colega.</li>
            <li>Levante o produto na hora.</li>
          </ol>

          <div style={{ marginTop: 'var(--tne-space-lg)' }}>
            <Button block onClick={finish}>
              Já anotei, concluir
            </Button>
          </div>
        </div>
      </div>
    </Frame>
  )
}
