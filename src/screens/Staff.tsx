import { useEffect, useMemo, useState } from 'react'
import { Button, Frame } from '../components/ui'
import { config, formatPrice } from '../config'
import { getCatalog } from '../services/catalog'
import {
  findByCode,
  listOpen,
  markCancelled,
  markDelivered,
  markPaid,
  pickupCodeFor,
  subscribe,
  type StoredOrder,
} from '../services/orders'
import type { Product } from '../types'
import { useAssistant } from '../state/assistant'
import { assistantIsLive } from '../services/assistant'

/**
 * Painel do balcão.
 *
 * A estação está na loja e não entrega nada: o cliente chega ao balcão com uma
 * ficha e este painel é o que fecha o ciclo.
 * São dois códigos diferentes e o funcionário não tem de saber a diferença:
 *
 *  - `TB-XXXX` — ainda não pagou. Recebe-se o dinheiro e só depois se entrega.
 *  - seis caracteres — já pagou por MB WAY. Só falta entregar.
 *
 * Por isso há um único campo. Quem está ao balcão lê o que vê e escreve.
 */

type Feedback = { tone: 'ok' | 'warn'; text: string } | null

export function Staff() {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<StoredOrder | null>(null)
  const [open, setOpen] = useState<StoredOrder[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => getCatalog().subscribe(setProducts), [])

  // A lista tem de reagir a um ticket emitido na tab do quiosque sem ninguém
  // carregar em nada — o funcionário não vai andar a recarregar a página.
  useEffect(() => {
    if (!unlocked) return
    const refresh = () => {
      setOpen(listOpen())
      setSelected((current) => (current ? findByCode(current.ticketCode ?? pickupCodeFor(current)) : null))
    }
    refresh()
    return subscribe(refresh)
  }, [unlocked])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  if (!unlocked) {
    return (
      <Frame dark>
        <p className="eyebrow">Acesso reservado</p>
        <h1 className="title">Balcão</h1>
        <p className="subtitle">Introduza o PIN para validar levantamentos.</p>
        <form
          className="staff__pin"
          onSubmit={(e) => {
            e.preventDefault()
            if (pin === config.staffPin) {
              setUnlocked(true)
              setPin('')
            } else {
              setFeedback({ tone: 'warn', text: 'PIN incorreto.' })
              setPin('')
            }
          }}
        >
          <input
            className="staff__input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-label="PIN"
            placeholder="••••"
          />
          <Button type="submit">Entrar</Button>
        </form>
        {feedback && <p className="staff__feedback staff__feedback--warn">{feedback.text}</p>}
      </Frame>
    )
  }

  const lookup = (raw: string) => {
    const found = findByCode(raw)
    setSelected(found)
    setFeedback(
      found ? null : { tone: 'warn', text: `Nenhum pedido com o código "${raw.trim()}".` },
    )
  }

  const deliver = (order: StoredOrder) => {
    setBusy(true)
    try {
      // Ordem deliberada: primeiro regista-se o pagamento, só depois se fecha a
      // entrega. Ao contrário, uma falha a meio deixa mercadoria entregue sem
      // registo de que foi paga.
      const paid = order.status === 'awaiting_counter' ? markPaid(order.id) ?? order : order

      markDelivered(paid.id)
      setSelected(null)
      setCode('')
      setFeedback({ tone: 'ok', text: 'Entregue. Pedido fechado.' })
    } finally {
      setBusy(false)
    }
  }

  const cancel = (order: StoredOrder) => {
    markCancelled(order.id)
    setSelected(null)
    setCode('')
    setFeedback({ tone: 'ok', text: 'Pedido cancelado e unidade libertada.' })
  }

  return (
    <Frame
      dark
      actions={
        <Button variant="ghost" onClick={() => setUnlocked(false)} label="Sair">
          ⏻
        </Button>
      }
    >
      <p className="eyebrow">Balcão</p>
      <h1 className="title">Validar levantamento</h1>

      <form
        className="staff__search"
        onSubmit={(e) => {
          e.preventDefault()
          lookup(code)
        }}
      >
        <input
          className="staff__input staff__input--code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TB-4821 ou 97846C"
          aria-label="Código do cliente"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <Button type="submit" disabled={code.trim().length < 4}>
          Procurar
        </Button>
      </form>

      {feedback && (
        <p className={`staff__feedback staff__feedback--${feedback.tone}`} role="status">
          {feedback.text}
        </p>
      )}

      {selected && (
        <OrderCard
          order={selected}
          product={productById.get(selected.productId)}
          busy={busy}
          onDeliver={() => deliver(selected)}
          onCancel={() => cancel(selected)}
        />
      )}

      <section className="staff__queue">
        <h2 className="section-label">Por entregar ({open.length})</h2>
        {open.length === 0 ? (
          <p className="staff__empty">Nada pendente.</p>
        ) : (
          <ul className="staff__list">
            {open.map((o) => {
              const product = productById.get(o.productId)
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className="staff__row"
                    onClick={() => {
                      setSelected(o)
                      setCode(o.ticketCode ?? pickupCodeFor(o))
                      setFeedback(null)
                    }}
                  >
                    <strong className="staff__row-code">{o.ticketCode ?? pickupCodeFor(o)}</strong>
                    <span className="staff__row-name">{product?.name ?? o.productId}</span>
                    <span className="staff__row-state">
                      {o.status === 'paid' ? 'Pago' : `Falta cobrar ${formatPrice(o.amountCents)}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <AssistantDiagnostics />
    </Frame>
  )
}

function OrderCard({
  order,
  product,
  busy,
  onDeliver,
  onCancel,
}: {
  order: StoredOrder
  product: Product | undefined
  busy: boolean
  onDeliver: () => void
  onCancel: () => void
}) {
  const closed = order.status === 'delivered' || order.status === 'cancelled'
  const owes = order.status === 'awaiting_counter'
  // A reserva expirada não bloqueia a entrega: quem chegou ao balcão com o
  // código na mão não tem culpa de ter demorado. Só avisa, para o funcionário
  // saber que o stock pode já ter sido prometido a outra pessoa.
  const lapsed = owes && order.expiresAt < Date.now()

  return (
    <div className="staff__card">
      <div className="staff__card-head">
        <strong className="ticket-code">{order.ticketCode ?? pickupCodeFor(order)}</strong>
        <span className={`staff__tag staff__tag--${owes ? 'owes' : 'paid'}`}>
          {owes ? 'Por pagar' : 'Já pago'}
        </span>
      </div>

      <p className="staff__product">{product?.name ?? order.productId}</p>
      <p className="staff__amount">{formatPrice(order.amountCents)}</p>

      <p className="staff__where">Entregar da prateleira</p>

      {lapsed && (
        <p className="staff__feedback staff__feedback--warn">
          Reserva expirada. Confirme que ainda tem unidade antes de entregar.
        </p>
      )}

      {closed ? (
        <p className="staff__feedback staff__feedback--ok">
          {order.status === 'delivered' ? 'Já foi entregue.' : 'Este pedido foi cancelado.'}
        </p>
      ) : (
        <div className="staff__actions">
          <Button onClick={onDeliver} disabled={busy}>
            {busy ? 'A fechar…' : owes ? `Recebi ${formatPrice(order.amountCents)} · Entregar` : 'Entregar'}
          </Button>
          {/* `ghost` é o botão de ícone da barra do topo — com texto, transborda
              da caixa. Aqui a ação é secundária mas continua a ser texto. */}
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar pedido
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * O estado da Bia, para quem instala o tablet.
 *
 * Sem isto, quem monta a estação na loja não tem como saber se a câmara ficou
 * a apontar para o sítio certo ou para o teto, nem porque é que ela está muda.
 * São três linhas que poupam um telefonema.
 */
function AssistantDiagnostics() {
  const { present, presenceFailure, needsUnlock, muted } = useAssistant()

  // A câmara só arranca depois do primeiro toque do dia. Enquanto isso não
  // acontecer, dizer "A ligar…" seria mentira — ninguém está a ligar nada.
  const camera = needsUnlock
    ? 'À espera do primeiro toque'
    : (presenceFailure ??
      (present === null ? 'A ligar…' : present ? 'Está alguém à frente' : 'Balcão livre'))

  return (
    <section className="staff__diag">
      <h2 className="section-label">Assistente</h2>
      <dl className="staff__diag-lines">
        <div>
          <dt>Câmara</dt>
          <dd>{camera}</dd>
        </div>
        <div>
          <dt>Voz</dt>
          <dd>{muted ? 'Som desligado' : needsUnlock ? 'Falta um toque no ecrã' : 'Pronta'}</dd>
        </div>
        <div>
          <dt>Cérebro</dt>
          <dd>{assistantIsLive() ? 'Modelo ligado' : 'Falas escritas (sem servidor)'}</dd>
        </div>
      </dl>
    </section>
  )
}
