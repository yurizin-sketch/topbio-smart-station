# O que a estação procura nesta pasta

A Cláudia tem três aspectos possíveis e fica sempre pelo melhor que aqui
encontrar, sem ser preciso mexer em código nenhum:

| o que está cá | o que se vê |
| --- | --- |
| `parada.webp` **e** `a-falar.webp` | ela recortada, quieta, e a mexer-se quando fala |
| só `parada.webp` | ela recortada, sempre quieta |
| nada | o desenho, que nunca falha |

Tirar os ficheiros daqui faz o caminho ao contrário. Serve para experimentar
sem medo.

## Os dois ficheiros

| | `parada.webp` | `a-falar.webp` |
| --- | --- | --- |
| o que é | um fotograma só | 77 fotogramas, 12 por segundo |
| quando aparece | sempre | só enquanto ela fala |
| medidas | 540 × 960 | 340 × 604 |
| peso | 41 kB | 1,4 MB |

Os dois têm **fundo transparente** e a mesma proporção, e estão um por cima
do outro no mesmo sítio.

## Três coisas que foram feitas de propósito

**Ela está parada quase sempre.** O `a-falar.webp` só entra no ecrã quando ela
abre a boca e sai quando acaba. Enquanto está calada não há nada a
descodificar — uma figura a gesticular sozinha o dia todo cansa quem está ao
balcão e deixa de se notar quando é a sério.

**Os dois partem do mesmo fotograma.** A parada é o último fotograma do clip —
de braços em baixo, boca fechada — e o clip foi **invertido** para começar e
acabar nessa mesma pose. Por isso a troca não dá salto, nem à entrada nem à
saída, e o ciclo fecha sem emenda.

**O verde foi tirado aqui, não no tablet.** O clip do HeyGen vem com fundo
verde liso; o recorte é feito uma vez, ao gerar o ficheiro. Recortar imagem
doze vezes por segundo num aparelho de loja é gastar bateria para chegar ao
mesmo sítio.

## Não têm som

Quem fala é a voz da ElevenLabs, que diz também as frases que ela inventa na
hora. Como o clip é sempre o mesmo, **a boca não acompanha as palavras** — a
três metros do balcão ninguém repara, ao pé do ecrã repara-se.

## Como refazer os ficheiros

A partir de um clip do HeyGen com fundo verde liso, com o `ffmpeg`. Confirme
primeiro a cor do fundo no clip novo — o `0x054739` abaixo é a do clip actual,
e não é exactamente o `#004a3c` pedido ao HeyGen.

```sh
K="colorkey=0x054739:0.12:0.04,despill=type=green:mix=0.5"

# a parada: o ultimo fotograma
ffmpeg -y -sseof -0.08 -i CLIP.mp4 -vframes 1 \
  -vf "${K},scale=540:-2:flags=lanczos" \
  -c:v libwebp -lossless 0 -q:v 82 parada.webp

# o clip: invertido, e depois ida e volta para fechar o ciclo
ffmpeg -y -i CLIP.mp4 -an \
  -vf "${K},scale=340:-2:flags=lanczos,fps=12,reverse,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0" \
  -c:v libwebp_anim -lossless 0 -q:v 55 -compression_level 6 -loop 0 -preset picture a-falar.webp
```

O `reverse` é o que põe a pose de repouso no princípio. Sem ele o clip começa
a meio de um gesto e vê-se o salto.

## Porquê imagem e não vídeo

Foi tentado com `.webm` — dava 700 kB em vez de 1,4 MB, e com o dobro dos
fotogramas por segundo. Ficou de fora à mesma.

Um `<video>` depende de o browser deixar arrancar sozinho e de não estar a
poupar bateria. Num tablet aberto o dia todo isso falha **calado**: não dá
erro, não fica buraco no ecrã, ela simplesmente nunca se mexe e ninguém
percebe porquê. Uma imagem animada anda sempre. O megabyte a mais carrega-se
uma vez, quando a estação abre de manhã.

## Quem faz a escolha

É o `src/components/Claudia.tsx`. Repare que decide pelo **tipo do conteúdo**
e não por o servidor dizer que correu bem: um servidor de página única
responde `200` com o `index.html` a qualquer caminho que não conheça, e o
Chrome, ao receber isso, não dá erro nenhum — pinta lixo. Por isso é que a
verificação é `content-type: image/…` e não `res.ok`.
