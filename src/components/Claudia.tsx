import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { asset } from '../assets'

/*
   A figura: dois ficheiros recortados, o mesmo fundo transparente nos dois.
   O `parada` é um fotograma só; o `falar` é esse fotograma a mexer-se.
*/
const FIGURA = { parada: '/claudia/parada.webp', falar: '/claudia/a-falar.webp' }

/*
   Uma pergunta só por sessão, guardada aqui: a estação fica ligada o dia
   todo e a Cláudia aparece e desaparece a cada cliente. Perguntar de cada
   vez era um pedido por cliente para saber sempre a mesma coisa.
*/
const perguntado = new Map<string, Promise<boolean>>()

function existe(caminho: string, tipo: string): Promise<boolean> {
  let r = perguntado.get(caminho)
  if (!r) {
    r = fetch(asset(caminho))
      .then((res) => res.ok && (res.headers.get('content-type') ?? '').startsWith(tipo))
      .catch(() => false)
    perguntado.set(caminho, r)
  }
  return r
}

/*
   A Cláudia.

   Fica parada. Só se mexe enquanto está mesmo a falar, e volta ao sossego
   quando acaba — foi pedido assim, e é o que se faz numa loja: uma figura a
   gesticular sozinha o dia todo cansa quem está ao balcão e deixa de se
   notar quando é a sério.

   São duas camadas no mesmo sítio. Por baixo, `parada.webp`, um fotograma
   recortado — é ela sossegada, e não gasta nada. Por cima, `a-falar.webp`,
   que só existe no ecrã enquanto ela fala: entra quando ela abre a boca e
   sai quando acaba. Enquanto está calada não há nada a descodificar.

   As duas imagens partem do mesmo fotograma — o último do clip, de braços
   em baixo — e o clip foi invertido para começar e acabar nessa pose. Por
   isso a troca não dá salto: o primeiro fotograma do movimento é
   exactamente aquele que já lá estava parado.

   É uma imagem animada e não um vídeo, e é de propósito. Um `<video>`
   depende de o browser deixar arrancar sozinho e de não estar a poupar
   bateria — num tablet de loja, aberto o dia todo, isso falha calado e
   ninguém dá por ela. Uma imagem anda sempre.

   Ambos vêm com fundo transparente. O verde foi tirado uma vez, no
   ficheiro, e não no tablet: recortar imagem doze vezes por segundo num
   aparelho de loja é gastar bateria para chegar ao mesmo sítio.

   Se nem a imagem existir, fica o desenho em SVG aqui em baixo, que não
   depende de ficheiro nenhum. Quem escolhe é o `existe()` aqui em cima, e a
   decisão é pelo tipo do conteúdo, não por o browser dizer que correu mal:
   um servidor de página única responde 200 com o index.html a qualquer
   caminho que não conheça, e o Chrome, ao receber isso, não dá erro nenhum
   — pinta lixo e fica-se sem saber porquê. Visto e corrigido, não suposto.

   O clip não tem som. Quem fala é a ElevenLabs, que diz também as frases
   que ela inventa na hora; se o clip trouxesse voz eram duas vozes na mesma
   pessoa. O preço é a boca não acompanhar as palavras.
*/
export function Claudia({
  speaking,
  thinking,
  size = 132,
}: {
  speaking: boolean
  thinking: boolean
  /** Lado do quadrado no desenho; largura de partida da figura recortada. */
  size?: number
}) {
  const state = speaking ? 'speaking' : thinking ? 'thinking' : 'idle'

  // Começa em falso: primeiro vê-se o desenho, e a figura entra por cima
  // quando se souber que existe mesmo.
  const [parada, setParada] = useState(false)
  const [falar, setFalar] = useState(false)

  useEffect(() => {
    let vivo = true
    void existe(FIGURA.parada, 'image/').then((ok) => {
      if (vivo) setParada(ok)
    })
    void existe(FIGURA.falar, 'image/').then((ok) => {
      if (vivo) setFalar(ok)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (parada) return <Figura speaking={speaking} state={state} width={size} comClip={falar} />

  return <Desenhada state={state} size={size} />
}

/* A Cláudia recortada, parada, que só se mexe enquanto fala. */
function Figura({
  speaking,
  state,
  width,
  comClip,
}: {
  speaking: boolean
  state: string
  width: number
  comClip: boolean
}) {
  /*
     Puxar o clip para a cache assim que se sabe que existe, e não à
     primeira resposta. É mais de um megabyte: pedi-lo só quando ela começa
     a falar dava meio segundo de figura quieta em cima de uma pergunta já
     respondida.
  */
  useEffect(() => {
    if (!comClip) return
    const aquecer = new Image()
    aquecer.src = asset(FIGURA.falar)
  }, [comClip])

  /*
     A parada só desaparece depois de o movimento estar mesmo pintado.

     São as duas recortadas, e por isso a de baixo via-se pelos buracos da
     de cima: quando ela levantava o braço, o braço parado continuava lá
     atrás e ela parecia ter dois. Esconder a parada à cabeça também não
     servia — se o clip demorasse a decidir-se, ficava um vazio no ecrã.
     Portanto: uma sai quando a outra entra, e nem antes nem depois.
  */
  const [clipPronto, setClipPronto] = useState(false)
  useEffect(() => {
    if (!speaking) setClipPronto(false)
  }, [speaking])

  const movimento = comClip && speaking && clipPronto

  return (
    <div
      className={`claudia-figura claudia-figura--${state}${
        movimento ? ' claudia-figura--movimento' : ''
      }`}
      /* A largura vive numa variável e não no `width`: assim uma media
         query pode dar-lhe outra sem lutar com o estilo em linha, que
         ganha sempre. A altura sai da proporção, no css. */
      style={{ '--claudia-largura': `${width}px` } as CSSProperties}
      role="img"
      aria-label="Cláudia, assistente da TopBio"
    >
      <img className="claudia-figura__parada" src={asset(FIGURA.parada)} alt="" />
      {comClip && speaking ? (
        <img
          className="claudia-figura__clip"
          src={asset(FIGURA.falar)}
          alt=""
          /* Vindo da cache, a imagem pode ficar pronta antes de o React
             pendurar o `onLoad`. O `ref` apanha esse caso; o `onLoad`
             apanha o outro. */
          ref={(el) => {
            if (el?.complete) setClipPronto(true)
          }}
          onLoad={() => setClipPronto(true)}
        />
      ) : null}
    </div>
  )
}

/*
   A Cláudia desenhada, que é a que fica quando não há ficheiro nenhum.

   Cabelo louro comprido, olhos castanhos grandes, sorriso aberto, bata
   branca. Um SVG não é um render 3D e nunca vai ser — mas é o mesmo
   penteado, a mesma cor de olhos e a mesma roupa, que é o que se reconhece
   a três metros de distância.

   Os tempos das animações são primos entre si de propósito: 4s, 5,1s e
   6,4s. Assim o respirar, o oscilar e o piscar nunca caem certos ao mesmo
   tempo, e ela não parece um relógio.
*/
function Desenhada({ state, size }: { state: string; size: number }) {
  return (
    <svg
      className={`claudia claudia--${state}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Cláudia, assistente da TopBio"
    >
      <defs>
        <clipPath id="claudia-frame">
          <circle cx="60" cy="60" r="57" />
        </clipPath>
        {/* Fundo claro e neutro, como no retrato. A bata é branca: num fundo
            escuro ficava um borrão a flutuar. */}
        <linearGradient id="claudia-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3eee7" />
          <stop offset="100%" stopColor="#d9d0c3" />
        </linearGradient>
      </defs>

      <g clipPath="url(#claudia-frame)">
        <rect x="0" y="0" width="120" height="120" fill="url(#claudia-bg)" />
        <circle className="claudia__halo" cx="60" cy="60" r="52" />

        <g className="claudia__body">
          {/* O cabelo de trás oscila com a cabeça, senão a cara desliza por
              dentro dele. São dois grupos com a mesma classe e por isso com
              a mesma animação — andam sempre certos um com o outro. */}
          <g className="claudia__head">
            <path
              className="claudia__hair-back"
              d="M60 6 C32 6 13 25 13 55 C13 72 10 91 8 110 C8 118 11 121 15 121 L105 121 C109 121 112 118 112 110 C110 91 107 72 107 55 C107 25 88 6 60 6 Z"
            />
          </g>

          <path
            className="claudia__shoulders"
            d="M18 120 C20 101 34 92 48 88 L72 88 C86 92 100 101 102 120 Z"
          />
          <path className="claudia__inner" d="M50 88 L60 104 L70 88 L70 120 L50 120 Z" />
          <path className="claudia__collar" d="M48 88 L60 105 L72 88" />

          <g className="claudia__head">
            <path
              className="claudia__hair-front"
              d="M37 44 C32 58 31 80 34 100 C38 104 45 105 49 102 C43 90 41 66 44 46 Z"
            />
            <path
              className="claudia__hair-front"
              d="M83 44 C88 58 89 80 86 100 C82 104 75 105 71 102 C77 90 79 66 76 46 Z"
            />
            <path className="claudia__neck" d="M53 71 L53 86 C53 90 67 90 67 86 L67 71 Z" />
            <ellipse className="claudia__ear" cx="35.5" cy="57" rx="3.4" ry="4.8" />
            <ellipse className="claudia__ear" cx="84.5" cy="57" rx="3.4" ry="4.8" />
            <path
              className="claudia__face"
              d="M36 48 C36 29 46 21 60 21 C74 21 84 29 84 48 C84 69 74 83 60 83 C46 83 36 69 36 48 Z"
            />
            <ellipse className="claudia__blush" cx="44" cy="63" rx="5" ry="3" />
            <ellipse className="claudia__blush" cx="76" cy="63" rx="5" ry="3" />

            {/* A franja cai da risca ao lado e atravessa a testa. */}
            <path
              className="claudia__hair"
              d="M36 45 C36 30 46 21 60 21 C72 21 81 27 84 38 C79 31 71 28 63 29 C54 30 45 35 41 44 C40 47 36 48 36 45 Z"
            />
            <path className="claudia__strand" d="M34 46 C35 32 43 21 56 16 C45 23 39 33 37 47 Z" />

            <g className="claudia__brows">
              <path d="M44 44 Q51 39.5 58 43.5" />
              <path d="M62 43.5 Q69 39.5 76 44" />
            </g>

            {/* Olhos grandes, castanhos. O brilho é o que os tira de vidrados. */}
            <g className="claudia__eyes">
              <ellipse className="claudia__sclera" cx="51" cy="55" rx="6.2" ry="7" />
              <circle className="claudia__iris" cx="51" cy="55.5" r="4.6" />
              <circle className="claudia__pupil" cx="51" cy="55.5" r="2.1" />
              <circle className="claudia__glint" cx="49.2" cy="53.2" r="1.7" />
              <circle className="claudia__glint" cx="53" cy="57.8" r="0.8" />
              <path className="claudia__lash" d="M44.4 51.6 Q51 45.4 57.6 51.6" />

              <ellipse className="claudia__sclera" cx="69" cy="55" rx="6.2" ry="7" />
              <circle className="claudia__iris" cx="69" cy="55.5" r="4.6" />
              <circle className="claudia__pupil" cx="69" cy="55.5" r="2.1" />
              <circle className="claudia__glint" cx="67.2" cy="53.2" r="1.7" />
              <circle className="claudia__glint" cx="71" cy="57.8" r="0.8" />
              <path className="claudia__lash" d="M62.4 51.6 Q69 45.4 75.6 51.6" />
            </g>

            {/* Duas bocas, uma de cada vez — ver o comentário no kiosk.css. */}
            <g className="claudia__mouth">
              <path className="claudia__smile" d="M50 67 Q60 78.5 70 67 Z" />
              <path className="claudia__teeth" d="M51 67.4 Q60 71.8 69 67.4 Z" />
              <ellipse className="claudia__open" cx="60" cy="70" rx="5" ry="4.4" />
            </g>
          </g>
        </g>

      </g>

      <circle className="claudia__ring" cx="60" cy="60" r="56" />
    </svg>
  )
}
