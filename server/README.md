# O worker da Bia

Um ficheiro (`worker.js`) publicado no Cloudflare. Faz duas coisas:

- **pensa** — recebe o estado da estação e devolve o que a Bia diz e os botões
  que mostra (API da Anthropic);
- **fala** — recebe uma frase e devolve o áudio dela (API da ElevenLabs).

## Porque é que isto existe

O repositório é **público**. Qualquer pessoa vê o código, e tudo o que for para
o browser vai com ele — incluindo qualquer variável `VITE_`. Uma chave de API
posta lá dentro é uma chave dada a quem a quiser, e quem a apanhar gasta o
dinheiro da loja.

As chaves ficam aqui, no Cloudflare, cifradas. O tablet nunca as vê: pede ao
worker, o worker é que fala com a Anthropic e com a ElevenLabs.

**Sem isto publicado a estação funciona na mesma.** A Bia diz uma frase fixa por
ecrã, com a voz do próprio aparelho. Só não conversa e não soa a pessoa.

---

## Publicar, passo a passo

Tudo isto se faz uma vez. Os comandos correm-se dentro da pasta `server/`.

No Claude Code pode escrever `! ` antes do comando para o correr aqui mesmo.
Os que abrem o browser para autenticar (o `login`) têm de ser assim.

### 1. Chave da Anthropic

Em <https://console.anthropic.com>:

1. **Settings → Limits** — defina um **limite de gasto mensal**. Faça isto
   primeiro. É o que garante que um erro ou um abuso custa vinte euros e não
   dois mil.
2. **API keys → Create key**. Copie a chave (`sk-ant-...`). Só aparece uma vez.

Carregue 5 € para começar. Dá para muitas conversas — cada uma custa milésimos.

### 2. Chave e voz da ElevenLabs

Em <https://elevenlabs.io>:

1. **Voice Library** — procure uma voz feminina **brasileira**, ouça algumas e
   adicione a escolhida à conta (*Add to my voices*).
2. Em **My Voices**, nos três pontos da voz, **Copy Voice ID**. É uma linha de
   letras e números.
3. **Profile → API Keys → Create**. Copie a chave.

O sotaque vem da voz, não de nenhuma definição. Uma voz portuguesa a ler texto
brasileiro soa a portuguesa; escolha mesmo uma do Brasil.

### 3. Pôr o Voice ID no `wrangler.toml`

Abra `server/wrangler.toml` e cole o identificador:

```toml
ELEVENLABS_VOICE_ID = "cole-aqui-o-voice-id"
```

Este pode ir para o repositório — é o nome da voz, não é segredo. **As chaves
não**, e por isso não têm lugar neste ficheiro.

### 4. Conta Cloudflare e login

Crie a conta em <https://dash.cloudflare.com> (o plano gratuito chega: 100 000
pedidos por dia). Depois:

```bash
npx wrangler login
```

Abre o browser para autorizar.

### 5. Publicar

```bash
npx wrangler deploy
```

No fim aparece o endereço, qualquer coisa como
`https://topbio-assistente.<a-sua-conta>.workers.dev`. Guarde-o.

Publica-se **antes** de guardar as chaves porque as chaves ficam guardadas
*dentro* deste worker — enquanto ele não existir, não há onde as pôr.

### 6. Guardar as chaves

**Num terminal seu, não através do Claude Code.**

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
```

Cada comando pergunta a chave, cola-se ali e carrega-se em Enter. O terminal
tapa o que se escreve com asteriscos, e a chave vai direta para o Cloudflare
cifrada — não fica no ecrã, não fica no histórico, não fica no repositório.

Não há maneira de as ler de volta depois: nem por si, nem por mim, nem por
ninguém. Se perder uma, cria-se outra e substitui-se.

Nunca escreva estas chaves numa conversa comigo, num ficheiro do projeto ou
numa mensagem. Se acontecer por acidente, vá ao painel da Anthropic ou da
ElevenLabs e revogue-a — leva dez segundos e é o fim do problema.

### 7. Cache das falas (recomendado)

Sem isto, cada vez que a Bia diz "Oi! Eu sou a Bia" paga-se essa frase outra
vez. Com isto, paga-se uma vez por mês.

```bash
npx wrangler kv namespace create TTS_CACHE
```

O comando imprime um `id`. Cole-o no fim do `wrangler.toml` e tire o comentário
das três linhas:

```toml
[[kv_namespaces]]
binding = "TTS_CACHE"
id = "o-id-que-o-comando-imprimiu"
```

Como o `wrangler.toml` mudou, publique outra vez:

```bash
npx wrangler deploy
```

### 8. Dizer o endereço ao site

No GitHub, em **Settings → Secrets and variables → Actions → New repository
secret**:

- **Name:** `VITE_ASSISTANT_URL`
- **Secret:** o endereço do passo anterior

O `.github/workflows/deploy.yml` já lê este segredo. Faça um commit qualquer (ou
carregue em *Re-run jobs*) e o site passa a usar o worker.

Enquanto este segredo não existir, o código da voz remota nem sequer entra no
site — o build deita-o fora. Não há nada a desligar.

---

## Depois de publicado

### Confirmar que está de pé

O endereço da loja é
`https://topbio-assistente.topbio-europa.workers.dev`.

Não é segredo nenhum: vai dentro do site, que é público. Guarda-se como
*secret* no GitHub por hábito, não por precisar.

```bash
curl -X POST https://topbio-assistente.topbio-europa.workers.dev/speak \
  -H "content-type: application/json" \
  -H "origin: https://yurizin-sketch.github.io" \
  -d '{"text":"Oi, tudo bem?"}' --output teste.mp3
```

Um ficheiro que se ouve significa que está tudo certo. Se vier
`{"error":"voz_remota_desligada"}`, falta a chave da ElevenLabs ou o Voice ID.

A raiz responde ao mesmo tratamento sem o `/speak` e sem o `--output`. Se
devolver `"Estou aqui se você precisar de ajuda para escolher."` — a frase de
recurso — o worker está de pé mas não conseguiu pensar.

### Porque é que a Bia não pensa

O worker nunca devolve erro ao tablet: uma estacão calada ao pé de um cliente
é pior do que uma estacão com uma frase escrita. Mas diz sempre o motivo, num
cabeçalho chamado `x-bia`. Para o ver:

```bash
curl -i -X POST https://topbio-assistente.topbio-europa.workers.dev/ \
  -H "content-type: application/json" \
  -H "origin: https://yurizin-sketch.github.io" \
  -d '{}' | findstr x-bia
```

| `x-bia` | O que se passa | O que fazer |
| --- | --- | --- |
| `ok` | Nada. Foi ela mesma a responder. | — |
| `sem-chave` | O worker não tem `ANTHROPIC_API_KEY`. | `npx wrangler secret list` confirma o nome; volte ao passo 6. |
| `anthropic-401` | A chave existe mas foi recusada. | Chave errada, apagada ou de outra conta. Crie outra. |
| `anthropic-400` | O pedido foi recusado. | Leia o `x-bia-detalhe`: diz qual campo. Chave pessoal sem workspace, ou `MODEL` que não existe. |
| `anthropic-429` | Demasiados pedidos. | Esperar. Se for constante, subir o limite na Anthropic. |
| `anthropic-529` | A Anthropic está sobrecarregada. | Passa sozinho. |
| `ilegível` | Ela respondeu, mas fora do formato. | Raríssimo. Se repetir, o `SYSTEM` foi mexido. |
| `erro-TimeoutError` | Demorou demasiado. | Rede. Se repetir, o modelo está lento — use um mais rápido. |
| `limite` | Vinte pedidos no mesmo minuto do mesmo IP. | É o travão a funcionar. |

Nenhum destes cabeçalhos leva nada de dentro das chaves — só o número que a
Anthropic devolveu e, no `x-bia-detalhe`, o princípio da explicação dela.

#### Chave pessoal e carteira

Se o detalhe falar em `anthropic-workspace-id`, a chave é **pessoal** — é o que
a consola cria quando se carrega em *Create key* sem mais nada. Uma chave dessas
não sabe a que carteira háde cobrar e recusa o pedido.

O mais limpo é criar outra, agora dentro de um workspace: **Console → Settings
→ Workspaces →** escolher um **→ API keys → Create key**. Depois é
`npx wrangler secret put ANTHROPIC_API_KEY` outra vez, com a nova, e apagar a
antiga na consola.

Em alternativa, mantém-se a chave e diz-se-lhe a carteira: tire o comentário ao
`ANTHROPIC_WORKSPACE_ID` no `wrangler.toml`. O id está no endereço da consola
com o workspace aberto e começa por `wrkspc_`. Não é segredo — é um nome, não
abre nada.

O mesmo vale para a voz: `x-tts-cache: hit` quer dizer que a frase já estava
guardada e não custou nada; `miss` quer dizer que foi gerada agora.

E para saber que chaves estão guardadas, sem as ver:

```bash
npx wrangler secret list
```

Imprime só os nomes. Se `ANTHROPIC_API_KEY` não aparecer escrito exatamente
assim, o worker não a encontra.

### Travão contra abuso

O endereço é público — tem de ser, é o tablet que lhe chama. O worker já limita
20 pedidos por minuto por IP, mas isso é memória de uma máquina só. Para um
travão a sério, no painel do Cloudflare:

**Security → WAF → Rate limiting rules → Create**

- Se: `URI Path` contém `/`
- Então: bloquear acima de **60 pedidos em 1 minuto** por IP

Sessenta chega e sobra para uma loja. Um robô a martelar o endereço passa disso
em segundos e apanha com a porta na cara.

### Custos, na prática

| O quê | Quanto |
| --- | --- |
| Cloudflare Workers | grátis até 100 000 pedidos/dia |
| Cloudflare KV | grátis até 100 000 leituras/dia |
| Anthropic | milésimos de euro por conversa |
| ElevenLabs | por caráter — **é aqui que se gasta** |

A ElevenLabs é a única que merece vigilância. Com a cache do passo 6, as falas
fixas pagam-se uma vez e ficam guardadas trinta dias; só as respostas novas,
inventadas na altura para cada cliente, é que custam. Sem a cache, custa tudo,
sempre.

Ponha um limite de gasto nas duas contas. É a única proteção que não depende de
o código estar certo.

### Mudar o que a Bia diz

A personalidade está no `SYSTEM`, dentro do `worker.js`. Se lhe mexer, tenha
presente que:

- A loja é em **Portugal**, mas a Bia fala **português do Brasil**. Foi escolha
  da loja. O resto da estação — botões, títulos, avisos — está em português
  europeu.
- Os preços são **em euros**. Está lá uma regra a dizê-lo, porque uma persona
  brasileira escorrega para reais com facilidade.
- A proibição de alegações de saúde **não é uma preferência de estilo**. É o
  Regulamento (CE) 1924/2006. Dizer que um suplemento "ajuda a dormir" é
  ilegal e dá coima à loja, não a mim nem a si. Não tire esse bloco.

Depois de mexer: `npx wrangler deploy` outra vez.
