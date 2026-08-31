import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Numpad, PhoneDisplay, QrCode, Steps } from '../components/ui'
import { useSession } from '../state/session'
import { config, formatPrice } from '../config'
import { getGateway } from '../services/payments'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { PaymentIntent } from '../services/payments'
import type { OrderStatus } from '../types'

/**
 * Pagamento MB WAY.
 *
 * O QR é o caminho principal e aparece logo ao entrar: quem está de pé à
 * frente de um tablet não quer escrever nove dígitos num teclado tátil.
 * Abre a app, lê, confirma. A introdução do número fica como alternativa
 * para quem tiver dificuldade com a câmara.
 */

type Phase = 'qr' | 'phone' | 'waiting' | 'failed'

/** Telemóvel português: 9 dígitos a começar por 9. */
function isValidPhone(digits: string): boolean {
  return digits.length === config.phoneDigits && digits.startsWith('9')
}

export function MbWay() {
  const navigate = useNavigate()
  const { product, order, updateOrder, setOrderStatus } = useSession()

  const [phase, setPhase] = useState<Phase>('qr')
  const [digits, setDigits] = useState('')
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!product || !order) navigate('/goals', { replace: true })
  }, [product, order, navigate])

  const fail = useCallback((message: string) => {
    setError(message)
    setPhase('failed')
  }, [])

  /** Pede o QR assim que o ecrã abre. */
  useEffect(() => {
    if (!order) return
    let alive = true
    void getGateway()
      .start(order)
      .then((result) => {
        if (!alive) return
        setIntent(result)
        updateOrder({ status: 'awaiting_payment' })
      })
      .catch(() => alive && fail('Não foi possível contactar o serviço de pagamentos.'))
    return () => {
      alive = false
    }
    // Uma vez por encomenda: pedir um segundo QR criaria uma cobrança duplicada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  /**
   * Quem decide que o pagamento entrou é o SERVIDOR — o webhook do parceiro.
   * O ecrã limita-se a ouvir. Se pudesse decidir sozinho, qualquer pessoa com
   * o inspetor do browser esvaziava a loja de graça.
   */
  const orderId = order?.id
  const onStatus = useRef<(status: OrderStatus) => void>(() => {})

  onStatus.current = (status) => {
    setOrderStatus(status)
    if (status === 'paid') {
      track({ type: 'payment_confirmed', orderId: orderId! })
      navigate('/success')
    }
    if (status === 'failed' || status === 'expired') {
      track({ type: 'payment_failed', orderId: orderId!, reason: status })
      fail(
        status === 'expired'
          ? 'O pedido expirou sem confirmação.'
          : 'O pagamento não foi concluído.',
      )
    }
  }

  // Subscrição amarrada ao id da encomenda, e a mais nada.
  //
  // Com `order` nas dependências isto entrava em ciclo: o gateway anuncia
  // logo `awaiting_payment`, o `setOrderStatus` gera um novo objeto `order`,
  // o efeito voltava a correr e a limpeza cancelava a espera pela confirmação.
  // Resultado: o pagamento nunca chegava. O handler vive numa ref para poder
  // ler estado fresco sem obrigar a religar a subscrição.
  useEffect(() => {
    if (!orderId) return
    return getGateway().observe(orderId, (status) => onStatus.current(status))
  }, [orderId])

  /** Contagem decrescente da validade do QR. */
  useEffect(() => {
    if (!intent) return
    const tick = () => {
      const left = Math.max(0, Math.round((intent.expiresAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) fail('O pedido expirou sem confirmação.')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [intent, fail])

  if (!product || !order) return null

  const submitPhone = async () => {
    if (!isValidPhone(digits)) return
    setPhase('waiting')
    // Guardamos só os últimos 3 dígitos: chegam para o apoio ao cliente
    // reconciliar um pagamento, sem guardar o contacto de ninguém.
    updateOrder({ phoneSuffix: digits.slice(-3) })
    try {
      setIntent(await getGateway().start(order, digits))
    } catch {
      fail('Não foi possível enviar o pedido para esse número.')
    }
  }

  const cancel = async () => {
    await getGateway().cancel(order.id)
    navigate('/checkout')
  }

  const countdown =
    secondsLeft === null
      ? null
      : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  const summary = (step: number) => (
    <div className="panel">
      <p className="section-label">O seu pedido</p>
      <h2 className="card__title">{product.name}</h2>
      <p className="price" style={{ marginTop: 'var(--tne-space-sm)' }}>
        {formatPrice(order.amountCents)}
      </p>
      <p className="card__text">Levantamento ao balcão</p>
      {countdown && (
        <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-md)' }}>
          Válido durante {countdown}
        </div>
      )}
      <Steps
        labels={['Ler o QR', 'Confirmar na app', 'Levantar']}
        current={step}
      />
      <div style={{ marginTop: 'var(--tne-space-lg)' }}>
        <Button variant="secondary" block onClick={cancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )

  return (
    <Frame
      legal={legal.supplement}
      actions={
        <Button variant="ghost" onClick={cancel} label="Cancelar">
          ✕
        </Button>
      }
    >
      <p className="eyebrow">Pagamento MB WAY</p>

      {phase === 'qr' && (
        <>
          <h1 className="title">Leia o código com a app MB WAY</h1>
          <p className="subtitle">
            Abra o MB WAY, escolha «Ler QR» e aponte para o ecrã.
          </p>

          <div className="pay">
            <div className="panel" style={{ textAlign: 'center' }}>
              {intent?.qrPayload ? (
                <QrCode value={intent.qrPayload} />
              ) : (
                <div className="notice notice--info">A gerar o código…</div>
              )}
              <button
                type="button"
                className="btn btn--secondary"
                style={{ marginTop: 'var(--tne-space-lg)' }}
                onClick={() => setPhase('phone')}
              >
                Prefiro escrever o meu número
              </button>
            </div>

            {summary(0)}
          </div>
        </>
      )}

      {phase === 'phone' && (
        <>
          <h1 className="title">O seu número MB WAY</h1>
          <p className="subtitle">
            Vai receber um pedido de {formatPrice(order.amountCents)} na app.
          </p>

          <div className="pay">
            <div className="panel">
              <PhoneDisplay digits={digits} />
              <Numpad value={digits} onChange={setDigits} />
              <div style={{ marginTop: 'var(--tne-space-md)' }}>
                <Button block onClick={submitPhone} disabled={!isValidPhone(digits)}>
                  Pedir pagamento →
                </Button>
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--block"
                style={{ marginTop: 'var(--tne-space-sm)' }}
                onClick={() => setPhase('qr')}
              >
                Voltar ao QR
              </button>
            </div>

            {summary(0)}
          </div>
        </>
      )}

      {phase === 'waiting' && (
        <>
          <h1 className="title">Confirme no seu telemóvel</h1>
          <p className="subtitle">
            Enviámos um pedido de {formatPrice(order.amountCents)} para o número
            terminado em {digits.slice(-3)}.
          </p>
          <div className="pay">
            <div className="panel" style={{ textAlign: 'center' }}>
              <div className="notice notice--info">À espera da sua confirmação…</div>
            </div>
            {summary(1)}
          </div>
        </>
      )}

      {phase === 'failed' && (
        <>
          <h1 className="title">Não conseguimos concluir</h1>
          <div className="notice notice--error" style={{ marginTop: 'var(--tne-space-lg)' }}>
            {error}
          </div>
          <p className="subtitle">
            Não foi cobrado nenhum valor. Pode tentar outra vez ou pagar ao balcão.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--tne-space-md)',
              marginTop: 'var(--tne-space-lg)',
              flexWrap: 'wrap',
            }}
          >
            <Button onClick={() => navigate(0)}>Tentar novamente</Button>
            <Button variant="secondary" onClick={() => navigate('/checkout')}>
              Escolher outro método
            </Button>
          </div>
        </>
      )}
    </Frame>
  )
}
