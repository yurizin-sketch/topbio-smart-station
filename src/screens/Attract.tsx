import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import { asset } from '../assets'

/**
 * Ecrã de repouso.
 *
 * É o que o tablet mostra 90% do dia, por isso é o que mais trabalha a
 * marca. Tudo aqui é tocável: quem passa não devia ter de encontrar o botão
 * certo — qualquer toque no ecrã começa a sessão.
 */
export function Attract() {
  const navigate = useNavigate()
  const { reset } = useSession()

  // Chegar aqui é sempre um recomeço, venha de onde vier.
  useEffect(() => reset(), [reset])

  const start = () => {
    track({ type: 'session_start' })
    navigate('/goals')
  }

  return (
    <Frame dark bare legal={legal.supplement}>
      <div
        className="attract"
        onClick={start}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && start()}
      >
        {/*
          Fundo próprio, sem fotografia.
          TODO(fotografia): substituir por um still de campanha TopBio quando
          existir. Não reaproveitar imagens com rótulos "Topnew" — o rebrand
          já foi feito e o quiosque é a primeira coisa que o cliente vê.
        */}
        <div className="attract__backdrop" aria-hidden="true">
          <img
            className="attract__watermark"
            src={asset('/media/brand/topbio-symbol-white.svg')}
            alt=""
          />
        </div>

        <img
          className="station__logo"
          src={asset('/media/brand/topbio-logo-white.svg')}
          alt="TopBio Europa"
          style={{
            display: 'block',
            marginBottom: 'var(--tne-space-lg)',
          }}
        />

        <p className="eyebrow">Recomendação personalizada</p>
        <h1 className="display">
          O seu bem-estar
          <br />
          começa aqui
        </h1>
        <p className="subtitle">
          Responda a uma pergunta e encontre a opção certa para a sua rotina.
        </p>

        <div style={{ marginTop: 'var(--tne-space-xl)' }}>
          <Button onClick={start}>Toque para começar →</Button>
        </div>

        <span className="attract__hint">Toque em qualquer parte do ecrã</span>
      </div>
    </Frame>
  )
}
