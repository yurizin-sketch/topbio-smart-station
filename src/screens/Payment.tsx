import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { fulfilmentFor } from '../services/catalog'
import { formatPrice } from '../config'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { PaymentMethod } from '../types'

/**
 * Escolha do método de pagamento.
 *
 * Dois caminhos, porque a estação fica à porta da loja:
 *  · MB WAY — resolve tudo no ecrã, sem falar com ninguém.
 *  · Balcão — para quem prefere pagar a uma pessoa (ou não usa MB WAY).
 *    Emite um código, reserva a unidade e o pagamento acontece lá dentro.
 */
export function Payment() {
  const navigate = useNavigate()
  const { product, createOrder } = useSession()

  useEffect(() => {
    if (!product) navigate('/goals', { replace: true })
  }, [product, navigate])

  if (!product) return null

  const mode = fulfilmentFor(product)

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
            Leia o QR com a app MB WAY e confirme.{' '}
            {mode === 'machine'
              ? 'O produto sai aqui na estação.'
              : 'Depois levanta o produto na loja.'}
          </p>
        </button>

        <button type="button" className="card" onClick={() => choose('counter')}>
          <span className="card__icon" aria-hidden="true">
            🎟️
          </span>
          <h2 className="card__title">Pagar na loja</h2>
          <p className="card__text">
            Geramos um código. Leve-o ao balcão, pague lá e levanta o produto no
            momento.
          </p>
        </button>
      </div>
    </Frame>
  )
}
