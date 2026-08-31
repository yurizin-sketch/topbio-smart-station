import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Receipt } from '../components/ui'
import { useSession } from '../state/session'
import { legal } from '../data/legal'
import { config } from '../config'

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
 * Fecha-se sozinho ao fim de `successResetMs`, com aviso nos últimos segundos.
 * O ecrã não pode ficar eternamente com o código de uma pessoa à espera do
 * próximo cliente, mas também não pode desaparecer debaixo de quem o está a
 * copiar: qualquer toque põe a contagem no início outra vez.
 */
export function Success() {
  const navigate = useNavigate()
  const { product, order, reset, setOrderStatus } = useSession()
  // `config` é `as const`, portanto sem esta anotação o estado ficava preso ao
  // literal 40000 e a subtração deixava de compilar.
  const [remainingMs, setRemainingMs] = useState<number>(config.successResetMs)

  const finish = useCallback(() => {
    reset()
    navigate('/kiosk')
  }, [reset, navigate])

  /** Um toque em qualquer sítio devolve os 40 segundos completos. */
  const keepOpen = useCallback(() => setRemainingMs(config.successResetMs), [])

  useEffect(() => {
    const tick = window.setInterval(() => {
      setRemainingMs((left) => Math.max(0, left - 1_000))
    }, 1_000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    if (remainingMs > 0) return
    finish()
  }, [remainingMs, finish])

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
  const warning = remainingMs <= config.successWarnMs
  const seconds = Math.ceil(remainingMs / 1_000)

  return (
    <Frame dark bare legal={legal.supplement}>
      <div className="finish" onPointerDown={keepOpen}>
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

        {/*
          O aviso só aparece no fim. Uma contagem visível durante quarenta
          segundos mete pressa a quem está a copiar um código, e a pressa ao pé
          da caixa é o que faz as pessoas irem embora sem ele.

          `role="status"` para os leitores de ecrã o anunciarem sem interromper.
        */}
        {warning && (
          <p className="finish__countdown" role="status">
            Este ecrã fecha em {seconds} {seconds === 1 ? 'segundo' : 'segundos'}.
            <span> Toque no ecrã para o manter aberto.</span>
          </p>
        )}
      </div>
    </Frame>
  )
}
