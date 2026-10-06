import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Numpad, PhoneDisplay } from '../components/ui'
import { useSession } from '../state/session'
import { issueTicket } from '../services/tickets'
import { payByPhone, paymentStatus, startPayment } from '../services/payments'
import { config, formatPrice } from '../config'
import { legal } from '../data/legal'

/**
 * Pagar com MB WAY pelo número de telemóvel.
 *
 * O cliente escreve o número, o pedido chega à app MB WAY dele já com o valor,
 * e ele confirma lá. O tablet fica só a perguntar ao servidor se já entrou — e
 * só segue quando o servidor disser que sim. Depois de pago vem a fatura
 * (`Invoice`), e só depois o código de levantamento.
 *
 * O ecrã diz por extenso para onde vai o número: para a Stripe, e para mais
 * lado nenhum. É a pergunta que qualquer pessoa faz antes de escrever o
 * telemóvel num ecrã de loja, e uma pergunta sem resposta é um cliente que
 * vai pagar ao balcão.
 *
 * Há sempre uma saída para o balcão: no botão, quando o pagamento no tablet
 * está desligado, e quando o tempo acaba. A ficha emitida aqui é a mesma que
 * lá se mostra, por isso quem desiste não fica com dois códigos.
 */
type Fase = 'a-preparar' | 'pronto'

type Telefone = 'a-escrever' | 'a-enviar' | 'enviado' | 'recusado' | 'invalido' | 'erro'

export function Pay() {
  const navigate = useNavigate()
  const { product, order, updateOrder } = useSession()
  const [fase, setFase] = useState<Fase>('a-preparar')
  const [demo, setDemo] = useState(false)
  const [restante, setRestante] = useState<number>(config.payments.waitMs)
  const pago = useRef(false)
  const [telefone, setTelefone] = useState<Telefone>('a-escrever')
  const [digitos, setDigitos] = useState('')

  const balcao = () => navigate('/checkout/ticket', { replace: true })

  const concluir = () => {
    if (pago.current) return
    pago.current = true
    updateOrder({ status: 'paid', method: 'mbway' })
    navigate('/checkout/fatura', { replace: true })
  }

  // Emitir a ficha e confirmar que se pode pagar aqui. Uma vez por encomenda.
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
      if (res.kind === 'off') return balcao()
      setDemo(res.demo)
      setFase('pronto')
    })
    return () => {
      vivo = false
    }
    // Corre uma vez por encomenda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  // O relógio: quem fica parado à frente do ecrã sem pagar vai para o balcão.
  useEffect(() => {
    if (fase !== 'pronto') return
    const fim = Date.now() + config.payments.waitMs
    const relogio = window.setInterval(() => {
      const falta = fim - Date.now()
      setRestante(Math.max(0, falta))
      if (falta <= 0) balcao()
    }, 1_000)
    return () => window.clearInterval(relogio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  // Perguntar se já pagaram — só depois de o pedido ter ido para a app.
  useEffect(() => {
    if (telefone !== 'enviado' || demo || !order) return
    let vivo = true
    const pergunta = window.setInterval(() => {
      void paymentStatus(order.id).then((estado) => {
        if (!vivo) return
        if (estado === 'paid') concluir()
        else if (estado === 'failed') setTelefone('recusado')
      })
    }, config.payments.pollMs)
    return () => {
      vivo = false
      window.clearInterval(pergunta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefone, demo, order?.id])

  if (!product || !order) return null

  const numeroOk = /^9\d{8}$/.test(digitos)
  const numeroBonito = digitos.replace(/(\d{3})(?=\d)/g, '$1 ')
  const aEscrever = telefone !== 'enviado'

  const enviarPedido = async () => {
    if (!numeroOk || telefone === 'a-enviar') return
    setTelefone('a-enviar')
    const res = await payByPhone(order.id, digitos)
    setTelefone(res === 'sent' ? 'enviado' : res === 'invalid' ? 'invalido' : 'erro')
  }

  const minutos = Math.floor(restante / 60_000)
  const segundos = Math.floor((restante % 60_000) / 1_000)

  return (
    <Frame legal={legal.supplement}>
      <p className="eyebrow">Pagamento</p>
      <h1 className="title">Pague com MB WAY</h1>

      <div className="panel pay-phone">
        <p className="section-label">{product.name}</p>
        <p className="pay__total">{formatPrice(order.amountCents)}</p>

        {fase === 'a-preparar' && <div className="notice notice--info">A preparar o pagamento…</div>}

        {fase === 'pronto' && aEscrever && (
          <>
            <p className="subtitle">
              Escreva aqui o seu número MB WAY. Enviamos o pedido de pagamento para a app, e só
              precisa de o confirmar lá.
            </p>
            <PhoneDisplay digits={digitos} />
            {telefone === 'recusado' && (
              <div className="notice notice--warn" role="alert">
                O pagamento foi recusado ou cancelado na app. Pode tentar outra vez.
              </div>
            )}
            {telefone === 'invalido' && (
              <div className="notice notice--warn" role="alert">
                Este número não parece certo. Confirme, por favor.
              </div>
            )}
            {telefone === 'erro' && (
              <div className="notice notice--error" role="alert">
                Não consegui enviar o pedido. Tente outra vez, ou pague no balcão.
              </div>
            )}
            <Numpad value={digitos} onChange={setDigitos} />
            <p className="pay-phone__privacy">
              O seu número segue apenas para a Stripe, que trata o pagamento. Nós não o guardamos.
            </p>
          </>
        )}

        {fase === 'pronto' && telefone === 'enviado' && (
          <>
            <div className="notice notice--info">
              {`Enviámos o pedido para o ${numeroBonito}. Abra a app MB WAY no telemóvel e confirme o pagamento.`}
            </div>
            <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-md)' }}>
              {`À espera da confirmação… ${minutos}:${String(segundos).padStart(2, '0')}`}
            </div>
          </>
        )}

        <div className="pay__actions">
          {fase === 'pronto' && aEscrever && (
            <Button
              block
              disabled={!numeroOk || telefone === 'a-enviar'}
              onClick={() => void enviarPedido()}
            >
              {telefone === 'a-enviar' ? 'A enviar…' : 'Enviar pedido para a app'}
            </Button>
          )}
          {fase === 'pronto' && telefone === 'enviado' && (
            <Button block variant="secondary" onClick={() => setTelefone('a-escrever')}>
              Usar outro número
            </Button>
          )}
          {fase === 'pronto' && demo && telefone === 'enviado' && (
            <Button block onClick={concluir}>
              Simular confirmação (demonstração)
            </Button>
          )}
          <Button block variant="secondary" onClick={balcao}>
            Prefiro pagar no balcão
          </Button>
        </div>
      </div>
    </Frame>
  )
}
