import { useLocation } from 'react-router-dom'
import { Bia } from './Bia'
import { useAssistant } from '../state/assistant'

/**
 * A assistente no ecrã.
 *
 * Vive fora dos ecrãs, colada ao canto, porque tem de sobreviver à navegação:
 * se fosse desenhada dentro de cada ecrã, desaparecia e reaparecia a cada
 * toque e a conversa parecia recomeçar do zero.
 *
 * No repouso é maior, porque é ela que chama a pessoa. Assim que a compra
 * começa encolhe para o canto: quem está a pagar não quer uma personagem a
 * disputar-lhe a atenção com o preço.
 */
export function Assistant() {
  const { pathname } = useLocation()
  const { turn, thinking, speaking, muted, needsUnlock, present, summon, choose, dismiss, toggleMute } =
    useAssistant()

  // O balcão não tem nada a ver com isto. Uma personagem a falar por cima da
  // fila de pedidos só atrapalharia quem está a trabalhar.
  if (pathname.startsWith('/staff')) return null

  const resting = pathname === '/kiosk' || pathname === '/'
  const open = Boolean(turn?.say) || thinking

  return (
    <aside className={`assistant${resting ? ' assistant--resting' : ''}`} aria-live="polite">
      {open && (
        <div className="assistant__bubble">
          <button
            className="assistant__close"
            onClick={dismiss}
            aria-label="Fechar a assistente"
            type="button"
          >
            ×
          </button>

          {thinking && !turn ? (
            <p className="assistant__thinking" aria-label="A pensar">
              <span />
              <span />
              <span />
            </p>
          ) : (
            <p className="assistant__say">{turn?.say}</p>
          )}

          {turn?.choices && turn.choices.length > 0 && (
            <div className="assistant__choices">
              {turn.choices.map((choice) => (
                <button
                  key={choice.value}
                  className="assistant__choice"
                  onClick={() => choose(choice)}
                  type="button"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="assistant__dock">
        <button
          className="assistant__avatar"
          type="button"
          // Tocar nela é pedir ajuda. É o caminho de quem não espera pela
          // câmara ou de quem lhe fechou o balão e se arrependeu.
          onClick={summon}
          aria-label="Falar com a Bia"
        >
          <Bia speaking={speaking} thinking={thinking} size={resting ? 168 : 104} />
        </button>

        <button
          className={`assistant__mute${muted ? ' assistant__mute--off' : ''}`}
          onClick={toggleMute}
          type="button"
          aria-pressed={muted}
          aria-label={muted ? 'Ligar a voz' : 'Desligar a voz'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/*
        O aviso do toque da manhã.
        Só no repouso e só antes do primeiro toque: os navegadores não deixam
        uma página falar sozinha antes de alguém lhe tocar, e sem este aviso
        quem abre a loja não faz ideia porque é que a Bia está muda.
      */}
      {resting && needsUnlock && !muted && (
        <p className="assistant__unlock">Toque uma vez no ecrã para dar voz à Bia</p>
      )}

      {/*
        Transparência sobre a câmara.
        Só aparece quando a câmara está mesmo a funcionar, e diz a verdade
        inteira: a estação conta pixels para saber que está alguém, não grava
        nem envia imagem nenhuma. Um aviso destes custa uma linha e evita a
        pergunta desconfortável ao balcão.
      */}
      {resting && present !== null && (
        <p className="assistant__privacy">
          A câmara só deteta que está alguém à frente. Não grava nem envia imagens.
        </p>
      )}
    </aside>
  )
}
