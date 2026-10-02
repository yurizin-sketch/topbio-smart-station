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
import { PRICES } from './prices.js'

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
                    expires_at AS expiresAt, paid_at AS paidAt, closed_at AS closedAt,
                    nif, invoice_name AS invoiceName, invoice_email AS invoiceEmail`

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

/* ── Pagamento no tablet: MB WAY pela Easypay ────────────────────────────────

   O tablet pede uma ligação de pagamento (Pay By Link), mostra-a em QR, e o
   cliente paga no telemóvel. Três regras, todas pela mesma razão — o tablet
   e o endereço deste servidor são públicos:

   1. O valor sai do `PRICES` deste lado, nunca do pedido.
   2. «Pago» só se escreve depois de a Easypay o confirmar a quem lhe pergunta
      com a nossa chave. O aviso que ela manda (`/api/pay/notify`) não traz
      assinatura nenhuma: qualquer pessoa o podia forjar, por isso só serve
      para nos fazer ir perguntar.
   3. Sem chaves postas (`EASYPAY_ACCOUNT_ID`, `EASYPAY_API_KEY`), tudo isto
      responde «desligado» e o tablet manda ao balcão. Desligar é tirar as
      chaves; não há nada a mudar no tablet.

   `EASYPAY_ENV` escolhe o ambiente: «test» (por omissão) ou «prod». Em teste
   não sai dinheiro de lado nenhum, e o MB WAY confirma-se sem telemóvel.
   ────────────────────────────────────────────────────────────────────────── */

/** A ligação vive um pouco mais do que o ecrã espera por ela (10 min). */
const PAY_LINK_MINUTES = 15

function easypay(env) {
  if (!env.EASYPAY_ACCOUNT_ID || !env.EASYPAY_API_KEY) return null
  const base =
    env.EASYPAY_ENV === 'prod' ? 'https://api.prod.easypay.pt/2.0' : 'https://api.test.easypay.pt/2.0'
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        AccountId: env.EASYPAY_ACCOUNT_ID,
        ApiKey: env.EASYPAY_API_KEY,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // O corpo da Easypay vai para o log do worker, não para o tablet: pode
      // trazer detalhes da conta que não são para um ecrã público.
      console.log('easypay', method, path, res.status, JSON.stringify(data).slice(0, 500))
      throw new Error(`easypay-${res.status}`)
    }
    return data
  }
  return { call }
}

/** «2026-10-02 14:05», na hora de Lisboa, que é como a Easypay a quer. */
function lisbonTime(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

async function payStart(env, body) {
  const ep = easypay(env)
  if (!ep) return { erro: 'pagamento-desligado', status: 503 }

  const id = String(body?.orderId ?? '')
  const order = await env.DB.prepare(
    `SELECT id, product_id AS productId, ticket_code AS ticketCode, status, pay_url AS payUrl
     FROM orders WHERE id = ?1`,
  )
    .bind(id)
    .first()
  if (!order) return { erro: 'nao-encontrado', status: 404 }
  if (order.status !== 'awaiting_counter') return { erro: 'estado', status: 409 }
  // O tablet repete o pedido se a rede piscar. Devolve-se a mesma ligação em
  // vez de abrir uma segunda para a mesma venda.
  if (order.payUrl) return { ok: true, url: order.payUrl }

  const cents = PRICES[order.productId]
  if (!cents) return { erro: 'sem-preco', status: 409 }

  let link
  try {
    link = await ep.call('POST', '/link', {
      // A `key` é o id da venda: é ela que volta no aviso de pagamento.
      key: order.id,
      value: Number((cents / 100).toFixed(2)),
      currency: 'EUR',
      description: `TopBio ${order.ticketCode}`,
      expiration_time: lisbonTime(Date.now() + PAY_LINK_MINUTES * 60_000),
      // Só MB WAY: é o que a loja pediu e o que se confirma em segundos. Um
      // pagamento por referência Multibanco podia entrar daqui a dois dias,
      // com o cliente já fora da loja.
      payment_methods: ['MBW'],
    })
  } catch {
    return { erro: 'easypay', status: 502 }
  }
  if (!link?.url || !link?.id) return { erro: 'easypay', status: 502 }

  await env.DB.prepare(
    `UPDATE orders SET pay_id = ?2, pay_url = ?3, amount_cents = ?4 WHERE id = ?1`,
  )
    .bind(order.id, String(link.id), String(link.url), cents)
    .run()

  return { ok: true, url: link.url }
}

/**
 * Já pagaram?
 *
 * Pergunta-se à Easypay e não à nossa base: a base só passa a «pago» depois
 * daqui. Um pagamento confirmado escreve-se uma vez, com o stock a descer no
 * mesmo `batch` — a mesma regra do balcão (ver `settle`).
 */
async function payStatus(env, body) {
  const ep = easypay(env)
  if (!ep) return { erro: 'pagamento-desligado', status: 503 }

  const id = String(body?.orderId ?? '')
  const order = await env.DB.prepare(
    `SELECT id, station_id AS stationId, product_id AS productId, status, pay_id AS payId
     FROM orders WHERE id = ?1`,
  )
    .bind(id)
    .first()
  if (!order) return { erro: 'nao-encontrado', status: 404 }
  if (order.status === 'paid' || order.status === 'delivered') return { ok: true, state: 'paid' }
  if (order.status === 'cancelled') return { ok: true, state: 'failed' }
  if (!order.payId) return { ok: true, state: 'pending' }

  let state = 'pending'
  try {
    state = await linkState(ep, order.payId)
  } catch {
    return { ok: true, state: 'pending' }
  }
  if (state === 'paid') await markPaid(env, order)
  return { ok: true, state }
}

/**
 * O estado de uma ligação, contado pelo pagamento que lá está dentro.
 *
 * `FINALIZED` na ligação não quer dizer pago — quer dizer que a pessoa chegou
 * ao fim da página. O que conta é o pagamento: `paid`/`success` é dinheiro
 * entrado; `failed`/`deleted`/`voided`, desistência.
 */
async function linkState(ep, payId) {
  const link = await ep.call('GET', `/link/${encodeURIComponent(payId)}`)
  const pagamentos = [link?.payment, ...(Array.isArray(link?.payments) ? link.payments : [])].filter(
    Boolean,
  )
  for (const p of pagamentos) {
    let status = String(p.status ?? p.payment_status ?? '').toLowerCase()
    // Quando a ligação só traz o id do pagamento, vai-se buscar o pagamento.
    if (!status && p.id) {
      const single = await ep.call('GET', `/single/${encodeURIComponent(p.id)}`)
      status = String(single?.payment_status ?? single?.status ?? '').toLowerCase()
    }
    if (status === 'paid' || status === 'success') return 'paid'
    if (['failed', 'deleted', 'voided', 'error'].includes(status)) return 'failed'
  }
  const estado = String(link?.status ?? '').toUpperCase()
  if (estado === 'EXPIRED' || estado === 'CANCELED' || estado === 'CANCELLED') return 'failed'
  return 'pending'
}

async function markPaid(env, order) {
  const now = Date.now()
  const posto = await env.DB.prepare('SELECT tracks_stock AS tracksStock FROM stations WHERE id = ?1')
    .bind(order.stationId)
    .first()
  // O `WHERE status = 'awaiting_counter'` é o que impede descontar duas vezes
  // quando o aviso da Easypay e a pergunta do tablet chegam ao mesmo tempo; o
  // índice único em `stock_moves.order_id` apanha o resto.
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', method = 'mbway', paid_at = ?2
     WHERE id = ?1 AND status = 'awaiting_counter'`,
  )
    .bind(order.id, now)
    .run()
  if (!res.meta?.changes) return

  const writes = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO stock_moves
         (station_id, product_id, delta, reason, order_id, actor, at)
       VALUES (?1, ?2, -1, 'venda', ?3, 'easypay', ?4)`,
    ).bind(order.stationId, order.productId, order.id, now),
  ]
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
  await env.DB.batch(writes)
}

/**
 * O aviso da Easypay de que algo mudou.
 *
 * Não se acredita nele (não vem assinado): tira-se a `key`, que é o id da
 * venda, e pergunta-se como no `payStatus`. Responde sempre 200 — um erro
 * aqui faria a Easypay insistir, e insistir não muda a resposta.
 */
async function payNotify(env, body) {
  const key = String(body?.key ?? '')
  if (key) {
    try {
      await payStatus(env, { orderId: key })
    } catch (e) {
      console.log('easypay notify', key, String(e))
    }
  }
  return { ok: true }
}

/**
 * Os dados da fatura, que o cliente escreve depois de pagar no tablet.
 *
 * Aberto, porque quem chama é o quiosque. Por isso só aceita numa venda já
 * paga no tablet e na primeira meia hora depois disso: fora disso é alguém a
 * escrever por cima dos dados de outra pessoa. E nunca por cima de dados que
 * já lá estejam — quem se enganou pede a correção ao balcão.
 */
const INVOICE_WINDOW_MS = 30 * 60_000

async function orderInvoice(env, body) {
  const id = String(body?.orderId ?? '')
  const email = String(body?.invoiceEmail ?? '').trim().slice(0, 160)
  const nome = String(body?.invoiceName ?? '').trim().slice(0, 120) || null
  const nif = String(body?.nif ?? '').replace(/\D/g, '') || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: 'email', status: 400 }
  if (nif && !/^\d{9}$/.test(nif)) return { erro: 'nif', status: 400 }

  const res = await env.DB.prepare(
    `UPDATE orders SET invoice_name = ?2, nif = ?3, invoice_email = ?4
     WHERE id = ?1 AND method = 'mbway' AND pay_id IS NOT NULL
       AND status IN ('paid', 'delivered') AND paid_at > ?5
       AND invoice_email IS NULL`,
  )
    .bind(id, nome, nif, email, Date.now() - INVOICE_WINDOW_MS)
    .run()
  return res.meta?.changes ? { ok: true } : { erro: 'nao-encontrado', status: 404 }
}

/* ── O distribuidor ───────────────────────────────────────────────────────── */

/** Caminhos que não pedem sessão. Tudo o resto pede. */
//
// Os do pagamento são abertos porque quem os chama é o quiosque, que não tem
// sessão nenhuma, e a Easypay. Nenhum deles escreve «pago» por palavra de quem
// chama: ver o bloco do pagamento.
const ABERTAS = new Set([
  '/api/login',
  '/api/orders/create',
  '/api/pay/start',
  '/api/pay/status',
  '/api/pay/notify',
  '/api/orders/invoice',
])

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
    case '/api/pay/start':
      out = await payStart(env, body)
      break
    case '/api/pay/status':
      out = await payStatus(env, body)
      break
    case '/api/orders/invoice':
      out = await orderInvoice(env, body)
      break
    case '/api/pay/notify':
      out = await payNotify(env, body)
      break
    default:
      out = { erro: 'caminho', status: 404 }
  }

  const { status = 200, ...resto } = out
  return reply(resto, status, headers)
}
