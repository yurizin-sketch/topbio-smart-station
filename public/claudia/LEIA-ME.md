# O que a estação procura nesta pasta

A Cláudia tem três aspectos possíveis e fica sempre pelo melhor que aqui
encontrar, sem ser preciso mexer em código nenhum:

| o que está cá | o que se vê |
| --- | --- |
| `a-falar.mp4` **e** `parada.mp4` | ela a sério, de corpo inteiro, a mexer-se |
| só `retrato.png` | uma fotografia parada |
| nada | o desenho, que nunca falha |

Tirar os ficheiros daqui faz o caminho ao contrário. Serve para experimentar
sem medo.

## Os dois vídeos

`parada.mp4` toca quando ela está calada e `a-falar.mp4` quando ela fala. Estão
os dois montados ao mesmo tempo e trocam-se por transparência, para não haver
piscar nenhum.

Ambos vêm do mesmo clip do HeyGen, montados em **ida e volta** — o clip corre
até ao fim e volta para trás. É assim que se põe um vídeo curto em ciclo sem
salto na emenda; senão via-se um esticao de cada vez que recomeçasse.

Não têm som, de propósito. Quem fala é a voz da ElevenLabs, que diz também as
frases que ela inventa na hora. Como o vídeo é sempre o mesmo, **a boca não
acompanha as palavras** — a três metros do balcão ninguém repara, ao pé do ecrã
repara-se.

Para trocar de vídeo basta pôr outros dois ficheiros com estes nomes. O fundo
tem de ser verde `#004a3c` liso, na vertical, senão vê-se o rectângulo.

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
