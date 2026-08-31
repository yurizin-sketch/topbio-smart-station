import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AvailabilityBadge, Button, Frame, ProductImage } from '../components/ui'
import { useSession } from '../state/session'
import { isAvailable } from '../services/catalog'
import { formatPrice } from '../config'
import { legal } from '../data/legal'

type TabId = 'beneficios' | 'composicao' | 'uso'

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'beneficios', label: 'Benefícios' },
  { id: 'composicao', label: 'Composição' },
  { id: 'uso', label: 'Modo de uso' },
]

export function ProductDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { products, product, selectProduct } = useSession()
  const [tab, setTab] = useState<TabId>('beneficios')

  // Permite abrir /product/xxx diretamente (útil para testes e QR internos).
  useEffect(() => {
    if (product?.id === id) return
    const found = products.find((p) => p.id === id)
    if (found) selectProduct(found)
    else if (products.length) navigate('/goals', { replace: true })
  }, [id, product, products, selectProduct, navigate])

  if (!product) return null

  return (
    <Frame
      legal={legal.supplement}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => navigate('/recommendations')}
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
      <p className="eyebrow">Conheça a sugestão</p>
      <h1 className="title">{product.name}</h1>

      <div className="detail">
        <figure className="detail__figure" style={{ margin: 0 }}>
          <ProductImage product={product} />
          <figcaption className="detail__slot">
            <AvailabilityBadge product={product} /> · levanta-se ao balcão
          </figcaption>
        </figure>

        <div>
          <p className="subtitle" style={{ marginTop: 0 }}>
            {product.description}
          </p>

          {/* Três blocos empilhados obrigavam a rolar o ecrã para chegar ao
              botão de comprar. Em separadores, a ficha inteira cabe de uma vez
              e quem só quer pagar não precisa de passar por ela. */}
          <div className="tabs">
            <div className="tabs__strip" role="tablist" aria-label="Ficha do produto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  className={`tabs__btn${tab === t.id ? ' tabs__btn--on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              className="tabs__panel"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === 'beneficios' && (
                <ul className="chips">
                  {product.highlights.map((h) => (
                    <li key={h} className="chip">
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'composicao' && <p className="spec__value">{product.ingredients}</p>}
              {tab === 'uso' && <p className="spec__value">{product.usage}</p>}
            </div>
          </div>

          <div className="price-row">
            <div>
              <p className="section-label">Preço</p>
              <span className="price">{formatPrice(product.priceCents)}</span>
            </div>
            <Button onClick={() => navigate('/checkout')} disabled={!isAvailable(product)}>
              Comprar →
            </Button>
          </div>

          <p
            className="station__legal"
            style={{ background: 'transparent', padding: 0, textAlign: 'left' }}
          >
            {legal.label}
          </p>
        </div>
      </div>
    </Frame>
  )
}
