# O cérebro da Bia

Um Cloudflare Worker entre o tablet e a API da Anthropic.

## Porque é que isto tem de existir

A chave da API não pode estar no tablet. O código da estação é público no
GitHub, e tudo o que vai para o navegador — incluindo variáveis `VITE_` — vai
em texto legível. Quem encontrasse a chave gastava o dinheiro da loja.

Este worker é a única peça que conhece a chave. O tablet só sabe o endereço.

## Pôr no ar

Precisa de duas contas. Nenhuma delas pode ser criada por mim: a criação de
contas e a introdução de chaves são passos que têm de ser dados por si.

**1. Chave da Anthropic** — em <https://console.anthropic.com>, secção *API
Keys*. Antes de sair da consola, defina um **limite de gastos mensal**. É o
único travão de custo que não depende de nada nosso funcionar.

**2. Conta Cloudflare** — gratuita, em <https://dash.cloudflare.com>. O plano
grátis dá 100 000 pedidos por dia, muito acima do que uma loja faz.

**3. Publicar**, a partir desta pasta:

```bash
cd server
npx wrangler login          # abre o navegador uma vez
npx wrangler secret put ANTHROPIC_API_KEY   # cola a chave; não fica no disco
npx wrangler deploy
```

No fim, o `wrangler` imprime o endereço. Algo como
`https://topbio-assistente.<a-sua-conta>.workers.dev`.

**4. Dizer o endereço à estação.** Em `.github/workflows/deploy.yml`, o passo
de build já lê `VITE_ASSISTANT_URL` dos *secrets* do repositório. Vá a
*Settings → Secrets and variables → Actions → New repository secret*, com o
nome `VITE_ASSISTANT_URL` e o endereço como valor.

Sem este passo nada se parte: a Bia fica com as falas escritas, que funcionam
sem servidor e sem custo. Fica mais simples, não fica avariada.

Para experimentar em casa antes de publicar, crie um ficheiro `.env.local` na
raiz do projeto — está no `.gitignore` — com:

```
VITE_ASSISTANT_URL=https://topbio-assistente.a-sua-conta.workers.dev
```

## Travar o abuso

O endereço vai dentro do JavaScript público da estação, portanto qualquer
pessoa o encontra. Há três travões, e o terceiro é o que conta:

1. **Origem** (`ALLOWED_ORIGINS` no `wrangler.toml`) — trava o abuso casual a
   partir de outro site. Fora do navegador, o cabeçalho falsifica-se.
2. **Balde por IP** dentro do worker — 20 pedidos por minuto. Vive na memória
   de cada *isolate*, portanto conta mal quando o tráfego se espalha. Chega
   para o acidente, não para o ataque.
3. **Regra no painel do Cloudflare** — esta é a verdadeira. Em *Security →
   WAF → Rate limiting rules*, crie uma regra sobre o caminho do worker com um
   teto de cerca de 60 pedidos por minuto por IP. Cinco minutos a fazer, e é o
   que impede uma conta de mil euros num fim de semana.

## Alterar o que ela diz

A personalidade e — mais importante — **as proibições legais** estão na
constante `SYSTEM` no topo do `worker.js`.

Essa secção não é estilo. Em Portugal e na UE é proibido dizer que um
suplemento trata, cura ou previne seja o que for (Regulamento (CE) 1924/2006),
e quem responde pela frase é a loja, não quem fornece o modelo. O `SYSTEM`
proíbe-o com exemplos escritos por extenso, porque um modelo entusiasmado
ignora regras abstratas e não ignora uma frase proibida escrita à letra.

Se mexer aí, teste a falar com ela sobre sono, dores e imunidade antes de
publicar. São os três temas onde ela tenta escorregar.
