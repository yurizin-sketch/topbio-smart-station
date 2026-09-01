/**
 * A Cláudia — a assistente da estação.
 *
 * Desenhada em SVG e animada em CSS, de propósito. Um vídeo ou um modelo 3D
 * pesariam megabytes, precisariam de ser regravados a cada mudança de marca e
 * ficariam pixelizados no tablet seguinte. Isto são uns kilobytes de vetores
 * nas cores da casa, nítidos em qualquer ecrã e recoloríveis num token.
 *
 * DESENHADA PARA SER VISTA PEQUENA. Durante a compra ela mede cem pixels, e a
 * cem pixels os pormenores desaparecem: o que sobrevive são traços grossos e
 * contrastes fortes. Por isso a boca é um traço curvo e não uma forma cheia,
 * os olhos são grandes de mais para uma cara real, e não há nariz — um nariz a
 * este tamanho é sujidade no ecrã.
 *
 * O movimento é o que a faz parecer viva e são três animações ao mesmo tempo
 * com períodos que não batem certo uns com os outros — respirar a 4s, oscilar
 * a 5,1s, piscar a 6,4s. Números que não se dividem, para o olho nunca apanhar
 * o ciclo. Uma personagem que repete de dois em dois segundos lê-se como um
 * GIF partido.
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
        <linearGradient id="claudia-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d7a62" />
          <stop offset="100%" stopColor="#00453a" />
        </linearGradient>
      </defs>

      {/* Halo que pulsa enquanto fala. É o sinal de "sou eu a falar" para quem
          está longe de mais para ver a boca mexer. */}
      <circle className="claudia__halo" cx="60" cy="60" r="57" />
      <circle cx="60" cy="60" r="57" fill="url(#claudia-bg)" />

      <g clipPath="url(#claudia-frame)">
        <g className="claudia__body">
          {/* Ombros. Baixos e largos: subidos, a personagem parecia encolhida. */}
          <path
            className="claudia__shoulders"
            d="M2 124 C6 104 28 95 60 95 C92 95 114 104 118 124 Z"
          />
          {/* Gola, só para os ombros não serem uma mancha lisa. */}
          <path className="claudia__collar" d="M49 96 L60 108 L71 96 C67 94 53 94 49 96 Z" />

          <g className="claudia__head">
            {/* Cabelo de trás. Desenhado primeiro para a cara ficar por cima. */}
            <path
              className="claudia__hair"
              d="M31 58 C29 27 42 15 60 15 C78 15 91 27 89 58 L89 84 C89 89 81 89 81 84 L81 56 L39 56 L39 84 C39 89 31 89 31 84 Z"
            />

            <path className="claudia__neck" d="M52 72 H68 V92 Q60 99 52 92 Z" />
            <ellipse className="claudia__ear" cx="35" cy="58" rx="4" ry="6" />
            <ellipse className="claudia__ear" cx="85" cy="58" rx="4" ry="6" />
            <ellipse className="claudia__face" cx="60" cy="55" rx="25" ry="28" />

            {/* Franja. Deixa a testa à vista de propósito: a versão anterior
                tapava-a e a cara passava a ler-se como um capacete. */}
            <path
              className="claudia__hair"
              d="M35 45 C36 25 46 16 60 16 C74 16 84 25 85 45 C80 33 71 29 60 29 C48 29 40 34 35 45 Z"
            />

            {/* Sobrancelhas. Sobem quando pensa — metade da expressão está aqui. */}
            <g className="claudia__brows">
              <path d="M45 47 Q51 43 57 47" />
              <path d="M63 47 Q69 43 75 47" />
            </g>

            <g className="claudia__eyes">
              <ellipse cx="51" cy="57" rx="3.8" ry="4.4" />
              <ellipse cx="69" cy="57" rx="3.8" ry="4.4" />
              {/* Brilho. Dois pontos brancos e a cara deixa de ser um boneco. */}
              <circle className="claudia__glint" cx="52.4" cy="55.4" r="1.3" />
              <circle className="claudia__glint" cx="70.4" cy="55.4" r="1.3" />
            </g>

            <ellipse className="claudia__blush" cx="41" cy="66" rx="5" ry="3" />
            <ellipse className="claudia__blush" cx="79" cy="66" rx="5" ry="3" />

            {/* Duas bocas, uma de cada vez.
                O sorriso é um traço curvo porque a cem pixels uma forma cheia
                vira uma mancha. A boca aberta só aparece a falar, e é aí que a
                forma cheia funciona — está a mexer, lê-se pelo movimento. */}
            <path className="claudia__smile" d="M50 68 Q60 77 70 68" />
            <ellipse className="claudia__open" cx="60" cy="70" rx="6" ry="4.5" />
          </g>
        </g>
      </g>

      {/* Anel da marca, por cima de tudo, a limpar o recorte. */}
      <circle className="claudia__ring" cx="60" cy="60" r="56" />
    </svg>
  )
}
