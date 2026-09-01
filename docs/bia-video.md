# A Bia em vídeo

Guia para gravar a personagem no HeyGen e pôr os ficheiros na estação.

A Bia diz duas espécies de coisas:

- **as falas fixas** — quinze frases, sempre as mesmas, uma por ecrã. Gravam-se
  uma vez e ficam. Não custam nada a correr e funcionam sem internet.
- **as respostas inventadas** — quando o cliente pergunta alguma coisa. Essas
  não se podem gravar, porque nunca se sabe quais vão ser.

Por isso a estação toca clips gravados quase sempre, e só usa a boca genérica
quando ela responde de improviso.

---

## 1. Antes de gravar: a voz

**Não use a voz do HeyGen.** A Bia já tem voz — a da ElevenLabs, que é a que
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
| Resolução | 1080 × 1920 (vertical) ou 1920 × 1080, conforme o tablet |
| Formato | MP4, H.264 |
| Fundo | verde ou transparente, se o plano deixar exportar com alfa |
| Peso | até 3 MB por clip |

O fundo é o que mais importa. A Bia fica **por cima** do ecrã da estação, ao
lado dos produtos; com um fundo de estúdio ficava uma caixa de vídeo colada a
uma app, e vê-se logo que são duas coisas diferentes.

## 3. As falas

O nome do ficheiro tem de ser exatamente este — é por ele que a estação o
encontra. Tudo em `public/bia/`.

| Ficheiro | O que ela diz |
| --- | --- |
| `parada.mp4` | *(nada — só ela quieta, a respirar e a olhar em volta. 10 a 15 s, a repetir sem se notar o corte)* |
| `a-falar.mp4` | *(nada — ela a falar, sem palavras. Usa-se por baixo das respostas inventadas. 8 a 10 s, também a repetir)* |
| `atrair.mp4` | Oi! Eu sou a Bia. Posso te ajudar a escolher? |
| `atrair-2.mp4` | Bem-vindo à TopBio. Quer que eu te ajude a escolher? |
| `atrair-3.mp4` | Oi! Se quiser, eu te ajudo a achar o que você procura. |
| `objetivos.mp4` | Me diz o que você procura que eu mostro as opções da casa. |
| `sugestoes.mp4` | Aqui está o que a gente tem pra isso. Quer saber mais de algum? |
| `catalogo.mp4` | Esse é o catálogo todo. Se preferir, me diz o que você procura. |
| `produto.mp4` | Se quiser levar, é só tocar em comprar. Você retira no balcão. |
| `pagamento.mp4` | Você pode pagar por MB WAY ou no balcão. Como prefere? |
| `mbway.mp4` | Leia o código com o app MB WAY. Eu espero. |
| `talao.mp4` | Leve esse código no balcão. O colega resolve o resto. |
| `pago.mp4` | Está pago. Mostre o comprovante no balcão e é seu. |
| `so-olhando.mp4` | Claro. Fique à vontade, estou aqui se precisar. |

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
por dia não compensa, e se a internet da loja falhar a Bia desaparece do ecrã.
Os clips gravados não têm esse problema.

### A bata branca

A personagem chama-se `dr.claudia` no HeyGen. Se ficar só o nome interno, não
há problema nenhum — para o cliente ela é a Bia, e é esse o nome que aparece.

O que **não** pode acontecer é a estação apresentá-la como médica ou
farmacêutica: nem no nome, nem no crachá, nem na bata. Uma pessoa de bata
branca a recomendar suplementos está a dizer, sem abrir a boca, que aquilo tem
respaldo clínico — e isso é exatamente o que o Regulamento (CE) 1924/2006
proíbe, com coima para a loja.

É uma pena, porque a personagem em si serve muito bem. Só tem de estar vestida
como quem trabalha na loja. Se a `dr.claudia` tiver bata, vale a pena trocar de
roupa no HeyGen antes de gravar as quinze — é mais barato do que gravar duas
vezes.

Repare que a própria Bia já sabe isto. Perguntando-lhe se um produto cura
ansiedade, ela responde:

> "Isso é uma pergunta pra médico ou farmacêutico, eu não posso responder sobre
> isso. O colega no balcão pode te ajudar melhor."

Seria estranho ela dizer isso vestida de médica.

## 5. Quando os ficheiros existirem

Ponha-os em `public/bia/` e diga-me. A estação passa a tocá-los sozinha: o
`parada.mp4` a repetir entre clientes, o clip certo em cada ecrã, e o desenho
que lá está agora fica por baixo como rede — se um vídeo não carregar, ninguém
fica com um buraco preto ao pé de um cliente.
