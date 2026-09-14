import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { useSession } from '../state/session'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import { asset } from '../assets'
import { attractVideos } from '../data/attract'

/**
 * Ecrã de repouso.
 *
 * É o que o tablet mostra 90% do dia, por isso é o que mais trabalha a
 * marca. Tudo aqui é tocável: quem passa não devia ter de encontrar o botão
 * certo — qualquer toque no ecrã começa a sessão.
 *
 * Quando há vídeos configurados em `data/attract.ts`, eles passam em cadeia por
 * trás do mesmo convite; sem eles, fica o fundo com a marca. Ver esse ficheiro
 * para trocar os clips.
 */
export function Attract() {
  const navigate = useNavigate()
  const { reset } = useSession()

  // Qual o clip a passar, e se algum falhou a carregar. Se falhar (ou não
  // houver lista), recua-se para o fundo com a marca em vez de deixar o ecrã
  // de montra em preto.
  const [clipe, setClipe] = useState(0)
  const [videoFalhou, setVideoFalhou] = useState(false)
  const clipeAtual =
    attractVideos.length > 0 ? attractVideos[clipe % attractVideos.length] : undefined
  const comVideo = Boolean(clipeAtual) && !videoFalhou

  // Chegar aqui é sempre um recomeço, venha de onde vier.
  useEffect(() => reset(), [reset])

  const start = () => {
    track({ type: 'session_start' })
    navigate('/goals')
  }

  return (
    <Frame dark bare legal={legal.supplement}>
      <div
        className={comVideo ? 'attract attract--video' : 'attract'}
        onClick={start}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && start()}
      >
        {comVideo && clipeAtual ? (
          <video
            // `key` força um <video> novo a cada troca de clip: mudar só o src
            // não voltava a arrancar sozinho. Muda a key, o elemento renasce e
            // faz play do princípio.
            key={clipe}
            className="attract__video"
            src={asset(clipeAtual)}
            autoPlay
            muted
            playsInline
            // Um só clip repete-se; vários passam em cadeia e recomeçam.
            loop={attractVideos.length === 1}
            onEnded={() => setClipe((i) => (i + 1) % attractVideos.length)}
            onError={() => setVideoFalhou(true)}
            aria-hidden="true"
          />
        ) : (
          /*
            Fundo próprio, sem fotografia.
            TODO(fotografia): substituir por um still de campanha TopBio quando
            existir. Não reaproveitar imagens com rótulos "Topnew" — o rebrand
            já foi feito e o quiosque é a primeira coisa que o cliente vê.
          */
          <div className="attract__backdrop" aria-hidden="true">
            <img
              className="attract__watermark"
              src={asset('/media/brand/topbio-symbol-white.svg')}
              alt=""
            />
          </div>
        )}

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
