import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { emailValido, nifValido, saveInvoice } from '../services/payments'
import { legal } from '../data/legal'

/**
 * Fatura, depois de pago.
 *
 * Pergunta-se depois e não antes: quem está a pagar quer pagar, e uma
 * pergunta a meio é um passo a mais entre a pessoa e o QR. Depois de pago já
 * não há pressa — e quem não quer fatura toca em «Não» e tem o código.
 *
 * A estação não emite a fatura. Leva nome, NIF e email até ao balcão, que a
 * passa no weoInvoice (o programa certificado) e a envia por email de lá.
 * Sem NIF é a fatura de consumidor final, que a loja passa na mesma.
 *
 * O código de levantamento está no topo deste ecrã também: se a pessoa se for
 * embora a meio do formulário, já o viu.
 */
export function Invoice() {
  const navigate = useNavigate()
  const { product, order, updateOrder } = useSession()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [nif, setNif] = useState('')
  const [email, setEmail] = useState('')
  const [tentou, setTentou] = useState(false)
  const [aEnviar, setAEnviar] = useState(false)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    if (!product || !order) navigate('/kiosk', { replace: true })
  }, [product, order, navigate])

  if (!product || !order) return null

  const nifLimpo = nif.replace(/\D/g, '')
  const nifOk = nifLimpo === '' || nifValido(nifLimpo)
  const emailOk = emailValido(email.trim())
  const podeEnviar = nifOk && emailOk

  const seguir = () => navigate('/success', { replace: true })

  const enviar = async () => {
    setTentou(true)
    if (!podeEnviar || aEnviar) return
    setAEnviar(true)
    setFalhou(false)
    const dados = {
      invoiceName: nome.trim() || undefined,
      nif: nifLimpo || undefined,
      invoiceEmail: email.trim(),
    }
    const ok = await saveInvoice(order.id, dados)
    setAEnviar(false)
    if (!ok) {
      setFalhou(true)
      return
    }
    updateOrder(dados)
    seguir()
  }

  return (
    <Frame legal={legal.supplement}>
      <p className="eyebrow">Pagamento confirmado · {order.ticketCode}</p>
      <h1 className="title">Quer fatura?</h1>

      {!aberto ? (
        <div className="panel invoice">
          <p className="subtitle">
            Enviamos a fatura para o seu email. Se não precisar, siga já para o código de
            levantamento.
          </p>
          <div className="invoice__choices">
            <Button block onClick={() => setAberto(true)}>
              Sim, quero fatura
            </Button>
            <Button block variant="secondary" onClick={seguir}>
              Não, obrigado
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="panel invoice"
          // Sem isto o browser trava o envio com o balãozinho dele num email
          // incompleto, e o aviso grande deste ecrã nunca chega a aparecer.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
        >
          <label className="field">
            <span className="section-label">Nome</span>
            <input
              className="field__input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="off"
              maxLength={120}
              placeholder="Como quer que apareça na fatura"
            />
          </label>

          <label className="field">
            <span className="section-label">NIF (opcional)</span>
            <input
              className="field__input"
              value={nif}
              onChange={(e) => setNif(e.target.value.replace(/\D/g, '').slice(0, 9))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="9 algarismos"
            />
          </label>
          {tentou && !nifOk && (
            <div className="notice notice--warn" role="alert">
              Este NIF não parece certo. Confirme os números, ou deixe em branco.
            </div>
          )}

          <label className="field">
            <span className="section-label">Email</span>
            <input
              className="field__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              maxLength={160}
              placeholder="para onde enviamos a fatura"
            />
          </label>
          {tentou && !emailOk && (
            <div className="notice notice--warn" role="alert">
              Falta o email, ou não está completo.
            </div>
          )}

          {falhou && (
            <div className="notice notice--error" role="alert">
              Não consegui enviar agora. Peça a fatura ao colega no balcão, com o seu código.
            </div>
          )}

          <p className="invoice__privacy">
            Usamos estes dados só para emitir e enviar a sua fatura.
          </p>

          <div className="invoice__choices">
            <Button block type="submit" disabled={aEnviar}>
              {aEnviar ? 'A enviar…' : 'Enviar e ver o código'}
            </Button>
            <Button block variant="secondary" onClick={seguir}>
              {falhou ? 'Ver o código' : 'Afinal, não quero fatura'}
            </Button>
          </div>
        </form>
      )}
    </Frame>
  )
}
