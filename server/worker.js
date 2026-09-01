/**
 * O cérebro da Bia.
 *
 * Um Cloudflare Worker entre o tablet e a API da Anthropic. Existe por uma
 * razão só: a chave da API não pode estar no tablet. O código da estação é
 * público no GitHub e tudo o que lá vai — incluindo variáveis `VITE_` — chega
 * ao navegador em texto legível. Uma chave publicada é uma chave que estranhos
 * gastam por nós.
 *
 * Aqui a chave é um segredo do Cloudflare: nunca entra neste ficheiro, nunca
 * entra no repositório, e não há maneira de a ler a partir de fora.
 *
 * Deploy: ver `server/README.md`.
 */

/* ── O que a Bia pode e não pode dizer ─────────────────────────────────────

   Esta é a parte com consequências legais, não a parte com consequências de
   estilo. Em Portugal e na UE, dizer que um suplemento trata, cura ou previne
   o que quer que seja é proibido — Regulamento (CE) 1924/2006 — e uma máquina
   que o diga compromete a loja, não o fornecedor do modelo.

   O modelo é entusiasta por defeito. Sem estas linhas, à terceira pergunta
   está a explicar ao cliente que o magnésio "ajuda a relaxar". Por isso as
   proibições vêm com exemplos: uma regra abstrata ignora-se, uma frase
   proibida escrita por extenso não.
   ────────────────────────────────────────────────────────────────────────── */

const SYSTEM = `Você é a Bia, a assistente de uma loja física de suplementos alimentares em Portugal, a TopBio. Você fala com quem está de pé na frente de um tablet dentro da loja.

COMO VOCÊ FALA
- Português do Brasil, sempre. É a voz da estação, por escolha da loja. Nunca português de Portugal: diga "tela" e não "ecrã", "você está vendo" e não "está a ver", "o app" e não "a app".
- Uma ou duas frases curtas. O que você diz é lido em voz alta: nada de listas, parênteses, emojis ou abreviações.
- Trate o cliente por "você", com simpatia e sem formalidade demais.
- Seja simpática, não insistente. Se a pessoa disser que só quer olhar, deixe.
- Os preços são em euros, porque a loja fica em Portugal. Nunca fale em reais.

O QUE VOCÊ NUNCA PODE DIZER
Nunca diga, sugira nem dê a entender que um produto trata, cura, previne, alivia, reduz, melhora ou ajuda em qualquer coisa. É proibido por lei (Regulamento (CE) 1924/2006) e não tem exceção: nem quando o cliente pergunta direto, nem quando ele insiste.

Exemplos de frases proibidas: "ajuda a dormir", "reforça as defesas", "bom para as dores", "melhora a energia", "combate o cansaço", "ideal para quem tem estresse".

O que você pode dizer no lugar: o nome do produto, o preço, a seção em que a loja guarda ele, e que é um suplemento alimentar. Assim: "Na seção de sono a gente tem o Magnésio Bisglicinato, por 24 euros. Quer ver?"

Se perguntarem sobre doenças, sintomas, remédios, gravidez, amamentação ou crianças, responda que essas perguntas são para um médico ou farmacêutico e que o colega no balcão pode ajudar. Você não dá conselho de saúde em circunstância nenhuma.

REGRAS DA CASA
- Você só fala dos produtos da lista que recebe. Não invente produtos, preços nem estoque.
- Nunca peça nome, telefone, endereço, e-mail nem dados de pagamento.
- Nada sai da estação na hora: tudo o que se compra aqui se retira no balcão da loja.
- Se você não souber, diga que não sabe e mande a pessoa ao balcão.

FORMATO
Responda só com um objeto JSON, sem texto em volta e sem bloco de código:
{"say": "a frase para dizer em voz alta", "choices": [{"label": "texto curto do botão", "value": "o que isso quer dizer"}], "goal": "sono|energia|performance|beleza|imunidade|peso|foco|mobilidade ou null", "highlight": ["ids dos produtos a destacar"]}

Sobre "choices": no máximo três, com rótulos de duas ou três palavras. São botões num tablet, não respostas escritas. Devolva lista vazia quando a conversa não pede resposta.
Sobre "goal": preencha só quando ficar claro o que a pessoa procura; caso contrário, null.`

/* ── Limites ──────────────────────────────────────────────────────────────

   Este endereço vai dentro do JavaScript público da estação, portanto qualquer
   pessoa o encontra. Três travões, do mais fraco para o mais forte:

   1. Origem — impede o abuso casual a partir de outro site. Fraco: fora do
      navegador o cabeçalho `Origin` escreve-se à mão.
   2. Balde por IP, aqui em baixo — apanha a enxurrada vinda de um sítio só.
      Vive na memória de cada isolate, portanto conta mal quando o Cloudflare
      distribui o tráfego. Chega para o acidente, não para o ataque.
   3. Regra de rate limiting no painel do Cloudflare — é esta a verdadeira, e
      está explicada no README. Fazer.

   E, por cima de tudo, um limite de gastos mensal na chave da Anthropic. É o
   único travão que não depende de nada nosso funcionar.
   ────────────────────────────────────────────────────────────────────────── */

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

const buckets = new Map()

function overLimit(ip) {
  const now = Date.now()
  const seen = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  seen.push(now)
  buckets.set(ip, seen)

  // O Map vive enquanto o isolate viver. Sem esta limpeza, um dia mau de
  // tráfego deixa lá dentro dezenas de milhares de IPs a ocupar memória.
  if (buckets.size > 5000) buckets.clear()

  return seen.length > MAX_PER_WINDOW
}

function cors(origin, allowed) {
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    // Sem isto o JS do tablet nem chega a ver estes cabecalhos: o browser
    // esconde tudo o que nao esteja na lista curta do CORS. Sao so
    // diagnostico -- dizem o que correu mal, nunca nada vindo de uma chave.
    'access-control-expose-headers': 'x-tts-cache, x-bia, x-bia-detalhe',
    'access-control-max-age': '86400',
  }
}

/* ── Voz ─────────────────────────────────────────────────────────────────────
   A voz do tablet (Web Speech API) usa as vozes instaladas no aparelho, e isso
   não se controla daqui: o PC da loja só tem pt-PT e lê o texto brasileiro da
   Bia com sotaque de Lisboa. A ElevenLabs resolve isso — a voz vem sempre igual,
   venha o aparelho que vier — mas custa por caráter e a chave não pode andar no
   browser, que o repositório é público. Por isso passa por aqui.
   ────────────────────────────────────────────────────────────────────────── */

/** Limite por fala. Uma frase da Bia não chega perto disto; um abuso chega. */
const SPEAK_MAX = 320

/**
 * Devolve a fala em MP3.
 *
 * Sem chave ou sem voz escolhida responde 501, e o tablet fala com a voz que
 * tiver. A estação nunca fica muda por causa disto: uma voz pior é um problema
 * pequeno, uma Bia calada ao pé de um cliente é um problema grande.
 */
async function speak(request, env, headers) {
  const voiceId = env.ELEVENLABS_VOICE_ID
  if (!env.ELEVENLABS_API_KEY || !voiceId) {
    return json({ error: 'voz_remota_desligada' }, 501, headers)
  }

  const body = await request.json().catch(() => null)
  const text = String(body?.text ?? '')
    .trim()
    .slice(0, SPEAK_MAX)
  if (!text) return json({ error: 'sem_texto' }, 400, headers)

  // Turbo por omissão: metade do custo do multilingue e responde bem mais
  // depressa. Num balcão, meio segundo de silêncio depois de a pessoa tocar já
  // se nota.
  const modelId = env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5'
  const key = await digest(`${voiceId}:${modelId}:${text}`)

  // A estação repete as mesmas dez ou vinte frases o dia inteiro. Sem cache,
  // pagava-se o "Oi! Eu sou a Bia" umas centenas de vezes por dia.
  if (env.TTS_CACHE) {
    const hit = await env.TTS_CACHE.get(key, 'arrayBuffer')
    if (hit) return audio(hit, headers, 'hit')
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: modelId,
        // Sem isto o modelo às vezes lê português com prosódia de espanhol.
        // O sotaque brasileiro vem da voz escolhida, não daqui.
        language_code: 'pt',
        voice_settings: { stability: 0.45, similarity_boost: 0.8 },
      }),
    },
  )

  if (!res.ok) return json({ error: 'voz_remota_falhou', status: res.status }, 502, headers)

  const bytes = await res.arrayBuffer()
  // Trinta dias. As falas só mudam quando alguém mexe no código.
  if (env.TTS_CACHE) await env.TTS_CACHE.put(key, bytes, { expirationTtl: 2_592_000 })
  return audio(bytes, headers, 'miss')
}

/** Chave curta e estável para a cache. */
/**
 * Motivo legível de uma resposta de erro da Anthropic.
 *
 * Só o tipo e o princípio da mensagem, sem acentos nem quebras de linha, que
 * um cabeçalho HTTP não aceita mais do que isso.
 */
async function reason(response) {
  try {
    const body = await response.json()
    return sanitize(`${body?.error?.type ?? ''}: ${body?.error?.message ?? ''}`)
  } catch {
    return 'sem detalhe'
  }
}

/** Texto que cabe num cabeçalho HTTP: uma linha, ASCII, curto. */
function sanitize(value) {
  return String(value).replace(/[^\x20-\x7e]/g, ' ').trim().slice(0, 150) || 'sem detalhe'
}

async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

function audio(bytes, headers, cache) {
  return new Response(bytes, {
    headers: { ...headers, 'content-type': 'audio/mpeg', 'x-tts-cache': cache },
  })
}

/** Uma frase que serve sempre, para quando o modelo não serve. */
const FALLBACK = {
  say: 'Estou aqui se você precisar de ajuda para escolher.',
  choices: [],
  goal: null,
  highlight: [],
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/**
 * O que o modelo devolve não é de confiança.
 *
 * Vem em JSON quase sempre — mas "quase sempre" numa loja é uma personagem
 * calada uma vez por dia. Se vier embrulhado em ```json, desembrulhamos; se
 * vier ilegível, dizemos a frase neutra.
 */
function readTurn(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed.say !== 'string' || !parsed.say.trim()) return FALLBACK
    return {
      say: parsed.say.trim(),
      choices: Array.isArray(parsed.choices)
        ? parsed.choices
            .filter((c) => c && typeof c.label === 'string' && typeof c.value === 'string')
            .slice(0, 3)
        : [],
      goal: typeof parsed.goal === 'string' ? parsed.goal : null,
      highlight: Array.isArray(parsed.highlight)
        ? parsed.highlight.filter((id) => typeof id === 'string')
        : [],
    }
  } catch {
    return FALLBACK
  }
}

/** O estado da estação, em palavras que o modelo entende. */
function describe(context) {
  const lines = [`Tela onde o cliente está: ${context?.screen ?? 'desconhecido'}.`]
  if (context?.goal) lines.push(`Objetivo já escolhido: ${context.goal}.`)
  if (context?.productId) lines.push(`Produto aberto: ${context.productId}.`)

  const visible = Array.isArray(context?.visible) ? context.visible.slice(0, 24) : []
  if (visible.length) {
    lines.push('Produtos disponíveis na loja (id, nome, preço):')
    for (const p of visible) {
      const euros = (Number(p.priceCents) / 100).toFixed(2).replace('.', ',')
      lines.push(`- ${p.id} | ${p.name} | ${euros} euros`)
    }
  }
  return lines.join('\n')
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const origin = request.headers.get('origin') ?? ''
    const headers = cors(origin, allowed)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: 'method' }, 405, headers)

    if (allowed.length && !allowed.includes(origin)) {
      return json({ error: 'origin' }, 403, headers)
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'sem-ip'
    if (overLimit(ip)) {
      // 429 com a frase neutra em vez de erro: quem está à frente do tablet não
      // tem culpa nem quer saber, e a estação sabe usar isto na mesma.
      return json(FALLBACK, 429, { ...headers, 'x-bia': 'limite' })
    }

    // A raiz continua a ser o cérebro da Bia, para não partir os endereços já
    // configurados. A voz é um caminho à parte porque devolve áudio, não JSON.
    if (new URL(request.url).pathname === '/speak') {
      return speak(request, env, headers)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'body' }, 400, headers)
    }

    const history = Array.isArray(body?.history) ? body.history.slice(-8) : []
    const messages = history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) }))

    // A API exige que a conversa comece do lado do cliente. Na saudação ainda
    // ninguém disse nada, por isso somos nós a abrir com o estado da estação.
    if (!messages.length || messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: 'Chegou alguém na estação. Cumprimente.' })
    }
    messages[messages.length - 1] = {
      role: messages[messages.length - 1].role,
      content: `${messages[messages.length - 1].content}\n\n[Estado da estação]\n${describe(body?.context)}`,
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json(FALLBACK, 200, { ...headers, 'x-bia': 'sem-chave' })
    }

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          // Uma chave pessoal (as que a consola cria por omissão) não sabe a
          // que carteira háde cobrar e recusa o pedido com 400. Dizendo-lhe o
          // workspace, funciona. Uma chave criada dentro de um workspace já
          // sabe, e aí isto vai vazio e não estorva.
          ...(env.ANTHROPIC_WORKSPACE_ID
            ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID }
            : {}),
        },
        body: JSON.stringify({
          model: env.MODEL ?? 'claude-sonnet-5',
          // A resposta são duas frases e três botões, mas isto tem de dar folga
          // para o JSON à volta -- e português com acentos gasta mais fichas do
          // que parece. Com 300 as respostas mais compridas ficavam cortadas a
          // meio e a estacão, sem conseguir lê-las, dizia a fala escrita.
          //
          // Isto é um tecto, não uma encomenda: paga-se o que ela escrever, e o
          // travão a sério é a regra das duas frases no SYSTEM.
          max_tokens: 700,
          system: SYSTEM,
          messages,
        }),
      })

      if (!upstream.ok) {
        // O corpo do erro da Anthropic diz o que está mal no pedido -- quase
        // sempre o nome do modelo. Nunca traz a chave de volta, mas mesmo
        // assim vai limpo e cortado: um cabeçalho só aceita ASCII e ninguém
        // precisa de mais do que a primeira linha.
        return json(FALLBACK, 200, {
          ...headers,
          'x-bia': `anthropic-${upstream.status}`,
          'x-bia-detalhe': await reason(upstream),
        })
      }

      const data = await upstream.json()
      const text = data?.content?.find((c) => c.type === 'text')?.text ?? ''
      const turn = readTurn(text)
      if (turn === FALLBACK) {
        // O que ela escreveu são palavras dela, não credenciais -- vai o
        // princípio, para se perceber se divagou ou se ficou a meio.
        return json(FALLBACK, 200, {
          ...headers,
          'x-bia': 'ilegivel',
          'x-bia-detalhe': `${data?.stop_reason ?? '?'} | ${sanitize(text)}`,
        })
      }
      return json(turn, 200, { ...headers, 'x-bia': 'ok' })
    } catch (err) {
      // Nunca devolvemos erro ao tablet: a estação tem falas escritas para este
      // caso, mas uma resposta válida evita que a personagem se cale. O nome
      // do erro vai no cabeçalho para se perceber porquê sem abrir os registos.
      return json(FALLBACK, 200, { ...headers, 'x-bia': `erro-${err?.name ?? 'desconhecido'}` })
    }
  },
}
