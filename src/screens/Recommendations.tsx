import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvailabilityBadge, Button, Frame, ProductImage } from '../components/ui'
import { useSession } from '../state/session'
import { recommendFor } from '../services/catalog'
import { goalById } from '../data/goals'
import { formatPrice } from '../config'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { Product } from '../types'

export function Recommendations() {
  const navigate = useNavigate()
  const { goal, products, selectProduct } = useSession()

  // Aterrar aqui sem objetivo significa recarregar a página ou entrar pelo
  // URL: manda-se para trás em vez de mostrar uma lista vazia.
  useEffect(() => {
    if (!goal) navigate('/goals', { replace: true })
  }, [goal, navigate])

  const matches = useMemo(
    () => (goal ? recommendFor(products, goal) : []),
    [products, goal],
  )

  const open = (product: Product) => {
    selectProduct(product)
    track({ type: 'product_viewed', productId: product.id })
    navigate(`/product/${product.id}`)
  }

  const goalLabel = goal ? goalById(goal)?.label : ''

  return (
    <Frame
      legal={legal.advice}
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate('/goals')} label="Voltar">
            ←
          </Button>
          <Button variant="ghost" onClick={() => navigate('/kiosk')} label="Recomeçar">
            ⟳
          </Button>
        </>
      }
    >
      <p className="eyebrow">Seleção para {goalLabel}</p>
      <h1 className="title">Estas são as nossas sugestões</h1>
      <p className="subtitle">Toque numa opção para ver os detalhes.</p>

      {matches.length === 0 ? (
        <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-xl)' }}>
          Ainda não temos uma sugestão para este objetivo nesta estação. Entre na
          loja — a nossa equipa ajuda-o a escolher.
        </div>
      ) : (
        <div className="grid grid--products">
          {matches.map((product) => (
            <button
              key={product.id}
              type="button"
              className="card"
              onClick={() => open(product)}
            >
              <ProductImage className="card__media" product={product} loading="lazy" />
              <AvailabilityBadge product={product} />
              <h2 className="card__title">{product.name}</h2>
              <p className="card__text">{product.description}</p>
              <span className="card__price">{formatPrice(product.priceCents)}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'var(--tne-space-xl)' }}>
        <Button variant="secondary" onClick={() => navigate('/catalog')}>
          Ver todos os produtos →
        </Button>
      </div>
    </Frame>
  )
}
