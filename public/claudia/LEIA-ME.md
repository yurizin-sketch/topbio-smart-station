# O retrato da Cláudia

Ponha aqui um ficheiro com o nome exacto **`retrato.png`**.

A partir daí é ele que aparece no ecrã, por cima do desenho. Não é preciso
mexer em código nenhum nem avisar ninguém: a estação procura o ficheiro
quando arranca e, se o encontrar, usa-o.

Tirando o ficheiro daqui, volta o desenho. Serve para experimentar sem
medo.

## Como deve ser o ficheiro

| | |
|---|---|
| Nome | `retrato.png` (tudo em minúsculas) |
| Forma | quadrado — 512×512 chega bem |
| Enquadramento | cabeça e ombros, cara ao centro |
| Peso | até 300 kB |

O ecrã mostra-a dentro de um círculo. O que ficar nos cantos do quadrado
não se vê, por isso não ponha nada importante lá — nem texto, nem logótipo,
nem o queixo encostado à borda.

Se o ficheiro for maior do que 300 kB, converta-o para `.webp` e mude o
nome do que a estação procura em `src/components/Claudia.tsx` (é a linha do
`PORTRAIT`, uma linha só). Um tablet a puxar um retrato de 4 MB de cada vez
que alguém se aproxima é tempo que o cliente passa a olhar para um ecrã
vazio.

## O que isto não faz

Uma fotografia não mexe a boca. Com o retrato posto, a Cláudia respira,
oscila e acende o halo enquanto fala, mas os lábios ficam quietos.

Boca a mexer a sério é com os vídeos do HeyGen — a lista do que é preciso
gravar está em `docs/claudia-video.md`.
