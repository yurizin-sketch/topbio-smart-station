# A Cláudia em vídeo

Guia para gravar a personagem no HeyGen e pôr os ficheiros na estação.

A Cláudia diz duas espécies de coisas:

- **as falas fixas** — quinze frases, sempre as mesmas, uma por ecrã. Gravam-se
  uma vez e ficam. Não custam nada a correr e funcionam sem internet.
- **as respostas inventadas** — quando o cliente pergunta alguma coisa. Essas
  não se podem gravar, porque nunca se sabe quais vão ser.

Por isso a estação toca clips gravados quase sempre, e só usa a boca genérica
quando ela responde de improviso.

---

## 0. O que já está feito

Um clip serve para as duas coisas. Do primeiro que gravou saíram os dois
ficheiros que estão hoje na estação:

- **`public/claudia/parada.webp`** — o último fotograma, de braços em baixo.
  É ela quieta, e é o que se vê quase sempre.
- **`public/claudia/a-falar.webp`** — o mesmo clip a mexer-se, que só entra no
  ecrã enquanto ela fala.

Os dois saem **recortados**, sem fundo nenhum: ela fica de pé por cima do
ecrã, e não numa caixa de vídeo colada a uma app. As receitas do `ffmpeg` que
os fazem estão em `public/claudia/LEIA-ME.md` e servem para qualquer clip novo.

Falta a boca bater certo com as palavras, e é para isso que servem os clips
com fala que se seguem.

---

## 1. Antes de gravar: a voz

**Não use a voz do HeyGen.** A Cláudia já tem voz — a da ElevenLabs, que é a que
fala nas respostas inventadas. Se os clips saírem com outra, ela muda de voz a
meio da conversa, e isso nota-se de um modo difícil de explicar mas impossível
de ignorar.

A ordem certa é:

1. gerar o áudio de cada frase na ElevenLabs, com a voz `7eNTDDQVOfe6PkLOmu23`;
2. no HeyGen, escolher **Upload audio** em vez de escrever o texto;
3. dar-lhe o ficheiro.

Assim a boca bate certo com a voz que ela tem no resto do tempo.

## 2. Formato

| | |
| --- | --- |
| Resolução | 1080 × 1920, vertical |
| Enquadramento | **corpo inteiro**, dos pés à cabeça, com folga por cima e por baixo |
| Formato | MP4, H.264 |
| Fundo | uma cor lisa, `#004a3c` — já pintado na fotografia de origem |
| Depois | recortado aqui pelo `ffmpeg`, com as receitas do `LEIA-ME.md` |
| Peso | até 3 MB por clip |

### Tudo se decide na fotografia

O Avatar IV não filma ninguém. **Anima uma fotografia parada.** É preciso perceber
isto antes de tudo o resto, porque muda quem faz o quê: o enquadramento, a roupa,
a pose, as mãos e o fundo já têm de estar certos **na foto que se carrega**. Não há
botão no HeyGen que corrija nada disso depois.

Daí que a foto tem de ser:

- **de corpo inteiro**, dos pés à cabeça, de frente;
- **vertical**, proporção 9:16 — o Avatar IV exporta em 16:9 ou 9:16, e a foto é
  que manda;
- com as **mãos à vista** e afastadas do corpo, senão o modelo não tem por onde
  as mexer;
- com **folga por cima e por baixo**. Se ela ficar colada ao topo, um tablet de
  proporção diferente corta-lhe a cabeça, e não há css que devolva píxeis que
  nunca foram gravados;
- com o **fundo já pintado** de `#004a3c`, o verde da casa.

Corpo inteiro obriga a Avatar IV ou V. O modo de tempo real da HeyGen — o
LiveAvatar — não serve: a própria HeyGen escreve que a filmagem tem de ser do
peito para cima e que corpo inteiro não é suportado.

### O fundo

O fundo é o que mais importa. A Cláudia fica **por cima** do ecrã da estação, ao
lado dos produtos; com um fundo de estúdio ficava uma caixa de vídeo colada a
uma app, e vê-se logo que são duas coisas diferentes.

**O Avatar IV não tira fundos.** A opção de remover fundo do estúdio não se aplica
a vídeos de Avatar IV, e não há exportação com canal alfa por este caminho. O
fundo do vídeo é, e será sempre, o fundo da fotografia.

Por isso se pinta o fundo **antes**, de `#004a3c` liso. O que importa não é a cor
exacta — é ser **lisa e só dela**: nada no vestuário nem no cabelo pode ter aquele
tom, senão abrem-se buracos na figura ao recortar.

O recorte faz-se depois, **aqui**, uma vez, ao gerar os ficheiros. Não é o tablet
que o faz: recortar imagem doze vezes por segundo num aparelho de loja é gastar
bateria para chegar ao mesmo sítio. O clip que veio do HeyGen tinha `#054739`, três
unidades ao lado do `#004a3c` pedido — o `ffmpeg` tem tolerância que chega para
isso, mas confirme sempre a cor do clip novo antes de a pôr na receita.

Verde de croma — aquele verde berrante de estúdio — **não**. É tão longe do tom
da pele que a tolerância do recorte tem de ser larga, e larga demais deixa orla
verde no cabelo dela. Um verde escuro perto do da casa é mais fácil de tirar
limpo, e o que sobra confunde-se com o fundo do ecrã.

## 3. As falas

Estas ainda não estão ligadas a nada: a estação usa hoje um clip só, sem
palavras, para tudo. Grave-as quando quiser, converta-as com as receitas do
`LEIA-ME.md` e diga-me — a ligação é do meu lado.

Os `.mp4` abaixo são o que sai do HeyGen; o que fica em `public/claudia/` é o
`.webp` correspondente.

| Ficheiro | O que ela diz |
| --- | --- |
| `atrair.mp4` | Oi! Eu sou a Cláudia. Posso te ajudar a escolher? |
| `atrair-2.mp4` | Bem-vindo à TopBio. Quer que eu te ajude a escolher? |
| `atrair-3.mp4` | Oi! Se quiser, eu te ajudo a achar o que você procura. |
| `objetivos.mp4` | Me diz o que você procura que eu mostro as opções da casa. |
| `sugestoes.mp4` | Aqui está o que a gente tem pra isso. Quer saber mais de algum? |
| `catalogo.mp4` | Esse é o catálogo todo. Se preferir, me diz o que você procura. |
| `produto.mp4` | Se quiser levar, é só tocar em comprar. Você retira no balcão. |

São sete, e eram doze. **A partir do pagamento ela sai do ecrã** — no talão do
balcão e no comprovante não aparece nem fala. Dali para a frente o ecrã é do
cliente: o valor, o código, o caminho até ao balcão. Uma personagem a comentar
por cima disso rouba a atenção ao que a pessoa tem mesmo de ler, e no
comprovante não há nada a acrescentar que não esteja já escrito. Por isso não
se gravam clips para esses ecrãs.

O quinto que caiu é o «só estou a olhar». A resposta a esse pedido passou a ser
**silêncio**: o balão fecha-se e ela não volta a abrir a boca sozinha até lhe
tocarem ou até chegar gente nova. Uma frase simpática a dizer que vai calar-se
é mais uma frase, e era exactamente isso que a pessoa acabou de recusar.

As três de `atrair` são a mesma frase dita de três maneiras. É de propósito:
quem trabalha na loja ouve isto o dia todo, e três versões cansam menos do que
uma. Se só der para gravar uma, grave a primeira.

**Não mude o texto.** Estas frases estão escritas em `src/services/assistant.ts`
e é de lá que a estação as lê para as legendas. Se o vídeo disser uma coisa e a
legenda outra, quem não ouve bem lê o que não foi dito.

## 4. Duas coisas a decidir antes de gastar créditos

### O plano deixa?

O *Creator plan* dá o estúdio e tira a marca de água, que é o que isto precisa.
Confirme no contrato duas coisas, porque não sou eu que as posso garantir:

- **uso comercial** — isto vai estar numa loja a vender, não num vídeo de
  família;
- **descarregar o ficheiro** sem marca de água.

O avatar ao vivo, que responde a qualquer pergunta em tempo real, é outro
produto e outra conta — paga-se ao minuto. Para uma estação aberta oito horas
por dia não compensa, e se a internet da loja falhar a Cláudia desaparece do ecrã.
Os clips gravados não têm esse problema.

### A bata branca

A personagem chama-se `dr.claudia` no HeyGen. Se ficar só o nome interno, não
há problema nenhum — para o cliente ela é a Cláudia, e é esse o nome que aparece.

O que **não** pode acontecer é a estação apresentá-la como médica ou
farmacêutica: nem no nome, nem no crachá, nem na bata. Uma pessoa de bata
branca a recomendar suplementos está a dizer, sem abrir a boca, que aquilo tem
respaldo clínico — e isso é exatamente o que o Regulamento (CE) 1924/2006
proíbe, com coima para a loja.

É uma pena, porque a personagem em si serve muito bem. Só tem de estar vestida
como quem trabalha na loja. Se a `dr.claudia` tiver bata, vale a pena trocar de
roupa no HeyGen antes de gravar as quinze — é mais barato do que gravar duas
vezes.

Repare que a própria Cláudia já sabe isto. Perguntando-lhe se um produto cura
ansiedade, ela responde:

> "Isso é uma pergunta pra médico ou farmacêutico, eu não posso responder sobre
> isso. O colega no balcão pode te ajudar melhor."

Seria estranho ela dizer isso vestida de médica.

## 5. Quando os ficheiros existirem

Converta-os e ponha-os em `public/claudia/`, e diga-me: falta ligar cada um ao
ecrã onde é dito, e isso é código.

A rede já lá está e não se mexe. Se um ficheiro faltar ou vier estragado, a
estação desce um degrau sozinha — do clip para a figura parada, e da figura
parada para o desenho. Nunca fica um buraco no ecrã ao pé de um cliente.
