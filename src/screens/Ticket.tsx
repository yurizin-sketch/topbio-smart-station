import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, QrCode } from '../components/ui'
import { useSession } from '../state/session'
import { formatPrice } from '../config'
import { getGateway } from '../services/payments'
import { legal } from '../data/legal'
import type { PaymentIntent } from '../services/payments'

/**
 * Ticket para pagamento ao balcão.
 *
 * A estação fica à porta da loja, por isso este ecrã não pode prender a
 * pessoa: emite o código, reserva a unidade e liberta o ecrã. Quem confirma o
 * pagamento é o funcionário, na página de staff — nunca este ecrã.
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
        <div className="panel" style={{ textAlign: 'center' }}>
          {intent?.ticketCode ? (
            <>
              <strong className="ticket-code">{intent.ticketCode}</strong>
              <QrCode value={intent.ticketCode} size={280} />
            </>
          ) : (
            <div className="notice notice--info">A emitir o código…</div>
          )}
        </div>

        <div className="panel">
          <p className="section-label">O seu pedido</p>
          <h2 className="card__title">{product.name}</h2>
          <p className="price" style={{ marginTop: 'var(--tne-space-sm)' }}>
            {formatPrice(order.amountCents)}
          </p>

          {minutesLeft !== null && (
            <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-lg)' }}>
              {/*
                Só prometemos reserva quando há mesmo um compartimento preso a
                esta encomenda. Ao balcão o produto está em loja e não é preciso
                assustar ninguém com um cronómetro.
              */}
              {order.fulfilment === 'machine'
                ? `Reservámos a sua unidade durante ${minutesLeft} minuto${minutesLeft === 1 ? '' : 's'}.`
                : `Código válido durante ${minutesLeft} minuto${minutesLeft === 1 ? '' : 's'}. Se expirar, é só voltar aqui.`}
            </div>
          )}

          <ol className="subtitle" style={{ paddingLeft: '1.2em' }}>
            <li>Entre na loja e diga o código ao balcão.</li>
            <li>Faça o pagamento com o nosso colega.</li>
            <li>Levanta o produto no momento.</li>
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
