import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AvailabilityBadge, Button, Frame, ProductImage } from '../components/ui'
import { useSession } from '../state/session'
import { isAvailable } from '../services/catalog'
import { formatPrice } from '../config'
import { track } from '../services/telemetry'
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
  const { products, product, selectProduct, createOrder } = useSession()
  const [tab, setTab] = useState<TabId>('beneficios')

  // A ficha completa do site. Falta nos produtos que ainda não têm lá página,
  // e nesses os separadores mostram a versão curta do catálogo.
  const detail = product?.detail

  // O rótulo do frasco, em cima do modo de uso: é onde a pessoa está quando
  // quer saber quantas leva e para quantos dias dá. Só entra o que o rótulo
  // diz — ver `ProductPack` sobre os buracos.
  const pack = [
    product?.pack?.capsules ? `${product.pack.capsules} cápsulas` : '',
    product?.pack?.doses ? `${product.pack.doses} doses por embalagem` : '',
    product?.pack?.mgPerCapsule ? `${product.pack.mgPerCapsule} mg cada` : '',
    product?.pack?.netWeight ?? '',
  ].filter(Boolean)

  // Produto novo, ficha do princípio. O ecrã não se desmonta entre produtos, e
  // sem isto quem tinha aberto o modo de uso de um caía no modo de uso do
  // seguinte — enquanto a Cláudia lhe estava a apresentar a descrição.
  useEffect(() => setTab('beneficios'), [product?.id])

  // Permite abrir /product/xxx diretamente (útil para testes e QR internos).
  useEffect(() => {
    if (product?.id === id) return
    const found = products.find((p) => p.id === id)
    if (found) selectProduct(found)
    else if (products.length) navigate('/goals', { replace: true })
  }, [id, product, products, selectProduct, navigate])

  /**
   * Comprar já não pergunta nada.
   *
   * Havia aqui um ecrã pelo meio a perguntar «MB WAY ou balcão?». Com o
   * pagamento a ser sempre ao balcão, esse ecrã era um toque a mais para
   * chegar exactamente ao mesmo sítio.
   */
  const comprar = () => {
    createOrder()
    track({ type: 'checkout_started', productId: product!.id })
    navigate('/checkout/ticket')
  }

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

            {/* A `key` obriga o painel a nascer de novo a cada separador. Sem
                ela o React reaproveita a mesma caixa e com ela o scroll: quem
                tinha descido até ao fim dos benefícios abria a composição a
                meio dos ingredientes, sem perceber porquê. */}
            <div
              key={tab}
              className="tabs__panel"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === 'beneficios' && (
                <>
                  <ul className="chips">
                    {product.highlights.map((h) => (
                      <li key={h} className="chip">
                        {h}
                      </li>
                    ))}
                  </ul>
                  {detail?.about && <p className="spec__value spec__value--after">{detail.about}</p>}
                  {detail?.forWhom.length ? (
                    <>
                      <p className="spec__label">Para quem é</p>
                      <ul className="spec__list">
                        {detail.forWhom.map((linha) => (
                          <li key={linha}>{linha}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
              {tab === 'composicao' &&
                (detail?.ingredients.length ? (
                  <>
                    <dl className="spec__defs">
                      {detail.ingredients.map((i) => (
                        <Fragment key={i.name}>
                          <dt>{i.name}</dt>
                          <dd>{i.note}</dd>
                        </Fragment>
                      ))}
                    </dl>
                    {detail.nutrition && (
                      <>
                        <p className="spec__label">Por dose</p>
                        <p className="spec__value">{detail.nutrition}</p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="spec__value">{product.ingredients}</p>
                ))}
              {tab === 'uso' && (
                <>
                  {pack.length ? <p className="spec__pack">{pack.join(' · ')}</p> : null}
                  <p className="spec__value">{detail?.usage || product.usage}</p>
                  {detail?.notes.length ? (
                    <>
                      <p className="spec__label">Cuidados</p>
                      <ul className="spec__list">
                        {detail.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="price-row">
            <div>
              <p className="section-label">Preço</p>
              <span className="price">{formatPrice(product.priceCents)}</span>
            </div>
            <Button onClick={comprar} disabled={!isAvailable(product)}>
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
