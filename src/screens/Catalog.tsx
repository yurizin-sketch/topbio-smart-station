import { useNavigate } from 'react-router-dom'
import { AvailabilityBadge, Button, Frame, ProductImage } from '../components/ui'
import { useSession } from '../state/session'
import { formatPrice } from '../config'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { Product } from '../types'

// As sugestões mostram três opções para não sobrecarregar quem está de pé à
// frente do tablet. Mas a gama tem mais do que três produtos por objetivo, e o
// resto nunca chegaria a aparecer. Este ecrã garante que a gama toda está
// sempre a um toque de distância.
export function Catalog() {
  const navigate = useNavigate()
  const { products, selectProduct } = useSession()

  const open = (product: Product) => {
    selectProduct(product)
    track({ type: 'product_viewed', productId: product.id })
    navigate(`/product/${product.id}`)
  }

  return (
    <Frame
      legal={legal.advice}
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate(-1)} label="Voltar">
            ←
          </Button>
          <Button variant="ghost" onClick={() => navigate('/kiosk')} label="Recomeçar">
            ⟳
          </Button>
        </>
      }
    >
      <p className="eyebrow">Gama completa</p>
      <h1 className="title">Todos os produtos</h1>
      <p className="subtitle">
        {products.length} produtos. Escolha aqui e levante ao balcão, a dois passos.
      </p>

      <div className="grid grid--products">
        {products.map((product) => (
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
    </Frame>
  )
}
