import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Frame } from '../components/ui'
import { formatPrice, getStationId } from '../config'
import { getCatalog } from '../services/catalog'
import { apiEnabled, loadSession } from '../services/api'
import {
  counterCancel,
  counterFind,
  counterLogin,
  counterLogout,
  counterPending,
  counterSettle,
  explain,
  type CounterSession,
} from '../services/counter'
import { listOpen, pickupCodeFor, subscribe, type StoredOrder } from '../services/orders'
import { track } from '../services/telemetry'
import { PAYMENT_LABELS, type PaymentMethod, type Product } from '../types'
import { useAssistant } from '../state/assistant'
import { assistantIsLive } from '../services/assistant'

/**
 * Os três botões de cobrança, por esta ordem.
 *
 * É a ordem por que o dinheiro costuma entrar numa loja de rua, e não a
 * alfabética: quem está ao balcão com fila carrega no primeiro sem ler.
 * O MB WAY continua a existir — deixou de estar é no tablet do cliente.
 */
const TENDERS: PaymentMethod[] = ['dinheiro', 'mbway', 'cartao']

/**
 * De quanto em quanto tempo se pergunta ao servidor pela fila.
 *
 * Uma venda emitida noutro tablet da mesma loja tem de aparecer aqui sem
 * ninguém recarregar nada. Dez segundos é mais depressa do que o cliente
 * atravessa a loja, e são seis pedidos por minuto — cabe à vontade no travão
 * do worker, que deixa passar vinte.
 */
const POLL_MS = 10_000

/**
 * Painel do balcão.
 *
 * A estação está na loja e não entrega nada: o cliente chega ao balcão com uma
 * ficha e este painel é o que fecha o ciclo.
 * São dois códigos diferentes e o funcionário não tem de saber a diferença:
 *
 *  - `TB-XXXX` — ainda não pagou. Recebe-se o dinheiro e só depois se entrega.
 *  - seis caracteres — código de recurso de um pedido antigo.
 *
 * Por isso há um único campo. Quem está ao balcão lê o que vê e escreve.
 */

type Feedback = { tone: 'ok' | 'warn'; text: string } | null

export function Staff() {
  // A sessão pode ter sobrevivido a um recarregar da página — o bilhete vale
  // doze horas, que é um turno. Quem já entrou não volta a escrever o PIN
  // porque o tablet se distraiu.
  const retomada = apiEnabled() ? loadSession() : null
  const [unlocked, setUnlocked] = useState(retomada?.scope === 'balcao')
  const [session, setSession] = useState<CounterSession>(
    retomada?.scope === 'balcao' ? retomada : null,
  )
  const [stationName, setStationName] = useState(retomada?.stationName ?? '')

  const [stationId, setStationId] = useState(getStationId())
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<StoredOrder | null>(null)
  const [open, setOpen] = useState<StoredOrder[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState(true)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => getCatalog().subscribe(setProducts), [])

  /** A sessão morreu a meio do turno. Volta-se ao PIN, sem perder o que está em casa. */
  const expired = useCallback(() => {
    counterLogout()
    setSession(null)
    setUnlocked(false)
    setSelected(null)
    setFeedback({ tone: 'warn', text: 'A sessão expirou. Introduza o PIN outra vez.' })
  }, [])

  // O que está em casa. Reage a um ticket emitido na tab do quiosque sem
  // ninguém carregar em nada — o funcionário não vai recarregar a página.
  useEffect(() => {
    if (!unlocked) return
    const refresh = () => setOpen(listOpen())
    refresh()
    return subscribe(refresh)
  }, [unlocked])

  // O que o servidor sabe. Traz para casa o que outro tablet da mesma loja
  // emitiu; a escrita local dispara o efeito de cima, que repinta a lista.
  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(() => {
    if (!unlocked) return
    let vivo = true
    const puxar = async () => {
      try {
        const { remote } = await counterPending(sessionRef.current)
        if (vivo) setLinked(remote)
      } catch (e) {
        if (!vivo) return
        if (e instanceof Error && 'expired' in e && e.expired) expired()
      }
    }
    void puxar()
    const timer = window.setInterval(() => void puxar(), POLL_MS)
    return () => {
      vivo = false
      window.clearInterval(timer)
    }
  }, [unlocked, expired])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  // O pedido escolhido tem de acompanhar o livro: se outro tablet o entregou
  // entretanto, o cartão em cima tem de deixar de oferecer o botão de entregar.
  const current = selected ? (open.find((o) => o.id === selected.id) ?? selected) : null

  if (!unlocked) {
    return (
      <Frame dark>
        <p className="eyebrow">Acesso reservado</p>
        <h1 className="title">Balcão</h1>
        <p className="subtitle">
          {apiEnabled()
            ? 'Introduza o posto e o PIN da loja.'
            : 'Introduza o PIN para validar levantamentos.'}
        </p>
        <form
          className="staff__pin"
          onSubmit={(e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            setFeedback(null)
            counterLogin(stationId, pin)
              .then((out) => {
                setSession(out.session)
                setStationName(out.stationName)
                setUnlocked(true)
                setPin('')
              })
              .catch((err) => setFeedback({ tone: 'warn', text: explain(err) }))
              .finally(() => {
                setBusy(false)
                setPin('')
              })
          }}
        >
          {/* Sem servidor não há posto que valha: o livro é o deste browser. */}
          {apiEnabled() && (
            <input
              className="staff__input"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              aria-label="Posto"
              placeholder="posto-da-loja"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
          <input
            className="staff__input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-label="PIN"
            placeholder="••••••"
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'A verificar…' : 'Entrar'}
          </Button>
        </form>
        {feedback && <p className="staff__feedback staff__feedback--warn">{feedback.text}</p>}
      </Frame>
    )
  }

  const lookup = (raw: string) => {
    setBusy(true)
    counterFind(session, raw)
      .then((found) => {
        setSelected(found)
        setFeedback(
          found ? null : { tone: 'warn', text: `Nenhum pedido com o código "${raw.trim()}".` },
        )
      })
      .catch((e) => {
        if (e instanceof Error && 'expired' in e && e.expired) expired()
        else setFeedback({ tone: 'warn', text: explain(e) })
      })
      .finally(() => setBusy(false))
  }

  /**
   * Recebeu e entregou.
   *
   * O `method` é como o dinheiro entrou, e só é pedido para pedidos por
   * cobrar — quem já está pago não volta a pagar. É a única escrita de
   * «pago» que existe na estação: o quiosque não tem nenhuma.
   */
  const deliver = (order: StoredOrder, method: PaymentMethod | null) => {
    setBusy(true)
    counterSettle(session, order, method)
      .then(() => {
        if (method) track({ type: 'payment_confirmed', orderId: order.id, method })
        setSelected(null)
        setCode('')
        setOpen(listOpen())
        setFeedback({
          tone: 'ok',
          text: method
            ? `Recebido em ${PAYMENT_LABELS[method]}. Entregue.`
            : 'Entregue. Pedido fechado.',
        })
      })
      .catch((e) => {
        if (e instanceof Error && 'expired' in e && e.expired) expired()
        else setFeedback({ tone: 'warn', text: explain(e) })
      })
      .finally(() => setBusy(false))
  }

  const cancel = (order: StoredOrder) => {
    setBusy(true)
    counterCancel(session, order)
      .then(() => {
        setSelected(null)
        setCode('')
        setOpen(listOpen())
        setFeedback({ tone: 'ok', text: 'Pedido cancelado e unidade libertada.' })
      })
      .catch((e) => {
        if (e instanceof Error && 'expired' in e && e.expired) expired()
        else setFeedback({ tone: 'warn', text: explain(e) })
      })
      .finally(() => setBusy(false))
  }

  return (
    <Frame
      dark
      actions={
        <Button
          variant="ghost"
          onClick={() => {
            counterLogout()
            setSession(null)
            setUnlocked(false)
          }}
          label="Sair"
        >
          ⏻
        </Button>
      }
    >
      <p className="eyebrow">Balcão{stationName ? ` · ${stationName}` : ''}</p>
      <h1 className="title">Validar levantamento</h1>

      {/* Quem está ao balcão tem de saber que está a trabalhar só com o que o
          tablet tem — senão entrega à mesma e fica a pensar que a matriz viu.
          São três casos, e cada um diz o que é para não haver enganos. */}
      {session && !linked && (
        <p className="notice notice--warn" role="status">
          A ligação ao servidor caiu. Continua a poder cobrar e entregar; fica
          tudo guardado neste tablet e sai assim que a rede voltar.
        </p>
      )}
      {!session && apiEnabled() && (
        <p className="notice notice--warn" role="status">
          Balcão de recurso, sem ligação ao servidor. Pode cobrar e entregar;
          fica tudo guardado neste tablet e sai quando alguém voltar a entrar com
          a rede a funcionar.
        </p>
      )}
      {!session && !apiEnabled() && (
        <p className="notice notice--info">Sem servidor: só vê os pedidos deste aparelho.</p>
      )}

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
        <Button type="submit" disabled={busy || code.trim().length < 4}>
          Procurar
        </Button>
      </form>

      {feedback && (
        <p className={`staff__feedback staff__feedback--${feedback.tone}`} role="status">
          {feedback.text}
        </p>
      )}

      {current && (
        <OrderCard
          order={current}
          product={productById.get(current.productId)}
          busy={busy}
          onDeliver={(method) => deliver(current, method)}
          onCancel={() => cancel(current)}
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
  onDeliver: (method: PaymentMethod | null) => void
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
        <>
          {/* Por cobrar: o botão é o meio de pagamento. Não há um «Entregar»
              genérico ao lado, de propósito — se houvesse, seria o caminho
              rápido num balcão com fila, e a matriz ficava sem saber como o
              dinheiro entrou. Quem recebe carrega no que recebeu. */}
          {owes && (
            <>
              <p className="staff__tender-ask">
                Recebi {formatPrice(order.amountCents)} em:
              </p>
              <div className="staff__actions">
                {TENDERS.map((method) => (
                  <Button key={method} onClick={() => onDeliver(method)} disabled={busy}>
                    {busy ? 'A fechar…' : PAYMENT_LABELS[method]}
                  </Button>
                ))}
              </div>
            </>
          )}

          <div className="staff__actions">
            {!owes && (
              <Button onClick={() => onDeliver(null)} disabled={busy}>
                {busy ? 'A fechar…' : 'Entregar'}
              </Button>
            )}
            {/* `ghost` é o botão de ícone da barra do topo — com texto, transborda
                da caixa. Aqui a ação é secundária mas continua a ser texto. */}
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar pedido
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * O estado da Cláudia, para quem instala o tablet.
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
