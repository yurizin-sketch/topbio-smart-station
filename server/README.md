# O worker da Cláudia

Um ficheiro (`worker.js`) publicado no Cloudflare. Faz duas coisas:

- **pensa** — recebe o estado da estação e devolve o que a Cláudia diz e os botões
  que mostra (API da Anthropic);
- **fala** — recebe uma frase e devolve o áudio dela (API da ElevenLabs).

## Porque é que isto existe

O repositório é **público**. Qualquer pessoa vê o código, e tudo o que for para
o browser vai com ele — incluindo qualquer variável `VITE_`. Uma chave de API
posta lá dentro é uma chave dada a quem a quiser, e quem a apanhar gasta o
dinheiro da loja.

As chaves ficam aqui, no Cloudflare, cifradas. O tablet nunca as vê: pede ao
worker, o worker é que fala com a Anthropic e com a ElevenLabs.

**Sem isto publicado a estação funciona na mesma.** A Cláudia diz uma frase fixa por
ecrã, com a voz do próprio aparelho. Só não conversa e não soa a pessoa.

> **Todos os comandos deste ficheiro se correm de dentro da pasta `server/`.**
>
> ```powershell
> cd <a-pasta-do-projecto>\server
> ```
>
> É daqui que o wrangler encontra o `wrangler.toml` sozinho. Corridos da raiz
> do projecto dão `ENOENT`, e o erro mostra o caminho com a pasta repetida
> — `server\server\wrangler.toml` — que é o sinal de se estar no sítio errado.

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

Sem isto, cada vez que a Cláudia diz "Oi! Eu sou a Cláudia" paga-se essa frase outra
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

## A base de dados (D1)

Isto é a segunda metade do worker: o que guarda pedidos, stock e o mapa da
matriz. Sem ela a estação continua a vender — o tablet guarda tudo em casa —
mas o balcão fica preso ao mesmo aparelho e a matriz não vê nada.

Corre-se de dentro de `server/`, uma vez.

### 1. Criar a base

```sh
npx wrangler d1 create topbio
```

Imprime um `database_id`. Copie-o para o `wrangler.toml`, no lugar do
`POR-PREENCHER`. **Não é segredo** — é um nome de gaveta, como o do KV.

### 2. Desenhar as tabelas

```sh
npx wrangler d1 execute topbio --remote --file=schema.sql
```

Pode correr-se as vezes que forem precisas: está tudo em `IF NOT EXISTS`.

### 3. Os dois segredos

```sh
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MATRIZ_PASSWORD
```

O **SESSION_SECRET** é a chave com que o worker assina os bilhetes de sessão.
Ninguém a escreve nem a decora: gere-a ao acaso e comprida. Com ela, alguém
fabricava um bilhete de matriz sem saber palavra-passe nenhuma.

Para a gerar, no PowerShell:

```powershell
# ATENCAO: o que este bloco imprime NAO se mostra a ninguem — nem a mim,
# nem por email, nem no WhatsApp. Copia-se e cola-se so no `secret put` a
# seguir. Se alguma vez sair daqui, gere outro e volte a por: a chave
# antiga deixa de valer no momento em que a nova entra.
$b = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

O `Get-Random` do PowerShell **não** serve para isto: é previsível o
suficiente para se reconstruir, e uma chave de assinatura que se adivinha não
assina nada. O `RandomNumberGenerator` é o gerador criptográfico do sistema.

A **MATRIZ_PASSWORD** é a do dono, e escreve-se à mão — por isso que seja uma
frase, não quatro dígitos. O PIN do balcão tranca uma gaveta que já está dentro
da loja; esta tranca as contas de todas as lojas, a partir de qualquer sítio.

### 4. Registar cada posto

Um posto é um tablet. O PIN do balcão fica em resumo (sha-256), nunca em claro
e nunca no repositório.

Gerar o resumo do PIN, no PowerShell:

> **Os dois blocos deste ficheiro dão 64 caracteres, e são coisas opostas.**
> Antes de copiar seja o que for, olhe para o que saiu:
>
> | O que saiu | O que é | Pode mostrar-se? |
> | --- | --- | --- |
> | só `0-9a-f` | o resumo do PIN, aqui em baixo | **sim** — vai para o SQL |
> | tem maiúsculas, `+`, `/` | a chave de assinatura, no ponto 3 | **não, nunca** |
>
> O resumo não se desfaz: de `dadbc563…` ninguém tira o PIN de volta. Por isso
> este pode andar por email, por mensagem, por onde for preciso.

```powershell
$pin = "2468"
-join ([System.Security.Cryptography.SHA256]::Create().
  ComputeHash([Text.Encoding]::UTF8.GetBytes($pin)) | % { $_.ToString("x2") })
```

E inserir:

```sh
npx wrangler d1 execute topbio --remote --command   "INSERT INTO stations (id, name, counter_pin, active, created_at)
   VALUES ('loja-lisboa', 'Loja de Lisboa', '<o-resumo>', 1, 0)"
```

O `id` é o que anda em cada pedido e é por ele que a matriz separa as lojas.
Escolha-o legível — `loja-lisboa`, `academia-benfica` — porque vai aparecer em
listagens durante anos.

**Como é que o tablet fica a saber que posto é.** Não se edita ficheiro nenhum:
monta-se o tablet, abre-se o `/staff` uma vez e escreve-se o `id` do posto e o
PIN. Quem confirma é o worker, e é a resposta dele que fica guardada no
aparelho — a partir daí as vendas do quiosque saem com o nome certo, sem mais
ninguém tocar em nada.

Enquanto esse primeiro acesso não acontecer, a estação vende à mesma, mas os
pedidos ficam só naquele tablet: um posto que o servidor não conhece é recusado
com `posto-desconhecido`, e o quiosque nem tenta.

### 5. Pôr lá o stock que existe

Não há atalho honesto: alguém tem de contar a prateleira uma vez. Depois disso
é a estação que desconta.

Pela matriz, no ecrã, ou à mão:

```sh
npx wrangler d1 execute topbio --remote --command   "INSERT INTO stock (station_id, product_id, qty, updated_at)
   VALUES ('loja-lisboa', 'top-brain', 12, 0)"
```

### Experimentar sem tocar no que está no ar

```sh
npx wrangler dev --local
npx wrangler d1 execute topbio --local --file=schema.sql
```

O `--local` guarda tudo em `.wrangler/`, que está fora do repositório. Os
segredos, nesse modo, vêm de um ficheiro `.dev.vars` — também fora do
repositório, e que nunca deve levar as palavras-passe verdadeiras.

---

## Depois de publicado

### Confirmar que está de pé

O endereço da loja é
`https://topbio-assistente.biosupplex.workers.dev`.

Não é segredo nenhum: vai dentro do site, que é público. Guarda-se como
*secret* no GitHub por hábito, não por precisar.

```bash
curl -X POST https://topbio-assistente.biosupplex.workers.dev/speak \
  -H "content-type: application/json" \
  -H "origin: https://yurizin-sketch.github.io" \
  -d '{"text":"Oi, tudo bem?"}' --output teste.mp3
```

Um ficheiro que se ouve significa que está tudo certo. Se vier
`{"error":"voz_remota_desligada"}`, falta a chave da ElevenLabs ou o Voice ID.

A raiz responde ao mesmo tratamento sem o `/speak` e sem o `--output`. Se
devolver `"Estou aqui se você precisar de ajuda para escolher."` — a frase de
recurso — o worker está de pé mas não conseguiu pensar.

### Porque é que a Cláudia não pensa

O worker nunca devolve erro ao tablet: uma estacão calada ao pé de um cliente
é pior do que uma estacão com uma frase escrita. Mas diz sempre o motivo, num
cabeçalho chamado `x-claudia`. Para o ver:

```bash
curl -i -X POST https://topbio-assistente.biosupplex.workers.dev/ \
  -H "content-type: application/json" \
  -H "origin: https://yurizin-sketch.github.io" \
  -d '{}' | findstr x-claudia
```

| `x-claudia` | O que se passa | O que fazer |
| --- | --- | --- |
| `ok` | Nada. Foi ela mesma a responder. | — |
| `sem-chave` | O worker não tem `ANTHROPIC_API_KEY`. | `npx wrangler secret list` confirma o nome; volte ao passo 6. |
| `anthropic-401` | A chave existe mas foi recusada. | Chave errada, apagada ou de outra conta. Crie outra. |
| `anthropic-400` | O pedido foi recusado. | Leia o `x-claudia-detalhe`: diz qual campo. Chave pessoal sem workspace, ou `MODEL` que não existe. |
| `anthropic-429` | Demasiados pedidos. | Esperar. Se for constante, subir o limite na Anthropic. |
| `anthropic-529` | A Anthropic está sobrecarregada. | Passa sozinho. |
| `ilegível` | Ela respondeu, mas fora do formato. | Raríssimo. Se repetir, o `SYSTEM` foi mexido. |
| `erro-TimeoutError` | Demorou demasiado. | Rede. Se repetir, o modelo está lento — use um mais rápido. |
| `limite` | Vinte pedidos no mesmo minuto do mesmo IP. | É o travão a funcionar. |

Nenhum destes cabeçalhos leva nada de dentro das chaves — só o número que a
Anthropic devolveu e, no `x-claudia-detalhe`, o princípio da explicação dela.

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

### Mudar o que a Cláudia diz

A personalidade está no `SYSTEM`, dentro do `worker.js`. Se lhe mexer, tenha
presente que:

- A loja é em **Portugal**, mas a Cláudia fala **português do Brasil**. Foi escolha
  da loja. O resto da estação — botões, títulos, avisos — está em português
  europeu.
- Os preços são **em euros**. Está lá uma regra a dizê-lo, porque uma persona
  brasileira escorrega para reais com facilidade.
- A proibição de alegações de saúde **não é uma preferência de estilo**. É o
  Regulamento (CE) 1924/2006. Dizer que um suplemento "ajuda a dormir" é
  ilegal e dá coima à loja, não a mim nem a si. Não tire esse bloco.

Depois de mexer: `npx wrangler deploy` outra vez.
