import { useEffect, useState } from 'react'

import { asset } from '../assets'

/** O retrato da personagem, se alguém o tiver posto lá. */
const PORTRAIT = '/claudia/retrato.png'

/*
   Uma pergunta só por sessão, guardada aqui: a estação fica ligada o dia
   todo e a Cláudia aparece e desaparece a cada cliente. Perguntar de cada
   vez era um pedido por cliente para saber sempre a mesma coisa.
*/
let lookup: Promise<boolean> | null = null

function temRetrato(): Promise<boolean> {
  lookup ??= fetch(asset(PORTRAIT))
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'))
    .catch(() => false)
  return lookup
}

/*
   A Cláudia.

   São duas Cláudias no mesmo sítio, uma por cima da outra.

   Por baixo, desenhada aqui em SVG: cabelo louro comprido e cheio, olhos
   castanhos grandes, sorriso aberto, bata branca. É a que está no ecrã hoje
   e a que fica se o retrato faltar. Um SVG não é um render 3D e nunca vai
   ser — mas é o mesmo penteado, a mesma cor de olhos e a mesma roupa, que é
   o que se reconhece a três metros de distância.

   Por cima, `claudia__photo`: o retrato a sério, o mesmo da personagem do
   HeyGen. Basta pôr o ficheiro em `public/claudia/retrato.png` e ele tapa o
   desenho todo — não é preciso mexer em código nenhum.

   Se o ficheiro não existir fica o desenho. Quem decide isso é o
   `temRetrato()` aqui em baixo, e a decisão é pelo tipo do conteúdo, não
   pelo browser dizer que correu mal. Foi preciso assim: um servidor de
   página única responde 200 com o index.html a qualquer caminho que não
   conheça, e o Chrome, ao receber isso dentro de um `<image>` de SVG, não
   dá erro nenhum — pinta lixo por cima da cara e fica-se sem saber porquê.
   Visto e corrigido, não suposto.

   O que se perde com o retrato é a boca a mexer: uma fotografia não fala.
   O respirar, o oscilar e o halo continuam, porque são movimentos do grupo
   todo. Boca a sério só com os vídeos do HeyGen — está em
   `docs/claudia-video.md`.

   Os tempos das animações são primos entre si de propósito: 4s, 5,1s e
   6,4s. Assim o respirar, o oscilar e o piscar nunca caem certos ao mesmo
   tempo, e ela não parece um relógio.
*/
export function Claudia({
  speaking,
  thinking,
  size = 132,
}: {
  speaking: boolean
  thinking: boolean
  /** Lado do quadrado, em pixels. */
  size?: number
}) {
  const state = speaking ? 'speaking' : thinking ? 'thinking' : 'idle'

  // Começa em falso: primeiro vê-se o desenho, e o retrato entra por cima
  // quando se souber que existe mesmo. Ao contrário, dava um piscar de lixo
  // sempre que ela aparecesse.
  const [portrait, setPortrait] = useState(false)

  useEffect(() => {
    let vivo = true
    void temRetrato().then((ok) => {
      if (vivo) setPortrait(ok)
    })
    return () => {
      vivo = false
    }
  }, [])

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

        {portrait ? (
          <image
            className="claudia__photo"
            href={asset(PORTRAIT)}
            x="0"
            y="0"
            width="120"
            height="120"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : null}
      </g>

      <circle className="claudia__ring" cx="60" cy="60" r="56" />
    </svg>
  )
}
