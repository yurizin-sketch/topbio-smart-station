import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { formatPrice } from '../config'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { PaymentMethod } from '../types'

/**
 * Escolha do método de pagamento.
 *
 * Dois caminhos, e ambos acabam no mesmo balcão — muda só onde o dinheiro
 * passa:
 *  · MB WAY — paga no ecrã e vai buscar o produto já pago.
 *  · Balcão — para quem prefere pagar a uma pessoa (ou não usa MB WAY).
 *    Emite uma ficha, reserva a unidade e o pagamento acontece ao balcão.
 */
export function Payment() {
  const navigate = useNavigate()
  const { product, createOrder } = useSession()

  useEffect(() => {
    if (!product) navigate('/goals', { replace: true })
  }, [product, navigate])

  if (!product) return null

  const choose = (method: PaymentMethod) => {
    createOrder(method)
    track({ type: 'checkout_started', productId: product.id, method })
    navigate(method === 'mbway' ? '/checkout/mbway' : '/checkout/ticket')
  }

  return (
    <Frame
      legal={legal.supplement}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => navigate(`/product/${product.id}`)}
            label="Voltar"
          >
            ←
          </Button>
          <Button variant="ghost" onClick={() => navigate('/kiosk')} label="Recomeçar">
            ⟳
          </Button>
        </>
      }
    >
      <p className="eyebrow">Pagamento</p>
      <h1 className="title">Como prefere pagar?</h1>
      <p className="subtitle">
        {product.name} · {formatPrice(product.priceCents)}
      </p>

      <div className="grid grid--pair">
        <button type="button" className="card" onClick={() => choose('mbway')}>
          <span className="card__icon" aria-hidden="true">
            📱
          </span>
          <h2 className="card__title">MB WAY</h2>
          <p className="card__text">
            Leia o QR com a app MB WAY e confirme. Depois levanta o produto ao
            balcão, já pago.
          </p>
        </button>

        <button type="button" className="card" onClick={() => choose('counter')}>
          <span className="card__icon" aria-hidden="true">
            🎟️
          </span>
          <h2 className="card__title">Pagar na loja</h2>
          <p className="card__text">
            Geramos uma ficha. Leve-a ao balcão, pague lá e levante o produto no
            momento.
          </p>
        </button>
      </div>
    </Frame>
  )
}
