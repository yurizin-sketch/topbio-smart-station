import { useEffect, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import type { Order, Product } from '../types'
import { isAvailable } from '../services/catalog'
import { config, formatPrice } from '../config'
import { asset } from '../assets'

/* ── Moldura ─────────────────────────────────────────────────────────── */

interface FrameProps {
  children: ReactNode
  /** Ações no canto superior direito (voltar, recomeçar). */
  actions?: ReactNode
  /** Aviso legal do rodapé. Obrigatório em todos os ecrãs de produto. */
  legal?: string
  dark?: boolean
  /** Ecrãs imersivos (atração, sucesso) escondem a barra. */
  bare?: boolean
}

export function Frame({ children, actions, legal, dark, bare }: FrameProps) {
  return (
    <div className={dark ? 'station station--dark' : 'station'}>
      {!bare && (
        <header className="station__bar">
          <img
            className="station__logo"
            src={asset('/media/brand/topbio-logo-white.svg')}
            alt="TopBio Europa"
          />
          <div className="station__bar-actions">{actions}</div>
        </header>
      )}

      {/*
        Tarja de pré-produção. Fica em todos os ecrãs de propósito: a estação
        não pode parecer pronta para cobrar enquanto os preços forem os que
        pusemos para testar.
      */}
      {!config.pricesConfirmed && (
        <p className="station__draft" role="status">
          Modo de demonstração · preços por confirmar
        </p>
      )}

      <main className="station__body">
        {bare ? children : <div className="station__inner enter">{children}</div>}
      </main>

      {legal && <p className="station__legal">{legal}</p>}
    </div>
  )
}

/* ── Botões ──────────────────────────────────────────────────────────── */

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  block?: boolean
  disabled?: boolean
  label?: string
  /**
   * `submit` só para os formulários do balcão, onde carregar em Enter (ou um
   * leitor de códigos, que envia Enter no fim) tem de valer o mesmo que tocar
   * no botão. No quiosque não há formulários — daí o `button` por omissão.
   */
  type?: 'button' | 'submit'
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  block,
  disabled,
  label,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${block ? ' btn--block' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  )
}

/* ── Stock ───────────────────────────────────────────────────────────── */

/**
 * Há ou não há este produto na loja.
 *
 * Nada sai da estação: o tablet está dentro da loja e tudo se levanta ao
 * balcão. Por isso a etiqueta tem duas posições e não três — escrever
 * "levantar na loja" em cima de um produto que já está na loja não informa
 * ninguém.
 */
export function AvailabilityBadge({ product }: { product: Product }) {
  return isAvailable(product) ? (
    <span className="badge badge--in-stock">Disponível</span>
  ) : (
    <span className="badge badge--out">Indisponível</span>
  )
}

/**
 * Foto do produto, com a falta de foto tratada.
 *
 * Um produto novo entra na estação antes de haver fotografia dele. Sem isto, o
 * ecrã mostrava o ícone de imagem partida do browser — que parece avaria da
 * máquina. Assim fica só o cartão bege, que ninguém lê como erro.
 */
export function ProductImage({
  product,
  className,
  loading,
}: {
  product: Product
  className?: string
  loading?: 'lazy' | 'eager'
}) {
  const [broken, setBroken] = useState(false)

  // Um espaço vazio, não um buraco: sem isto a moldura colapsa e leva consigo a
  // etiqueta de disponibilidade, que é a informação de que o cliente precisa
  // mesmo.
  if (broken) {
    return <div className={['media-empty', className].filter(Boolean).join(' ')} aria-hidden="true" />
  }

  return (
    <img
      src={asset(product.image)}
      alt={product.name}
      className={className}
      loading={loading}
      onError={() => setBroken(true)}
    />
  )
}

/* ── Passos do pagamento ─────────────────────────────────────────────── */

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="steps">
      {labels.map((label, i) => (
        <li
          key={label}
          className={
            'steps__item' +
            (i === current ? ' steps__item--active' : '') +
            (i < current ? ' steps__item--done' : '')
          }
          aria-current={i === current ? 'step' : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  )
}

/* ── QR ──────────────────────────────────────────────────────────────── */

export function QrCode({ value, size = 380 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    void QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#002E26', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
  }, [value, size])

  return <canvas className="qr" ref={ref} role="img" aria-label="Código QR de pagamento" />
}

/* ── Comprovante ────────────────────────────────────────────────── */

/**
 * A ficha que o cliente leva ao balcão.
 *
 * É o único desfecho da estação: o tablet não entrega produto nenhum, fecha a
 * venda e imprime — hoje no ecrã, amanhã em papel — o que o funcionário
 * precisa de ver para entregar. Por isso vive num só componente: o dia em que
 * houver impressora ligada, é este bloco que sai, igual em ambos os ecrãs.
 *
 * O código aparece em texto E em QR de propósito. O QR é para o balcão ler
 * depressa; o texto é para quando o leitor não pega ou o ecrã está riscado.
 */
export function Receipt({
  code,
  order,
  productName,
  state,
}: {
  code: string
  order: Order
  productName: string
  /** O que falta fazer com esta ficha. Muda a tarja, não o resto. */
  state: 'paid' | 'to_pay'
}) {
  const issued = new Date(order.createdAt)

  return (
    <div className="receipt">
      <div className="receipt__head">
        <p className="section-label">Comprovante</p>
        <span className={`receipt__state receipt__state--${state === 'paid' ? 'ok' : 'due'}`}>
          {state === 'paid' ? 'Pago' : 'Por pagar'}
        </span>
      </div>

      <strong className="ticket-code">{code}</strong>
      <QrCode value={code} size={220} />

      <dl className="receipt__lines">
        <div>
          <dt>Produto</dt>
          <dd>{productName}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{formatPrice(order.amountCents)}</dd>
        </div>
        <div>
          <dt>Emitido</dt>
          <dd>
            {issued.toLocaleDateString('pt-PT')}{' '}
            {issued.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </dd>
        </div>
        <div>
          <dt>Estação</dt>
          <dd>{order.stationId}</dd>
        </div>
      </dl>

      {/*
        Não é fatura. Dizer isto na própria ficha evita que alguém a apresente
        como documento fiscal — quem emite fatura é o balcão, com NIF e tudo.
      */}
      <p className="receipt__note">
        Documento interno de levantamento. Não serve de fatura.
      </p>
    </div>
  )
}

/* ── Teclado numérico ────────────────────────────────────────────────── */

interface NumpadProps {
  value: string
  onChange: (next: string) => void
  maxLength?: number
}

export function Numpad({ value, onChange, maxLength = config.phoneDigits }: NumpadProps) {
  const press = (key: string) => {
    if (key === 'del') return onChange(value.slice(0, -1))
    if (key === 'clear') return onChange('')
    if (value.length >= maxLength) return
    onChange(value + key)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del']

  return (
    <div className="numpad">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className="numpad__key"
          onClick={() => press(k)}
          aria-label={k === 'del' ? 'Apagar' : k === 'clear' ? 'Limpar' : k}
        >
          {k === 'del' ? '⌫' : k === 'clear' ? 'C' : k}
        </button>
      ))}
    </div>
  )
}

/* ── Mostrador do telemóvel ──────────────────────────────────────────── */

export function PhoneDisplay({ digits }: { digits: string }) {
  // Agrupa 9 dígitos como 9XX XXX XXX, o formato que se lê em Portugal.
  const grouped = digits.replace(/(\d{3})(?=\d)/g, '$1 ')
  return (
    <div className="phone-display">
      <span className="phone-display__prefix">{config.phoneCountryCode}</span>
      <span>{grouped}</span>
      {digits.length < config.phoneDigits && <span className="phone-display__caret" />}
    </div>
  )
}
