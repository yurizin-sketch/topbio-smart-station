import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame, Numpad, PhoneDisplay, QrCode } from '../components/ui'
import { useSession } from '../state/session'
import { issueTicket } from '../services/tickets'
import {
  payByCard,
  payByPhone,
  paymentStatus,
  startPayment,
  type MbwayVia,
} from '../services/payments'
import { config, describeOrder, formatPrice } from '../config'
import { legal } from '../data/legal'
import type { PaymentMethod } from '../types'

/**
 * Pagar no tablet: MB WAY pelo número, ou cartão por um QR.
 *
 * No MB WAY o cliente escreve o número, o pedido chega à app MB WAY dele já
 * com o valor, e ele confirma lá. No cartão o tablet mostra um QR que a
 * câmara do telemóvel lê, e que abre a página de pagamento da Stripe — onde
 * entram também o Apple Pay e o Google Pay. Nos dois casos o tablet fica só a
 * perguntar ao servidor se já entrou, e só segue quando o servidor disser que
 * sim. Depois de pago vem a fatura (`Invoice`), e só depois o código de
 * levantamento.
 *
 * O ecrã diz por extenso para onde vai o número: para quem trata o pagamento,
 * e para mais lado nenhum. É a pergunta que qualquer pessoa faz antes de
 * escrever o telemóvel num ecrã de loja, e uma pergunta sem resposta é um
 * cliente que vai pagar ao balcão.
 *
 * Há sempre uma saída para o balcão: no botão, quando o pagamento no tablet
 * está desligado, e quando o tempo acaba. A ficha emitida aqui é a mesma que
 * lá se mostra, por isso quem desiste não fica com dois códigos.
 */
type Fase = 'a-preparar' | 'pronto'

type Telefone =
  | 'a-escrever'
  | 'a-enviar'
  | 'enviado'
  | 'expirado'
  | 'recusado'
  | 'invalido'
  | 'erro'

/** A página do cartão: por pedir, a pedir, aberta (com o endereço) ou falhada. */
type Cartao = { estado: 'nada' } | { estado: 'a-abrir' } | { estado: 'aberto'; url: string } | { estado: 'erro' }

type Via = 'mbway' | 'cartao'

const QUEM: Record<MbwayVia, string> = { ifthenpay: 'a ifthenpay', stripe: 'a Stripe' }

export function Pay() {
  const navigate = useNavigate()
  const { product, order, updateOrder } = useSession()
  const [fase, setFase] = useState<Fase>('a-preparar')
  const [demo, setDemo] = useState(false)
  const [restante, setRestante] = useState<number>(config.payments.waitMs)
  const pago = useRef(false)
  const [telefone, setTelefone] = useState<Telefone>('a-escrever')
  const [digitos, setDigitos] = useState('')
  const [enviadoEm, setEnviadoEm] = useState(0)
  const [mbway, setMbway] = useState<MbwayVia | null>(null)
  const [comCartao, setComCartao] = useState(false)
  const [via, setVia] = useState<Via>('mbway')
  const [cartao, setCartao] = useState<Cartao>({ estado: 'nada' })

  const balcao = () => navigate('/checkout/ticket', { replace: true })

  const concluir = (method: PaymentMethod) => {
    if (pago.current) return
    pago.current = true
    updateOrder({ status: 'paid', method })
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
      setMbway(res.mbway)
      setComCartao(res.card)
      // Sem MB WAY ligado, o ecrã abre já do lado do cartão.
      setVia(res.mbway ? 'mbway' : 'cartao')
      setFase('pronto')
    })
    return () => {
      vivo = false
    }
    // Corre uma vez por encomenda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  // O relógio: quem fica parado à frente do ecrã sem pagar vai para o balcão.
  // Conta desde o último gesto — quem acabou de pedir outra vez não está parado.
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
  }, [fase, telefone, cartao.estado, via])

  // O pedido MB WAY morre na app ao fim de `mbwayMs`. Aí o ecrã diz que
  // expirou e deixa enviar outro, com o número ainda escrito.
  useEffect(() => {
    if (telefone !== 'enviado') return
    const t = window.setTimeout(
      () => setTelefone((agora) => (agora === 'enviado' ? 'expirado' : agora)),
      config.payments.mbwayMs,
    )
    return () => window.clearTimeout(t)
  }, [telefone, enviadoEm])

  // Abrir a página do cartão quando se escolhe esse lado. Uma vez: voltar ao
  // MB WAY e outra vez ao cartão mostra o mesmo QR. Volta a abrir-se só
  // depois de um erro ou de a página expirar (`estado` de volta a `nada`).
  useEffect(() => {
    if (fase !== 'pronto' || via !== 'cartao' || !order || cartao.estado !== 'nada') return
    setCartao({ estado: 'a-abrir' })
    void payByCard(order.id).then((url) =>
      setCartao(url ? { estado: 'aberto', url } : { estado: 'erro' }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, via, order?.id, cartao.estado])

  // Perguntar se já pagaram — só depois de haver um pedido do lado de lá.
  //
  // O servidor pergunta pelo último pedido feito, seja MB WAY ou cartão. O
  // método que vale para a fatura é o do lado que está aberto no ecrã.
  //
  // Depois de expirar continua-se a perguntar: quem confirmou no último
  // segundo pagou, e a resposta pode chegar já com o aviso no ecrã.
  const aEsperar =
    (via === 'mbway' && (telefone === 'enviado' || telefone === 'expirado')) ||
    (via === 'cartao' && cartao.estado === 'aberto')
  useEffect(() => {
    if (!aEsperar || demo || !order) return
    let vivo = true
    const pergunta = window.setInterval(() => {
      void paymentStatus(order.id).then((estado) => {
        if (!vivo) return
        if (estado === 'paid') concluir(via === 'cartao' ? 'cartao' : 'mbway')
        else if (estado === 'failed') {
          if (via === 'mbway') setTelefone('recusado')
          else setCartao({ estado: 'nada' })
        }
      })
    }, config.payments.pollMs)
    return () => {
      vivo = false
      window.clearInterval(pergunta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEsperar, via, demo, order?.id])

  if (!product || !order) return null

  const numeroOk = /^9\d{8}$/.test(digitos)
  const numeroBonito = digitos.replace(/(\d{3})(?=\d)/g, '$1 ')
  const aEscrever = telefone !== 'enviado'
  const doisLados = Boolean(mbway) && comCartao

  const enviarPedido = async () => {
    if (!numeroOk || telefone === 'a-enviar') return
    setTelefone('a-enviar')
    const res = await payByPhone(order.id, digitos)
    if (res === 'sent') setEnviadoEm(Date.now())
    setTelefone(res === 'sent' ? 'enviado' : res === 'invalid' ? 'invalido' : 'erro')
  }

  const minutos = Math.floor(restante / 60_000)
  const segundos = Math.floor((restante % 60_000) / 1_000)
  const relogio = `${minutos}:${String(segundos).padStart(2, '0')}`
  // O `restante` muda a cada segundo, e é isso que faz este voltar a contar.
  const faltaMb = Math.max(0, enviadoEm + config.payments.mbwayMs - Date.now())
  const relogioMb = `${Math.floor(faltaMb / 60_000)}:${String(Math.floor((faltaMb % 60_000) / 1_000)).padStart(2, '0')}`

  return (
    <Frame legal={legal.supplement}>
      <p className="eyebrow">Pagamento</p>
      <h1 className="title">{via === 'cartao' ? 'Pague com cartão' : 'Pague com MB WAY'}</h1>

      <div className="panel pay-phone">
        <p className="section-label">{describeOrder(order)}</p>
        <p className="pay__total">{formatPrice(order.amountCents)}</p>

        {fase === 'a-preparar' && <div className="notice notice--info">A preparar o pagamento…</div>}

        {fase === 'pronto' && doisLados && (
          <div className="tabs pay__via" role="tablist">
            <div className="tabs__strip">
              <button
                type="button"
                role="tab"
                aria-selected={via === 'mbway'}
                className={`tabs__btn${via === 'mbway' ? ' tabs__btn--on' : ''}`}
                onClick={() => setVia('mbway')}
              >
                MB WAY
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={via === 'cartao'}
                className={`tabs__btn${via === 'cartao' ? ' tabs__btn--on' : ''}`}
                onClick={() => setVia('cartao')}
              >
                Cartão · Apple Pay · Google Pay
              </button>
            </div>
          </div>
        )}

        {fase === 'pronto' && via === 'mbway' && aEscrever && (
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
            {telefone === 'expirado' && (
              <div className="notice notice--warn" role="alert">
                O pedido expirou na app antes de ser confirmado. Envie outro: é só carregar no botão.
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
              {`O seu número segue apenas para ${QUEM[mbway ?? 'stripe']}, que trata o pagamento. Nós não o guardamos.`}
            </p>
          </>
        )}

        {fase === 'pronto' && via === 'mbway' && telefone === 'enviado' && (
          <>
            <div className="notice notice--info">
              {`Enviámos o pedido para o ${numeroBonito}. Abra a app MB WAY no telemóvel e confirme o pagamento.`}
            </div>
            <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-md)' }}>
              {`Tem ${relogioMb} para confirmar na app.`}
            </div>
          </>
        )}

        {fase === 'pronto' && via === 'cartao' && (
          <>
            <p className="subtitle">
              Aponte a câmara do telemóvel a este código. Abre a página segura da Stripe, onde paga
              com cartão, Apple Pay ou Google Pay.
            </p>
            {(cartao.estado === 'nada' || cartao.estado === 'a-abrir') && (
              <div className="notice notice--info">A preparar o código…</div>
            )}
            {cartao.estado === 'aberto' && (
              <>
                <QrCode value={cartao.url} size={320} />
                <p className="pay-phone__privacy">
                  Use a câmara do telemóvel, não a app MB WAY: este código não é de MB WAY. Os dados
                  do cartão escrevem-se no seu telemóvel, nunca neste ecrã.
                </p>
                <div className="notice notice--info" style={{ marginTop: 'var(--tne-space-md)' }}>
                  {`À espera do pagamento… ${relogio}`}
                </div>
              </>
            )}
            {cartao.estado === 'erro' && (
              <div className="notice notice--error" role="alert">
                {mbway
                  ? 'Não consegui preparar o pagamento por cartão. Pode pagar com MB WAY, ou no balcão.'
                  : 'Não consegui preparar o pagamento por cartão. Pode pagar no balcão.'}
              </div>
            )}
          </>
        )}

        <div className="pay__actions">
          {fase === 'pronto' && via === 'mbway' && aEscrever && (
            <Button
              block
              disabled={!numeroOk || telefone === 'a-enviar'}
              onClick={() => void enviarPedido()}
            >
              {telefone === 'a-enviar'
                ? 'A enviar…'
                : telefone === 'expirado' || telefone === 'recusado'
                  ? 'Enviar outro pedido'
                  : 'Enviar pedido para a app'}
            </Button>
          )}
          {fase === 'pronto' && via === 'mbway' && telefone === 'enviado' && (
            <Button block variant="secondary" onClick={() => setTelefone('a-escrever')}>
              Usar outro número
            </Button>
          )}
          {fase === 'pronto' && via === 'cartao' && cartao.estado === 'erro' && (
            <Button block variant="secondary" onClick={() => setCartao({ estado: 'nada' })}>
              Tentar outra vez
            </Button>
          )}
          {fase === 'pronto' && demo && aEsperar && (
            <Button block onClick={() => concluir(via === 'cartao' ? 'cartao' : 'mbway')}>
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
