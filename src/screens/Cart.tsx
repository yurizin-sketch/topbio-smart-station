import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, ProductImage } from '../components/ui'
import { useSession } from '../state/session'
import { config, formatPrice } from '../config'
import { legal } from '../data/legal'

/**
 * O carrinho, antes de pagar.
 *
 * Só se passa por aqui com mais do que um produto: quem compra um só vai do
 * produto direto ao pagamento. Aqui confere-se o que se leva, acerta-se a
 * quantidade de cada um, tira-se o que já não se quer, e paga-se tudo de uma
 * vez — um pagamento, um código para o balcão.
 */
export function Cart() {
  const navigate = useNavigate()
  const { cart, setCartQuantity, createOrder } = useSession()

  // Carrinho vazio (tirou tudo, ou chegou aqui sem nada): de volta à gama.
  useEffect(() => {
    if (!cart.length) navigate('/catalog', { replace: true })
  }, [cart.length, navigate])

  if (!cart.length) return null

  const total = cart.reduce((n, l) => n + l.product.priceCents * l.quantity, 0)
  const frascos = cart.reduce((n, l) => n + l.quantity, 0)

  const pagar = () => {
    createOrder()
    navigate('/checkout/pay')
  }

  return (
    <Frame
      legal={legal.supplement}
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
      <p className="eyebrow">O seu carrinho</p>
      <h1 className="title">Confira e pague tudo de uma vez</h1>

      <ul className="cart">
        {cart.map(({ product, quantity }) => (
          <li key={product.id} className="cart__line">
            <ProductImage product={product} />
            <div className="cart__info">
              <p className="cart__name">{product.name}</p>
              <p className="cart__unit">{`${formatPrice(product.priceCents)} cada`}</p>
            </div>
            <div className="qty" role="group" aria-label={`Quantidade de ${product.name}`}>
              <button
                type="button"
                className="qty__btn"
                onClick={() => setCartQuantity(product.id, quantity - 1)}
                aria-label={quantity === 1 ? `Tirar ${product.name}` : 'Menos um'}
              >
                {quantity === 1 ? '×' : '−'}
              </button>
              <span className="qty__value" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="qty__btn"
                onClick={() => setCartQuantity(product.id, quantity + 1)}
                disabled={quantity >= config.maxQuantity}
                aria-label="Mais um"
              >
                +
              </button>
            </div>
            <p className="cart__sum">{formatPrice(product.priceCents * quantity)}</p>
          </li>
        ))}
      </ul>

      <div className="price-row">
        <div>
          <p className="section-label">{`Total · ${frascos} ${frascos === 1 ? 'frasco' : 'frascos'}`}</p>
          <span className="price">{formatPrice(total)}</span>
        </div>
        <Button onClick={pagar}>Pagar →</Button>
      </div>
      <div className="product__more">
        <Button variant="secondary" onClick={() => navigate('/catalog')}>
          + Escolher outro produto
        </Button>
      </div>
    </Frame>
  )
}
