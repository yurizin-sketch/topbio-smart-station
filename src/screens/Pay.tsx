import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Numpad, PhoneDisplay, QrCode } from '../components/ui'
import { useSession } from '../state/session'
import { issueTicket } from '../services/tickets'
import { payByPhone, paymentStatus, startPayment } from '../services/payments'
import { config, formatPrice } from '../config'
import { legal } from '../data/legal'

/**
 * Pagar com MB WAY, lendo um QR com o telemóvel.
 *
 * Depois de pago segue para a fatura (`Invoice`), e só depois para o código.
 *
 * O QR abre a página de pagamento da Easypay no telemóvel do cliente; lá
 * escolhe MB WAY e confirma na app. O tablet fica só a perguntar ao servidor
 * se já entrou — e só segue para o código de levantamento quando o servidor
 * disser que sim.
 *
 * Ao lado do QR, o número: quem não quer apontar a câmara escreve o
 * telemóvel e o pedido chega já à app MB WAY, com o valor. Os dois caminhos
 * ficam abertos ao mesmo tempo — o servidor vê qualquer um que pague.
 *
 * Há sempre uma saída para o balcão: no botão, quando o pagamento no tablet
 * está desligado, quando falha, e quando o tempo acaba. A ficha emitida aqui é
 * a mesma que lá se mostra, por isso quem desiste do QR não fica com dois
 * códigos.
 */
type Fase =
  | { kind: 'a-preparar' }
  | { kind: 'qr'; url: string; demo: boolean }
  | { kind: 'falhou' }

/** O pagamento pelo número, à parte do QR. */
type Telefone = 'fechado' | 'a-escrever' | 'a-enviar' | 'enviado' | 'recusado' | 'invalido' | 'erro'

export function Pay() {
  const navigate = useNavigate()
  const { product, order, updateOrder } = useSession()
  const [fase, setFase] = useState<Fase>({ kind: 'a-preparar' })
  const [restante, setRestante] = useState<number>(config.payments.waitMs)
  const pago = useRef(false)
  const [telefone, setTelefone] = useState<Telefone>('fechado')
  const [digitos, setDigitos] = useState('')
  // O `setInterval` das perguntas lê isto, e não o estado: o estado que ele
  // vê é o do momento em que foi criado.
  const telefoneRef = useRef<Telefone>('fechado')
  telefoneRef.current = telefone

  const balcao = () => navigate('/checkout/ticket', { replace: true })

  const concluir = () => {
    if (pago.current) return
    pago.current = true
    updateOrder({ status: 'paid', method: 'mbway' })
    navigate('/checkout/fatura', { replace: true })
  }

  // Emitir a ficha e pedir a ligação de pagamento. Uma vez por encomenda.
  useEffect(() => {
    if (!product || !order) {
      navigate('/goals', { replace: true })
      return
    }
    let vivo = true
    const ficha = order.ticketCode
      ? { code: order.ticketCode, expiresAt: order.expiresAt }
      : issueTicket(order)
    const comFicha = {
      ...order,
      status: 'awaiting_counter' as const,
      ticketCode: ficha.code,
      expiresAt: ficha.expiresAt,
    }
    updateOrder({ status: 'awaiting_counter', ticketCode: ficha.code, expiresAt: ficha.expiresAt })

    void startPayment(comFicha).then((res) => {
      if (!vivo) return
      if (res.kind === 'off') balcao()
      else setFase({ kind: 'qr', url: res.url, demo: res.demo })
    })
    return () => {
      vivo = false
    }
    // Corre uma vez por encomenda: dois pedidos de pagamento seriam duas
    // ligações abertas para a mesma venda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  // Perguntar se já pagaram, e desistir quando o tempo acabar.
  useEffect(() => {
    if (fase.kind !== 'qr' || !order) return
    const fim = Date.now() + config.payments.waitMs
    let vivo = true

    const relogio = window.setInterval(() => {
      const falta = fim - Date.now()
      setRestante(Math.max(0, falta))
      if (falta <= 0) balcao()
    }, 1_000)

    // Na demonstração não há servidor a quem perguntar: paga-se no botão.
    const pergunta = fase.demo
      ? undefined
      : window.setInterval(() => {
          void paymentStatus(order.id).then((estado) => {
            if (!vivo) return
            if (estado.state === 'paid') concluir()
            else if (estado.state === 'failed') setFase({ kind: 'falhou' })
            else if (estado.phone === 'failed' && telefoneRef.current === 'enviado') setTelefone('recusado')
          })
        }, config.payments.pollMs)

    return () => {
      vivo = false
      window.clearInterval(relogio)
      if (pergunta) window.clearInterval(pergunta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase.kind, order?.id])

  if (!product || !order) return null

  const numeroOk = /^9\d{8}$/.test(digitos)
  const numeroBonito = digitos.replace(/(\d{3})(?=\d)/g, '$1 ')

  const enviarPedido = async () => {
    if (!numeroOk || telefone === 'a-enviar') return
    setTelefone('a-enviar')
    const res = await payByPhone(order.id, digitos)
    setTelefone(res === 'sent' ? 'enviado' : res === 'invalid' ? 'invalido' : 'erro')
  }

  const aEscrever = ['a-escrever', 'a-enviar', 'recusado', 'invalido', 'erro'].includes(telefone)

  const minutos = Math.floor(restante / 60_000)
  const segundos = Math.floor((restante % 60_000) / 1_000)

  return (
    <Frame legal={legal.supplement}>
      <p className="eyebrow">Pagamento</p>
      <h1 className="title">Pague com MB WAY</h1>

      <div className="pay">
        <div className="pay__qr">
          {fase.kind === 'a-preparar' && (
            <div className="notice notice--info">A preparar o pagamento…</div>
          )}
          {fase.kind === 'qr' && <QrCode value={fase.url} />}
          {fase.kind === 'falhou' && (
            <div className="notice notice--error" role="alert">
              O pagamento não foi concluído. Pode pagar no balcão com o nosso colega.
            </div>
          )}
        </div>

        <div className="panel">
          <p className="section-label">{product.name}</p>
          <p className="pay__total">{formatPrice(order.amountCents)}</p>

          {fase.kind === 'qr' && telefone === 'fechado' && (
            <ol className="subtitle" style={{ paddingLeft: '1.2em' }}>
              <li>Abra a câmara do telemóvel (não a app MB WAY) e aponte ao código.</li>
              <li>Abra a ligação e escolha MB WAY.</li>
              <li>Confirme o pagamento na app MB WAY.</li>
            </ol>
          )}

          {fase.kind === 'qr' && aEscrever && (
            <>
              <p className="section-label">O seu número MB WAY</p>
              <PhoneDisplay digits={digitos} />
              {telefone === 'recusado' && (
                <div className="notice notice--warn" role="alert">
                  O pagamento foi recusado ou cancelado na app. Pode tentar outra vez, ou ler o QR.
                </div>
              )}
              {telefone === 'invalido' && (
                <div className="notice notice--warn" role="alert">
                  Este número não parece certo. Confirme, por favor.
                </div>
              )}
              {telefone === 'erro' && (
                <div className="notice notice--error" role="alert">
                  Não consegui enviar o pedido. Tente outra vez, ou leia o QR.
                </div>
              )}
              <Numpad value={digitos} onChange={setDigitos} />
            </>
          )}

          {fase.kind === 'qr' && telefone === 'enviado' && (
            <div className="notice notice--info">
              {`Enviámos o pedido para o ${numeroBonito}. Abra a app MB WAY e confirme o pagamento.`}
            </div>
          )}

          {fase.kind === 'qr' && !aEscrever && (
            <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-lg)' }}>
              {`À espera do pagamento… ${minutos}:${String(segundos).padStart(2, '0')}`}
            </div>
          )}

          <div className="pay__actions">
            {fase.kind === 'qr' && telefone === 'fechado' && (
              <Button block onClick={() => setTelefone('a-escrever')}>
                Pagar com o número MB WAY
              </Button>
            )}
            {fase.kind === 'qr' && aEscrever && (
              <>
                <Button block disabled={!numeroOk || telefone === 'a-enviar'} onClick={() => void enviarPedido()}>
                  {telefone === 'a-enviar' ? 'A enviar…' : 'Enviar pedido para a app'}
                </Button>
                <Button
                  block
                  variant="secondary"
                  onClick={() => {
                    setDigitos('')
                    setTelefone('fechado')
                  }}
                >
                  Voltar ao QR
                </Button>
              </>
            )}
            {fase.kind === 'qr' && telefone === 'enviado' && (
              <Button block variant="secondary" onClick={() => setTelefone('a-escrever')}>
                Usar outro número
              </Button>
            )}
            {fase.kind === 'qr' && fase.demo && (
              <Button block onClick={concluir}>
                Simular pagamento (demonstração)
              </Button>
            )}
            <Button block variant="secondary" onClick={balcao}>
              Prefiro pagar no balcão
            </Button>
          </div>
        </div>
      </div>
    </Frame>
  )
}
