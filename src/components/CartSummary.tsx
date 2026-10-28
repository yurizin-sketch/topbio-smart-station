import { useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { formatPrice } from '../config'

/**
 * A faixa «carrinho» no topo da gama e da ficha, quando já lá há alguma coisa.
 *
 * Fica no fluxo da página, e não presa ao fundo do ecrã: o canto de baixo é da
 * Cláudia e a faixa de baixo é do aviso legal, e uma barra fixa ia tapar um
 * dos dois. Sem nada no carrinho não aparece — quem compra um só produto, que
 * é quase toda a gente, nunca a vê.
 */
export function CartSummary() {
  const navigate = useNavigate()
  const { cart } = useSession()
  if (!cart.length) return null

  const frascos = cart.reduce((n, l) => n + l.quantity, 0)
  const total = cart.reduce((n, l) => n + l.product.priceCents * l.quantity, 0)

  return (
    <button type="button" className="cart-summary" onClick={() => navigate('/checkout/carrinho')}>
      <span className="cart-summary__what">
        {`No carrinho: ${frascos} ${frascos === 1 ? 'frasco' : 'frascos'} · ${formatPrice(total)}`}
      </span>
      <span className="cart-summary__go">Ver e pagar →</span>
    </button>
  )
}
