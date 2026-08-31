import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Receipt } from '../components/ui'
import { useSession } from '../state/session'
import { legal } from '../data/legal'

/**
 * Pós-pagamento.
 *
 * Só se chega aqui com a encomenda em `paid`, confirmada pelo servidor.
 *
 * A estação é um tablet dentro da loja e não entrega nada: o desfecho é
 * sempre o mesmo — uma ficha com um código, que o cliente leva ao balcão e o
 * funcionário fecha no /staff. Um só caminho, sem hardware pelo meio que possa
 * falhar depois do dinheiro entrar.
 *
 * Sem contagem decrescente para reiniciar sozinho: quem está a olhar para o
 * código precisa dele. O tempo limite geral de inatividade já trata de voltar
 * ao ecrã de atração quando a pessoa se afasta.
 */
export function Success() {
  const navigate = useNavigate()
  const { product, order, reset, setOrderStatus } = useSession()

  useEffect(() => {
    if (!order || !product) {
      navigate('/kiosk', { replace: true })
      return
    }
    // O pagamento já foi confirmado pelo servidor antes de chegar aqui. Isto
    // só fixa o estado na sessão para o pedido aparecer na fila do balcão.
    if (order.status !== 'paid') setOrderStatus('paid')
  }, [order, product, navigate, setOrderStatus])

  if (!order || !product) return null

  const pickupCode = order.id.slice(0, 6).toUpperCase()

  const finish = () => {
    reset()
    navigate('/kiosk')
  }

  return (
    <Frame dark bare legal={legal.supplement}>
      <div className="finish">
        <span className="finish__seal" aria-hidden="true">
          ✓
        </span>
        <p className="eyebrow">Pagamento confirmado</p>
        <h1 className="display">Está pago!</h1>
        <p className="subtitle" style={{ maxWidth: '32ch' }}>
          Mostre este comprovante ao balcão e entregamos-lhe o {product.name}.
        </p>

        <Receipt code={pickupCode} order={order} productName={product.name} state="paid" />

        <div style={{ marginTop: 'var(--tne-space-lg)' }}>
          <Button onClick={finish}>Já anotei, concluir</Button>
        </div>
      </div>
    </Frame>
  )
}
