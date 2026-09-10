/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A porta da base de dados
 *
 * Tudo o que grava ou lê o D1 passa por aqui. O `worker.js` continua a ser a
 * Cláudia e a voz; isto é a contabilidade, e são coisas diferentes o
 * suficiente para viverem em ficheiros diferentes.
 *
 * Duas regras que atravessam o ficheiro todo:
 *
 * 1. **«Pago» só se escreve com sessão iniciada.** O quiosque não tem como
 *    dizer que recebeu dinheiro — não tem sessão nenhuma e não há caminho
 *    aqui que lhe dê uma. Quem escreve «pago» é uma pessoa que sabe o PIN do
 *    balcão daquela loja.
 *
 * 2. **O stock desce quando o dinheiro entra, não quando o código sai.** Quem
 *    toca em «Comprar» e vai embora não gasta unidade nenhuma. Ver `settle`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Quanto tempo dura uma sessão do balcão ou da matriz. */
const SESSION_MS = 12 * 60 * 60 * 1000 // um dia de trabalho

const REASONS = new Set(['venda', 'entrada', 'contagem', 'devolucao', 'correcao'])
const METHODS = new Set(['dinheiro', 'mbway', 'cartao'])

const enc = new TextEncoder()

/**
 * Travão da contabilidade.
 *
 * Mais largo do que o do cérebro porque estes pedidos custam quase nada e
 * porque uma loja inteira — tablet, balcão e, se o dono estiver lá, a matriz —
 * sai toda pelo mesmo endereço. Cento e vinte por minuto dá folga para um dia
 * cheio e continua a travar quem esteja a bater à porta.
 */
const RATE = new Map()
function overApiLimit(ip) {
  const now = Date.now()
  const b = RATE.get(ip)
  if (!b || now - b.start > 60_000) {
    RATE.set(ip, { start: now, n: 1 })
    if (RATE.size > 5000) RATE.clear()
    return false
  }
  b.n++
  return b.n > 120
}

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  })
}

/* ── Contas e sessões ─────────────────────────────────────────────────────── */

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Comparação que demora sempre o mesmo tempo.
 *
 * Um `===` normal desiste na primeira letra diferente, e a diferença de
 * microssegundos entre «errou à primeira» e «errou à última» chega para
 * adivinhar um segredo letra a letra. Aqui percorre-se tudo sempre.
 */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const b64url = {
  encode: (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))),
}

/**
 * Um bilhete assinado, sem nada guardado do nosso lado.
 *
 * O conteúdo é legível por quem o tiver — não leva segredos, leva só «esta
 * pessoa é o balcão da loja X até às 19h». Falsificá-lo é que exige a chave,
 * e essa nunca sai do worker.
 */
async function mint(env, payload) {
  const exp = Date.now() + SESSION_MS
  const body = b64url.encode({ ...payload, exp })
  return { token: `${body}.${await hmac(env.SESSION_SECRET, body)}`, exp }
}

async function readToken(env, request) {
  const raw = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  if (!same(sig, await hmac(env.SESSION_SECRET, body))) return null
  try {
    const claims = b64url.decode(body)
    return claims.exp > Date.now() ? claims : null
  } catch {
    return null
  }
}

/**
 * Travão para quem anda a tentar PINs.
 *
 * O travão geral do worker deixa passar vinte pedidos por minuto, o que dá
 * para varrer um PIN de quatro dígitos numa noite. Aqui são cinco tentativas
 * falhadas por minuto e por endereço — quem sabe o PIN acerta à primeira e
 * nunca dá por isto.
 */
const failures = new Map()
function tooManyTries(ip) {
  const now = Date.now()
  const bucket = failures.get(ip)
  if (!bucket || now - bucket.start > 60_000) return false
  return bucket.n >= 5
}
function noteFailure(ip) {
  const now = Date.now()
  const bucket = failures.get(ip)
  if (!bucket || now - bucket.start > 60_000) failures.set(ip, { start: now, n: 1 })
  else bucket.n++
  if (failures.size > 2000) failures.clear()
}

/* ── Rotas ────────────────────────────────────────────────────────────────── */

/**
 * Entrar.
 *
 * `balcao` pede o PIN daquela loja, que está em resumo na tabela `stations`.
 * `matriz` pede a palavra-passe do dono, que é um segredo do Cloudflare e não
 * está em base de dados nenhuma — ninguém com acesso aos dados fica com ela.
 */
async function login(env, body, ip) {
  const scope = body?.scope
  const secret = String(body?.secret ?? '')

  if (scope === 'matriz') {
    if (!env.MATRIZ_PASSWORD) return { erro: 'sem-matriz', status: 503 }
    if (!same(secret, env.MATRIZ_PASSWORD)) {
      noteFailure(ip)
      return { erro: 'credenciais', status: 401 }
    }
    return { ok: true, ...(await mint(env, { scope: 'matriz' })), scope: 'matriz' }
  }

  if (scope === 'balcao') {
    const stationId = String(body?.stationId ?? '')
    const station = await env.DB.prepare(
      'SELECT id, name, counter_pin FROM stations WHERE id = ?1 AND active = 1',
    )
      .bind(stationId)
      .first()
    if (!station || !same(await sha256(secret), station.counter_pin)) {
      noteFailure(ip)
      return { erro: 'credenciais', status: 401 }
    }
    return {
      ok: true,
      ...(await mint(env, { scope: 'balcao', stationId })),
      scope: 'balcao',
      stationId,
      stationName: station.name,
    }
  }

  return { erro: 'scope', status: 400 }
}

/**
 * O quiosque acabou de emitir um código.
 *
 * Isto não pede sessão, de propósito. Um pedido por pagar não vale dinheiro
 * nenhum — é um número num ecrã — e obrigar o tablet a guardar uma chave era
 * pôr uma chave num aparelho que fica sozinho numa loja. O que dá jeito
 * roubar é o «pago» e a matriz, e esses pedem sessão.
 *
 * A chave é o `id` que o tablet gerou. Se a ligação cair a meio e ele repetir
 * o envio, o `ON CONFLICT` reescreve a mesma linha em vez de criar uma
 * segunda — e nunca deixa um envio repetido baixar um estado já avançado.
 */
async function createOrder(env, body) {
  const o = body?.order
  if (!o?.id || !o?.stationId || !o?.ticketCode || !o?.productId) {
    return { erro: 'pedido-incompleto', status: 400 }
  }

  const station = await env.DB.prepare('SELECT id FROM stations WHERE id = ?1 AND active = 1')
    .bind(o.stationId)
    .first()
  if (!station) return { erro: 'posto-desconhecido', status: 400 }

  await env.DB.prepare(
    `INSERT INTO orders (id, station_id, ticket_code, product_id, amount_cents,
                         status, method, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'awaiting_counter', NULL, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at
     WHERE orders.status = 'awaiting_counter'`,
  )
    .bind(
      String(o.id),
      String(o.stationId),
      String(o.ticketCode),
      String(o.productId),
      Number(o.amountCents) | 0,
      Number(o.createdAt) || Date.now(),
      Number(o.expiresAt) || Date.now(),
    )
    .run()

  return { ok: true }
}

const ORDER_COLS = `id, station_id AS stationId, ticket_code AS ticketCode,
                    product_id AS productId, amount_cents AS amountCents,
                    status, method, created_at AS createdAt,
                    expires_at AS expiresAt, paid_at AS paidAt, closed_at AS closedAt`

/** Procurar pelo código que o cliente traz no ecrã. */
async function findOrder(env, claims, body) {
  const code = String(body?.code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (code.length < 4) return { erro: 'codigo', status: 400 }

  const order = await env.DB.prepare(
    `SELECT ${ORDER_COLS} FROM orders
     WHERE ticket_code = ?1 AND station_id = ?2
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(code, claims.stationId)
    .first()

  return order ? { ok: true, order } : { erro: 'nao-encontrado', status: 404 }
}

/** A fila do balcão: o que está por entregar neste posto. */
async function pending(env, claims) {
  const { results } = await env.DB.prepare(
    `SELECT ${ORDER_COLS} FROM orders
     WHERE station_id = ?1 AND status IN ('awaiting_counter', 'paid')
     ORDER BY created_at ASC LIMIT 60`,
  )
    .bind(claims.stationId)
    .all()
  return { ok: true, orders: results ?? [] }
}

/**
 * Recebeu e entregou.
 *
 * É a única escrita de «pago» que existe, e é aqui que o stock desce — no
 * momento em que o dinheiro entra, não quando o código foi emitido.
 *
 * As quatro escritas vão num `batch`, que no D1 é uma transacção: ou entram
 * todas ou não entra nenhuma. Sem isso, uma falha a meio deixava mercadoria
 * entregue sem venda registada, ou stock descontado sem entrega.
 */
async function settle(env, claims, body) {
  const id = String(body?.id ?? '')
  const method = String(body?.method ?? '')
  if (!id) return { erro: 'pedido', status: 400 }

  // O posto vem junto por causa do `tracks_stock`: no armazém a venda
  // regista-se, mas não desce nenhum número — ver o `schema.sql`.
  const [order, posto] = await Promise.all([
    env.DB.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?1 AND station_id = ?2`)
      .bind(id, claims.stationId)
      .first(),
    env.DB.prepare('SELECT tracks_stock AS tracksStock FROM stations WHERE id = ?1')
      .bind(claims.stationId)
      .first(),
  ])
  if (!order) return { erro: 'nao-encontrado', status: 404 }
  if (order.status === 'delivered') return { ok: true, order, ja: true }
  if (order.status === 'cancelled') return { erro: 'cancelado', status: 409 }

  const owes = order.status === 'awaiting_counter'
  if (owes && !METHODS.has(method)) return { erro: 'metodo', status: 400 }

  const now = Date.now()
  const writes = [
    env.DB.prepare(
      `UPDATE orders
       SET status = 'delivered', closed_at = ?2,
           method = COALESCE(method, ?3), paid_at = COALESCE(paid_at, ?2)
       WHERE id = ?1`,
    ).bind(id, now, owes ? method : null),
  ]

  // Só desconta quem ainda devia. Um pedido já pago noutro momento já
  // descontou nessa altura, e o índice único em `order_id` é a rede que
  // apanha o resto: dois toques no botão, duas tentativas do tablet.
  if (owes) {
    // A saída escreve-se sempre, mesmo no armazém: é o registo de o que saiu
    // pela porta, e é dele que se tira a conta no dia em que alguém contar.
    writes.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO stock_moves
           (station_id, product_id, delta, reason, order_id, actor, at)
         VALUES (?1, ?2, -1, 'venda', ?3, ?4, ?5)`,
      ).bind(order.stationId, order.productId, id, `balcao:${claims.stationId}`, now),
    )
    // O número só desce onde há um número contado a que descer.
    if (posto?.tracksStock !== 0) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO stock (station_id, product_id, qty, updated_at)
           VALUES (?1, ?2, -1, ?3)
           ON CONFLICT(station_id, product_id)
           DO UPDATE SET qty = qty - 1, updated_at = ?3`,
        ).bind(order.stationId, order.productId, now),
      )
    }
  }

  await env.DB.batch(writes)

  const fresh = await env.DB.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?1`)
    .bind(id)
    .first()
  return { ok: true, order: fresh }
}

/** O cliente desistiu, ou o código expirou sem ninguém aparecer. */
async function cancelOrder(env, claims, body) {
  const id = String(body?.id ?? '')
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'cancelled', closed_at = ?3
     WHERE id = ?1 AND station_id = ?2 AND status = 'awaiting_counter'`,
  )
    .bind(id, claims.stationId, Date.now())
    .run()
  return res.meta?.changes ? { ok: true } : { erro: 'nao-encontrado', status: 404 }
}

/** O que há na prateleira de um posto. */
async function stockList(env, claims, body) {
  const stationId = claims.scope === 'matriz' ? String(body?.stationId ?? '') : claims.stationId
  if (!stationId) return { erro: 'posto', status: 400 }

  const { results } = await env.DB.prepare(
    `SELECT product_id AS productId, qty, updated_at AS updatedAt
     FROM stock WHERE station_id = ?1 ORDER BY product_id`,
  )
    .bind(stationId)
    .all()
  return { ok: true, stationId, stock: results ?? [] }
}

/**
 * Mexer no stock à mão: mercadoria que chegou, contagem da prateleira,
 * devolução, engano de dedo.
 *
 * Isto não é um extra — é o que impede o número de se afastar da prateleira e
 * deixar de servir. Vende-se ao balcão sem passar pelo tablet, parte-se um
 * frasco, chega uma caixa: se não houver por onde corrigir, ao fim de uma
 * semana ninguém olha para o stock.
 *
 * Uma venda nunca entra por aqui — essa é escrita pelo `settle`, com o pedido
 * agarrado, e sem pedido não há como saber se já foi descontada.
 */
async function stockMove(env, claims, body) {
  const stationId = claims.scope === 'matriz' ? String(body?.stationId ?? '') : claims.stationId
  const productId = String(body?.productId ?? '')
  const reason = String(body?.reason ?? '')
  const delta = Number(body?.delta)

  if (!stationId || !productId) return { erro: 'posto-ou-produto', status: 400 }
  if (!REASONS.has(reason) || reason === 'venda') return { erro: 'motivo', status: 400 }
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) {
    return { erro: 'quantidade', status: 400 }
  }

  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO stock_moves (station_id, product_id, delta, reason, note, actor, at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      stationId,
      productId,
      delta,
      reason,
      String(body?.note ?? '').slice(0, 200) || null,
      claims.scope === 'matriz' ? 'matriz' : `balcao:${claims.stationId}`,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO stock (station_id, product_id, qty, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(station_id, product_id)
       DO UPDATE SET qty = qty + ?3, updated_at = ?4`,
    ).bind(stationId, productId, delta, now),
  ])

  const linha = await env.DB.prepare(
    'SELECT qty FROM stock WHERE station_id = ?1 AND product_id = ?2',
  )
    .bind(stationId, productId)
    .first()
  return { ok: true, qty: linha?.qty ?? 0 }
}

/**
 * A vista da matriz: que posto vendeu o quê, quando, e como o dinheiro entrou.
 *
 * Conta só o que foi mesmo pago. Códigos emitidos e nunca levantados não são
 * vendas — se entrassem na conta, o mapa dizia que a loja facturou o que não
 * facturou.
 */
async function overview(env, body) {
  const to = Number(body?.to) || Date.now()
  const from = Number(body?.from) || to - 30 * 24 * 60 * 60 * 1000

  const [postos, porPosto, porProduto, porMetodo, stock] = await Promise.all([
    env.DB.prepare(
      'SELECT id, name, active, tracks_stock AS tracksStock FROM stations ORDER BY name',
    ).all(),
    env.DB.prepare(
      `SELECT station_id AS stationId, COUNT(*) AS vendas, SUM(amount_cents) AS totalCents
       FROM orders WHERE paid_at BETWEEN ?1 AND ?2 GROUP BY station_id`,
    )
      .bind(from, to)
      .all(),
    env.DB.prepare(
      `SELECT station_id AS stationId, product_id AS productId,
              COUNT(*) AS vendas, SUM(amount_cents) AS totalCents
       FROM orders WHERE paid_at BETWEEN ?1 AND ?2
       GROUP BY station_id, product_id ORDER BY vendas DESC`,
    )
      .bind(from, to)
      .all(),
    env.DB.prepare(
      `SELECT method, COUNT(*) AS vendas, SUM(amount_cents) AS totalCents
       FROM orders WHERE paid_at BETWEEN ?1 AND ?2 AND method IS NOT NULL
       GROUP BY method`,
    )
      .bind(from, to)
      .all(),
    env.DB.prepare(
      `SELECT station_id AS stationId, product_id AS productId, qty
       FROM stock ORDER BY station_id, product_id`,
    ).all(),
  ])

  return {
    ok: true,
    from,
    to,
    stations: postos.results ?? [],
    porPosto: porPosto.results ?? [],
    porProduto: porProduto.results ?? [],
    porMetodo: porMetodo.results ?? [],
    stock: stock.results ?? [],
  }
}

/* ── O distribuidor ───────────────────────────────────────────────────────── */

/** Caminhos que não pedem sessão. Tudo o resto pede. */
const ABERTAS = new Set(['/api/login', '/api/orders/create'])

/** Quem pode chegar a cada caminho. */
const PERMISSAO = {
  '/api/orders/find': ['balcao'],
  '/api/orders/pending': ['balcao'],
  '/api/orders/settle': ['balcao'],
  '/api/orders/cancel': ['balcao'],
  '/api/stock/list': ['balcao', 'matriz'],
  '/api/stock/move': ['balcao', 'matriz'],
  '/api/matriz/overview': ['matriz'],
}

export function isApi(path) {
  return path.startsWith('/api/')
}

export async function handleApi(request, env, headers, path, ip) {
  if (overApiLimit(ip)) return reply({ erro: 'limite' }, 429, headers)
  if (!env.DB) return reply({ erro: 'sem-base-de-dados' }, 503, headers)
  if (!env.SESSION_SECRET) return reply({ erro: 'sem-segredo-de-sessao' }, 503, headers)

  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  let claims = null
  if (!ABERTAS.has(path)) {
    claims = await readToken(env, request)
    // 401 e não 403: a diferença importa ao ecrã, que sabe que 401 quer dizer
    // «a sessão acabou, peça o PIN outra vez» em vez de «não tem autorização».
    if (!claims) return reply({ erro: 'sessao' }, 401, headers)
    const podem = PERMISSAO[path]
    if (!podem || !podem.includes(claims.scope)) return reply({ erro: 'permissao' }, 403, headers)
  }

  let out
  switch (path) {
    case '/api/login':
      if (tooManyTries(ip)) out = { erro: 'demasiadas-tentativas', status: 429 }
      else out = await login(env, body, ip)
      break
    case '/api/orders/create':
      out = await createOrder(env, body)
      break
    case '/api/orders/find':
      out = await findOrder(env, claims, body)
      break
    case '/api/orders/pending':
      out = await pending(env, claims)
      break
    case '/api/orders/settle':
      out = await settle(env, claims, body)
      break
    case '/api/orders/cancel':
      out = await cancelOrder(env, claims, body)
      break
    case '/api/stock/list':
      out = await stockList(env, claims, body)
      break
    case '/api/stock/move':
      out = await stockMove(env, claims, body)
      break
    case '/api/matriz/overview':
      out = await overview(env, body)
      break
    default:
      out = { erro: 'caminho', status: 404 }
  }

  const { status = 200, ...resto } = out
  return reply(resto, status, headers)
}
