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
import { NAMES, PRICES } from './prices.js'

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
/** O máximo de frascos numa venda do tablet. Mais do que isto é no balcão. */
const MAX_QTY = 5
/** E o máximo de produtos diferentes num carrinho. */
const MAX_LINES = 10

async function createOrder(env, body) {
  const o = body?.order
  if (!o?.id || !o?.stationId || !o?.ticketCode || !(o?.productId || o?.items?.length)) {
    return { erro: 'pedido-incompleto', status: 400 }
  }

  // O carrinho. Uma venda antiga (ou de um tablet por atualizar) traz só um
  // produto e a quantidade dele; uma nova traz as linhas todas.
  const lines = cleanLines(o.items ?? [{ productId: o.productId, quantity: o.quantity }])
  if (!lines.length) return { erro: 'pedido-incompleto', status: 400 }
  const quantity = lines.reduce((n, l) => n + l.quantity, 0)

  const station = await env.DB.prepare('SELECT id FROM stations WHERE id = ?1 AND active = 1')
    .bind(o.stationId)
    .first()
  if (!station) return { erro: 'posto-desconhecido', status: 400 }

  await env.DB.prepare(
    `INSERT INTO orders (id, station_id, ticket_code, product_id, amount_cents,
                         status, method, created_at, expires_at, quantity)
     VALUES (?1, ?2, ?3, ?4, ?5, 'awaiting_counter', NULL, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at
     WHERE orders.status = 'awaiting_counter'`,
  )
    .bind(
      String(o.id),
      String(o.stationId),
      String(o.ticketCode),
      // O primeiro produto fica na própria venda, para o que ainda lê só
      // esta coluna. As linhas todas vão para `order_items`.
      lines[0].productId,
      Number(o.amountCents) | 0,
      Number(o.createdAt) || Date.now(),
      Number(o.expiresAt) || Date.now(),
      quantity,
    )
    .run()

  // As linhas só se escrevem numa venda ainda por pagar: um tablet a repetir
  // o envio de uma venda já paga não lhe muda o que se pagou.
  const still = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?1`).bind(String(o.id)).first()
  if (still?.status === 'awaiting_counter') {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?1`).bind(String(o.id)),
      ...lines.map((l) =>
        env.DB.prepare(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_cents) VALUES (?1, ?2, ?3, ?4)`,
        ).bind(String(o.id), l.productId, l.quantity, PRICES[l.productId] ?? 0),
      ),
    ])
  }

  return { ok: true }
}

/**
 * As linhas de um carrinho que veio do tablet, apertadas: produtos repetidos
 * juntam-se, cada linha fica entre 1 e `MAX_QTY` frascos, e no máximo
 * `MAX_LINES` produtos diferentes.
 */
function cleanLines(raw) {
  const byProduct = new Map()
  for (const l of Array.isArray(raw) ? raw : []) {
    const productId = String(l?.productId ?? '')
    if (!productId) continue
    const q = Math.max(1, Number(l?.quantity) | 0 || 1)
    byProduct.set(productId, Math.min(MAX_QTY, (byProduct.get(productId) ?? 0) + q))
  }
  return [...byProduct].slice(0, MAX_LINES).map(([productId, quantity]) => ({ productId, quantity }))
}

/**
 * O que uma venda leva: as linhas do `order_items`, ou — numa venda de antes
 * do carrinho, que não as tem — o produto e a quantidade da própria venda.
 */
async function orderLines(env, order) {
  const { results } = await env.DB.prepare(
    `SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ?1 ORDER BY rowid`,
  )
    .bind(order.id)
    .all()
  if (results?.length) return results
  return [{ productId: order.productId, quantity: Math.max(1, Number(order.quantity) || 1) }]
}

/** Junta as linhas a cada venda, para o balcão saber o que entregar. */
async function withItems(env, orders) {
  return Promise.all(orders.map(async (o) => ({ ...o, items: await orderLines(env, o) })))
}

const ORDER_COLS = `id, station_id AS stationId, ticket_code AS ticketCode,
                    product_id AS productId, amount_cents AS amountCents,
                    quantity, status, method, created_at AS createdAt,
                    expires_at AS expiresAt, paid_at AS paidAt, closed_at AS closedAt,
                    nif, invoice_name AS invoiceName, invoice_email AS invoiceEmail`

/** Procurar pelo código que o cliente traz no ecrã. */
/**
 * Antes de o balcão ver ou cobrar uma venda, pergunta-se se ela já foi paga
 * no tablet.
 *
 * Quem pediu o MB WAY no tablet e depois carregou em «pagar no balcão» ainda
 * tem o pedido vivo na app durante uns minutos, e pode confirmá-lo a caminho
 * do balcão. O tablet já deixou de perguntar, e o aviso de quem cobrou pode
 * não ter chegado. Sem isto, o balcão cobrava outra vez.
 *
 * Só para vendas por pagar com um pedido feito, e só na primeira meia hora:
 * depois disso nenhum pedido está vivo. Um erro de rede não impede o balcão
 * de trabalhar.
 */
async function refreshPayment(env, ids) {
  if (!ids.length) return
  const marks = ids.map((_, i) => `?${i + 2}`).join(', ')
  const { results } = await env.DB.prepare(
    `SELECT id, station_id AS stationId, product_id AS productId, status, pay_id AS payId
     FROM orders
     WHERE status = 'awaiting_counter' AND pay_id IS NOT NULL AND created_at > ?1
       AND id IN (${marks})`,
  )
    .bind(Date.now() - 30 * 60_000, ...ids)
    .all()
  await Promise.all(
    (results ?? []).map(async (order) => {
      try {
        const found = await lookupPayment(env, order.payId)
        if (found.state === 'paid') await markPaid(env, order, found.method)
      } catch {
        // Fica como estava; a próxima pergunta tenta outra vez.
      }
    }),
  )
}

async function findOrder(env, claims, body) {
  const code = String(body?.code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (code.length < 4) return { erro: 'codigo', status: 400 }

  const find = () =>
    env.DB.prepare(
      `SELECT ${ORDER_COLS} FROM orders
       WHERE ticket_code = ?1 AND station_id = ?2
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(code, claims.stationId)
      .first()

  let order = await find()
  if (order?.status === 'awaiting_counter') {
    await refreshPayment(env, [order.id])
    order = await find()
  }

  return order ? { ok: true, order: (await withItems(env, [order]))[0] } : { erro: 'nao-encontrado', status: 404 }
}

/** A fila do balcão: o que está por entregar neste posto. */
async function pending(env, claims) {
  const { results: porPagar } = await env.DB.prepare(
    `SELECT id FROM orders WHERE station_id = ?1 AND status = 'awaiting_counter' LIMIT 60`,
  )
    .bind(claims.stationId)
    .all()
  await refreshPayment(env, (porPagar ?? []).map((o) => o.id))

  const { results } = await env.DB.prepare(
    `SELECT ${ORDER_COLS} FROM orders
     WHERE station_id = ?1 AND status IN ('awaiting_counter', 'paid')
     ORDER BY created_at ASC LIMIT 60`,
  )
    .bind(claims.stationId)
    .all()
  return { ok: true, orders: await withItems(env, results ?? []) }
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

  // Se entretanto pagou no telemóvel, a venda já vem como paga e não se
  // cobra outra vez.
  await refreshPayment(env, [id])

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
  if (order.status === 'delivered') return { ok: true, order: (await withItems(env, [order]))[0], ja: true }
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
  // descontou nessa altura, e o índice único em `(order_id, product_id)` é a
  // rede que apanha o resto: dois toques no botão, duas tentativas do tablet.
  //
  // A saída escreve-se sempre, mesmo no armazém: é o registo de o que saiu
  // pela porta. O número só desce onde há um número contado a que descer.
  if (owes) {
    const lines = await orderLines(env, order)
    writes.push(
      ...stockOut(env, order.stationId, id, lines, `balcao:${claims.stationId}`, now, posto?.tracksStock !== 0),
    )
  }

  await env.DB.batch(writes)

  const fresh = await env.DB.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE id = ?1`)
    .bind(id)
    .first()
  return { ok: true, order: (await withItems(env, [fresh]))[0] }
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
      // Por produto, a partir das linhas do carrinho; uma venda de antes do
      // carrinho não tem linhas e conta pela própria venda.
      `SELECT o.station_id AS stationId,
              COALESCE(i.product_id, o.product_id) AS productId,
              SUM(COALESCE(i.quantity, o.quantity)) AS vendas,
              SUM(COALESCE(i.quantity * i.unit_cents, o.amount_cents)) AS totalCents
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
       WHERE o.paid_at BETWEEN ?1 AND ?2
       GROUP BY 1, 2 ORDER BY vendas DESC`,
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

/* ── Pagamento no tablet: MB WAY e cartão ────────────────────────────────────

   Duas maneiras de pagar no ecrã:

   - MB WAY pelo número. O cliente escreve o número no tablet, o pedido chega
     à app dele já com o valor, e ele confirma lá. Vai pela ifthenpay quando a
     chave dela está posta (`IFTHENPAY_MBWAY_KEY`), que cobra menos de metade
     da Stripe por pagamento; sem ela, pela Stripe, como sempre foi.
   - Cartão, Apple Pay e Google Pay, pela Stripe. O tablet mostra um QR que se
     lê com a câmara do telemóvel e abre a página de pagamento da Stripe. Não
     é o QR do MB WAY: a app MB WAY não o lê, e o ecrã diz isso por extenso.

   O tablet nunca fala com a Stripe nem com a ifthenpay, e as chaves nunca
   saem deste servidor.

   Três regras, todas pela mesma razão — o tablet e o endereço deste servidor
   são públicos:

   1. O valor sai do `PRICES` deste lado, nunca do pedido.
   2. «Pago» só se escreve depois de quem cobrou o confirmar a quem lhe
      pergunta com a nossa chave. Os avisos que mandam (`/api/pay/notify` da
      Stripe, `/api/pay/ifthenpay` da ifthenpay) só servem para nos fazer ir
      perguntar: não se acredita no que trazem dentro.
   3. Sem chaves postas, tudo isto responde «desligado» e o tablet manda ao
      balcão. Desligar é tirar a chave; não há nada a mudar no tablet.

   Teste ou a sério, na Stripe, decide-o a própria chave: `sk_test_…` é a
   sandbox (não sai dinheiro de lado nenhum), `sk_live_…` cobra.

   O `pay_id` de cada venda diz a quem perguntar: `pi_…` é um pedido MB WAY
   da Stripe, `cs_…` uma página de cartão da Stripe, e `ifthenpay:…` um pedido
   MB WAY da ifthenpay.
   ────────────────────────────────────────────────────────────────────────── */

const IFTHENPAY = 'ifthenpay:'

/** `a[b][c]=…`, que é como a API da Stripe recebe o corpo. */
function stripeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') stripeForm(item, `${key}[${i}]`, out)
        else out.append(`${key}[${i}]`, String(item))
      })
    }
    else if (typeof v === 'object') stripeForm(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

function stripe(env) {
  if (!env.STRIPE_SECRET_KEY) return null
  const call = async (method, path, body) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: body ? stripeForm(body).toString() : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // O erro da Stripe vai para o log do worker, não para o tablet: pode
      // trazer detalhes da conta que não são para um ecrã público.
      console.log('stripe', method, path, res.status, JSON.stringify(data?.error ?? data).slice(0, 500))
      const err = new Error(`stripe-${res.status}`)
      err.code = data?.error?.code
      err.status = res.status
      throw err
    }
    return data
  }
  return { call }
}

/**
 * A ifthenpay, só para o MB WAY.
 *
 * A chave (`XXX-000000`) é a «MB WAY Key» do backoffice da ifthenpay. Não é
 * uma palavra-passe como a da Stripe — também vai no endereço da pergunta do
 * estado —, mas é com ela que se cobra em nome da loja, por isso entra como
 * segredo e não no `wrangler.toml`.
 */
function ifthenpay(env) {
  const key = env.IFTHENPAY_MBWAY_KEY
  if (!key) return null
  const base = 'https://api.ifthenpay.com/spg/payment/mbway'
  const read = async (res, what) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.log('ifthenpay', what, res.status, JSON.stringify(data).slice(0, 500))
      throw new Error(`ifthenpay-${res.status}`)
    }
    return data
  }
  return {
    async request({ orderId, cents, phone, description }) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          mbWayKey: key,
          orderId,
          amount: (cents / 100).toFixed(2),
          mobileNumber: `351#${phone}`,
          description,
        }),
      })
      return read(res, 'pedido')
    },
    async status(requestId) {
      const url = `${base}/status?mbWayKey=${encodeURIComponent(key)}&requestId=${encodeURIComponent(requestId)}`
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      return read(res, 'estado')
    },
  }
}

/**
 * Os códigos de estado da ifthenpay, em três palavras.
 *
 * `000` é dinheiro entrado. `020` recusado, `101` expirou (o pedido vive
 * quatro minutos na app), `122` cancelado pelo cliente — dá para pedir outra
 * vez. Qualquer outro código é o cliente ainda a decidir: na pior das
 * hipóteses o relógio do ecrã acaba e manda ao balcão.
 */
function ifthenpayState(code) {
  if (code === '000') return 'paid'
  if (code === '020' || code === '101' || code === '122') return 'failed'
  return 'pending'
}

/**
 * O pagamento no tablet está ligado, e esta venda pode ser paga?
 *
 * O tablet pergunta antes de mostrar o ecrã de pagar: sem chave, ou com a
 * venda já fechada, o cliente vai direto para a ficha do balcão em vez de
 * escrever um número que não ia dar em nada. A resposta diz também que
 * maneiras de pagar há, e quem trata o MB WAY — o ecrã diz ao cliente para
 * onde vai o número dele.
 */
async function payReady(env, body) {
  const mbway = ifthenpay(env) ? 'ifthenpay' : stripe(env) ? 'stripe' : null
  const card = Boolean(stripe(env))
  if (!mbway && !card) return { erro: 'pagamento-desligado', status: 503 }
  const order = await env.DB.prepare(`SELECT id, status, product_id AS productId, quantity FROM orders WHERE id = ?1`)
    .bind(String(body?.orderId ?? ''))
    .first()
  if (!order) return { erro: 'nao-encontrado', status: 404 }
  if (order.status !== 'awaiting_counter') return { erro: 'estado', status: 409 }
  const lines = await orderLines(env, order)
  if (lines.some((l) => !PRICES[l.productId])) return { erro: 'sem-preco', status: 409 }
  return { ok: true, mbway, card }
}

/**
 * A venda que se vai pagar, se ainda estiver por pagar e tudo tiver preço.
 * `lines` leva o preço de um frasco de cada produto; `cents` é o total.
 */
async function payableOrder(env, id) {
  const order = await env.DB.prepare(
    `SELECT id, station_id AS stationId, product_id AS productId, ticket_code AS ticketCode, status,
            quantity
     FROM orders WHERE id = ?1`,
  )
    .bind(id)
    .first()
  if (!order) return { erro: 'nao-encontrado', status: 404 }
  if (order.status !== 'awaiting_counter') return { erro: 'estado', status: 409 }
  const lines = (await orderLines(env, order)).map((l) => ({ ...l, unit: PRICES[l.productId] }))
  if (lines.some((l) => !l.unit)) return { erro: 'sem-preco', status: 409 }
  const cents = lines.reduce((n, l) => n + l.unit * l.quantity, 0)
  return { order, lines, cents }
}

/**
 * Um pedido novo (o primeiro foi recusado, o número estava errado, ou o
 * cliente trocou de MB WAY para cartão) substitui o anterior.
 */
async function savePayId(env, orderId, payId, cents) {
  await env.DB.prepare(`UPDATE orders SET pay_id = ?2, amount_cents = ?3 WHERE id = ?1`)
    .bind(orderId, String(payId), cents)
    .run()
}

/**
 * Pagar pelo número de telemóvel: o pedido chega já à app MB WAY do cliente,
 * com o valor, e ele só tem de confirmar.
 *
 * O número vai para quem cobra e mais nenhum sítio: não se guarda na base. O
 * que se guarda é o id do pedido (`pay_id`), para o `payStatus` saber a quem
 * perguntar.
 */
async function payPhone(env, body) {
  const ifp = ifthenpay(env)
  const st = stripe(env)
  if (!ifp && !st) return { erro: 'pagamento-desligado', status: 503 }

  const phone = String(body?.phone ?? '').replace(/\D/g, '')
  // Telemóvel português: nove algarismos a começar por 9.
  if (!/^9\d{8}$/.test(phone)) return { erro: 'telemovel', status: 400 }

  const found = await payableOrder(env, String(body?.orderId ?? ''))
  if (found.erro) return found
  const { order, cents } = found

  if (ifp) {
    let res
    try {
      res = await ifp.request({
        // A ifthenpay aceita até 15 caracteres aqui. O código da ficha cabe, e
        // é o que a loja reconhece no backoffice dela.
        orderId: order.ticketCode,
        cents,
        phone,
        description: `TopBio ${order.ticketCode}`,
      })
    } catch {
      return { erro: 'pagamento', status: 502 }
    }
    if (res?.Status !== '000' || !res?.RequestId) {
      // Recusado logo à partida (número sem MB WAY, por exemplo).
      console.log('ifthenpay recusado', order.id, res?.Status ?? '', res?.Message ?? '')
      return { ok: true, state: 'failed' }
    }
    await savePayId(env, order.id, IFTHENPAY + res.RequestId, cents)
    return { ok: true, state: 'pending' }
  }

  let intent
  try {
    // Criar e confirmar de uma vez: é a confirmação que manda o pedido para a
    // app. O MB WAY não tem redirecionamento, por isso não há página nenhuma
    // pelo meio.
    intent = await st.call('POST', '/payment_intents', {
      amount: cents,
      currency: 'eur',
      // A Stripe já não aceita `payment_method_types`: os métodos ligam-se no
      // Dashboard. O MB WAY tem de estar ligado lá, senão isto é recusado.
      automatic_payment_methods: { enabled: 'true', allow_redirects: 'never' },
      payment_method_data: { type: 'mb_way', billing_details: { phone: `+351${phone}` } },
      confirm: 'true',
      description: `TopBio ${order.ticketCode}`,
      // É por aqui que o aviso da Stripe chega à venda (ver `payNotify`).
      metadata: { order_id: order.id, ticket: order.ticketCode, station: order.stationId },
    })
  } catch {
    return { erro: 'pagamento', status: 502 }
  }
  if (!intent?.id) return { erro: 'pagamento', status: 502 }

  await savePayId(env, order.id, intent.id, cents)

  // Há recusas que vêm logo na resposta (número sem MB WAY, por exemplo).
  if (intent.status === 'requires_payment_method') return { ok: true, state: 'failed' }
  return { ok: true, state: 'pending' }
}

/**
 * Pagar com cartão, Apple Pay ou Google Pay: uma página da Stripe, aberta no
 * telemóvel do cliente pelo QR que o tablet mostra.
 *
 * O cliente escreve o cartão no telemóvel dele, nunca no ecrã da loja. Quando
 * paga, a Stripe manda-o para o `/api/pay/feito`, que só diz «pode voltar ao
 * ecrã» — quem marca a venda é o `payStatus`, como no MB WAY.
 */
async function payCard(env, body, origin) {
  const st = stripe(env)
  if (!st) return { erro: 'pagamento-desligado', status: 503 }

  const found = await payableOrder(env, String(body?.orderId ?? ''))
  if (found.erro) return found
  const { order, lines, cents } = found

  const session = {
    mode: 'payment',
    // Uma linha por produto, com o nome: é o que o cliente confere no
    // telemóvel antes de pagar.
    line_items: lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: 'eur',
        unit_amount: l.unit,
        product_data: { name: NAMES[l.productId] ?? `TopBio ${order.ticketCode}` },
      },
    })),
    // Só cartão: o Apple Pay e o Google Pay vêm com ele, no telemóvel que os
    // tiver. Os métodos com pagamento diferido (referência Multibanco, por
    // exemplo) não servem a quem está de pé à frente do balcão.
    payment_method_types: ['card'],
    locale: 'pt',
    // O mínimo que a Stripe deixa. O ecrã desiste antes disto (`waitMs`).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${origin}/api/pay/feito`,
    cancel_url: `${origin}/api/pay/feito?cancelado=1`,
    // O mesmo `order_id` do MB WAY, para o aviso da Stripe chegar à venda.
    payment_intent_data: {
      description: `TopBio ${order.ticketCode}`,
      metadata: { order_id: order.id, ticket: order.ticketCode, station: order.stationId },
    },
  }

  let res
  try {
    res = await st.call('POST', '/checkout/sessions', session)
  } catch (e) {
    // A conta pode recusar a lista de métodos, como recusou no MB WAY. Aí
    // vai sem ela, e a página mostra os que estão ligados no Dashboard.
    if (e?.status !== 400) return { erro: 'pagamento', status: 502 }
    try {
      const { payment_method_types: _, ...semLista } = session
      res = await st.call('POST', '/checkout/sessions', semLista)
    } catch {
      return { erro: 'pagamento', status: 502 }
    }
  }
  if (!res?.id || !res?.url) return { erro: 'pagamento', status: 502 }

  await savePayId(env, order.id, res.id, cents)
  return { ok: true, url: res.url }
}

/**
 * Como se pagou um PaymentIntent da Stripe: `cartao` (Apple Pay e Google Pay
 * incluídos, que por baixo são cartão) ou `mbway`.
 */
function intentMethod(intent) {
  const type = intent?.payment_method?.type ?? intent?.payment_method_types?.[0]
  return type === 'mb_way' ? 'mbway' : 'cartao'
}

/**
 * O estado de um PaymentIntent, em três palavras.
 *
 * `succeeded` é dinheiro entrado. `requires_payment_method` é o MB WAY
 * recusado, cancelado na app ou deixado expirar — dá para pedir outra vez.
 * Tudo o resto (`requires_action`, `processing`) é o cliente ainda a decidir.
 */
function intentState(intent) {
  if (intent?.status === 'succeeded') return 'paid'
  if (intent?.status === 'requires_payment_method' || intent?.status === 'canceled') {
    // Para o log do worker: o porquê de uma recusa só aparece aqui.
    const e = intent?.last_payment_error
    console.log('stripe recusado', intent?.id, intent?.status, e?.code ?? '', e?.decline_code ?? '')
    return 'failed'
  }
  return 'pending'
}

/**
 * Perguntar a quem cobrou como está um pagamento: `{ state, method }`.
 *
 * Um erro de rede sobe daqui; quem chama decide o que fazer com ele.
 */
async function lookupPayment(env, payId) {
  if (payId.startsWith(IFTHENPAY)) {
    const ifp = ifthenpay(env)
    if (!ifp) return { state: 'pending' }
    const res = await ifp.status(payId.slice(IFTHENPAY.length))
    const state = ifthenpayState(String(res?.Status ?? ''))
    if (state === 'failed') console.log('ifthenpay recusado', payId, res?.Status, res?.Message ?? '')
    return { state, method: 'mbway' }
  }

  const st = stripe(env)
  if (!st) return { state: 'pending' }

  if (payId.startsWith('cs_')) {
    const s = await st.call(
      'GET',
      `/checkout/sessions/${encodeURIComponent(payId)}?expand[]=payment_intent.payment_method`,
    )
    if (s?.payment_status === 'paid') return { state: 'paid', method: intentMethod(s.payment_intent) }
    // Uma página expirada já não cobra; a da Stripe dura mais do que o ecrã.
    if (s?.status === 'expired') return { state: 'failed' }
    return { state: 'pending' }
  }

  const intent = await st.call(
    'GET',
    `/payment_intents/${encodeURIComponent(payId)}?expand[]=payment_method`,
  )
  return { state: intentState(intent), method: intentMethod(intent) }
}

/**
 * Já pagaram?
 *
 * Pergunta-se a quem cobrou e não à nossa base: a base só passa a «pago»
 * depois daqui. Um pagamento confirmado escreve-se uma vez, com o stock a
 * descer no mesmo `batch` — a mesma regra do balcão (ver `settle`).
 */
async function payStatus(env, body) {
  if (!ifthenpay(env) && !stripe(env)) return { erro: 'pagamento-desligado', status: 503 }

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

  let found
  try {
    found = await lookupPayment(env, order.payId)
  } catch {
    return { ok: true, state: 'pending' }
  }
  if (found.state === 'paid') await markPaid(env, order, found.method)
  // Recusado na app não fecha a venda: o ecrã avisa e deixa tentar outra vez.
  return { ok: true, state: found.state }
}

/**
 * O que sai do stock por uma venda: uma saída por produto, e o número da
 * prateleira a descer onde há um número contado.
 *
 * O índice único em `stock_moves (order_id, product_id)` impede a mesma linha
 * de sair duas vezes.
 */
function stockOut(env, stationId, orderId, lines, actor, now, counted) {
  const writes = []
  for (const l of lines) {
    writes.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO stock_moves
           (station_id, product_id, delta, reason, order_id, actor, at)
         VALUES (?1, ?2, ?6, 'venda', ?3, ?4, ?5)`,
      ).bind(stationId, l.productId, orderId, actor, now, -l.quantity),
    )
    if (counted) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO stock (station_id, product_id, qty, updated_at)
           VALUES (?1, ?2, ?4, ?3)
           ON CONFLICT(station_id, product_id)
           DO UPDATE SET qty = qty + ?4, updated_at = ?3`,
        ).bind(stationId, l.productId, now, -l.quantity),
      )
    }
  }
  return writes
}

async function markPaid(env, order, method = 'mbway') {
  const now = Date.now()
  const posto = await env.DB.prepare('SELECT tracks_stock AS tracksStock FROM stations WHERE id = ?1')
    .bind(order.stationId)
    .first()
  // O `WHERE status = 'awaiting_counter'` é o que impede descontar duas vezes
  // quando o aviso e a pergunta do tablet chegam ao mesmo tempo; o índice
  // único em `stock_moves.order_id` apanha o resto.
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', method = ?3, paid_at = ?2
     WHERE id = ?1 AND status = 'awaiting_counter'`,
  )
    .bind(order.id, now, method)
    .run()
  if (!res.meta?.changes) return

  const actor = String(order.payId ?? '').startsWith(IFTHENPAY) ? 'ifthenpay' : 'stripe'
  const row = await env.DB.prepare('SELECT quantity FROM orders WHERE id = ?1').bind(order.id).first()
  const lines = await orderLines(env, { ...order, quantity: row?.quantity })
  await env.DB.batch(stockOut(env, order.stationId, order.id, lines, actor, now, posto?.tracksStock !== 0))
}

/**
 * O aviso da Stripe de que um pagamento mudou (webhook).
 *
 * Não se acredita no que traz: tira-se dele só o id do PaymentIntent e
 * pergunta-se à Stripe por esse, com a nossa chave. A venda sai dos
 * `metadata` que a Stripe devolve, não dos do aviso. Assim não é preciso
 * verificar a assinatura — um aviso forjado só faz o servidor ir perguntar, e
 * a resposta vem da Stripe.
 *
 * Pergunta-se pelo pagamento do aviso, e não pelo último que a venda guardou:
 * quem pediu o MB WAY e depois passou para o cartão pode acabar por confirmar
 * o primeiro, e esse dinheiro também conta.
 *
 * Responde sempre 200: um erro aqui faria a Stripe insistir, e insistir não
 * muda a resposta.
 */
async function payNotify(env, body) {
  const intentId = String(body?.data?.object?.id ?? '')
  const st = stripe(env)
  if (!st || !intentId.startsWith('pi_')) return { ok: true }
  try {
    const intent = await st.call(
      'GET',
      `/payment_intents/${encodeURIComponent(intentId)}?expand[]=payment_method`,
    )
    const orderId = String(intent?.metadata?.order_id ?? '')
    if (orderId && intentState(intent) === 'paid') {
      const order = await env.DB.prepare(
        `SELECT id, station_id AS stationId, product_id AS productId, status, pay_id AS payId
         FROM orders WHERE id = ?1`,
      )
        .bind(orderId)
        .first()
      if (order && order.status === 'awaiting_counter') {
        await markPaid(env, { ...order, payId: intentId }, intentMethod(intent))
      }
    }
  } catch (e) {
    console.log('stripe notify', intentId, String(e))
  }
  return { ok: true }
}

/**
 * O aviso da ifthenpay de que um MB WAY foi pago (callback).
 *
 * Chega por GET, com o `requestId` no endereço. Como o da Stripe, não se
 * acredita nele: procura-se a venda que guardou esse pedido e pergunta-se à
 * ifthenpay pelo estado.
 *
 * Quem pediu o MB WAY e depois passou para o cartão já guardou outro
 * `pay_id`, e o pedido MB WAY continua vivo na app. Aí a venda procura-se
 * pelo código da ficha, que foi o `orderId` mandado à ifthenpay — mas só
 * se o valor do aviso for o da venda, e só depois de a ifthenpay confirmar
 * que esse pedido está pago.
 *
 * É opcional: sem ele, o tablet pergunta sozinho enquanto o ecrã de pagar
 * está aberto. Com ele, um pagamento confirmado depois de o ecrã desistir
 * ainda chega à venda. Liga-se pedindo à ifthenpay que chame
 * `…/api/pay/ifthenpay?requestId=[REQUEST_ID]` (ver o README do servidor).
 */
async function payIfthenpayNotify(env, url) {
  const q = url.searchParams
  const requestId = String(q.get('requestId') ?? q.get('tid') ?? '')
  if (!requestId || !ifthenpay(env)) return
  const cols = `id, station_id AS stationId, product_id AS productId, status, amount_cents AS amountCents`
  try {
    let order = await env.DB.prepare(`SELECT ${cols} FROM orders WHERE pay_id = ?1`)
      .bind(IFTHENPAY + requestId)
      .first()
    if (!order) {
      const ticket = String(q.get('orderId') ?? q.get('oid') ?? '')
      const cents = Math.round(Number(q.get('amount') ?? q.get('val') ?? NaN) * 100)
      if (!ticket || !Number.isFinite(cents)) return
      order = await env.DB.prepare(
        `SELECT ${cols} FROM orders
         WHERE ticket_code = ?1 AND status = 'awaiting_counter' AND amount_cents = ?2
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(ticket, cents)
        .first()
    }
    if (!order || order.status !== 'awaiting_counter') return
    const payId = IFTHENPAY + requestId
    const found = await lookupPayment(env, payId)
    if (found.state === 'paid') await markPaid(env, { ...order, payId }, found.method)
  } catch (e) {
    console.log('ifthenpay notify', requestId, String(e))
  }
}

/** A página para onde a Stripe manda o telemóvel do cliente no fim. */
function payDonePage(url) {
  const cancelado = url.searchParams.has('cancelado')
  const titulo = cancelado ? 'Pagamento cancelado' : 'Pagamento recebido'
  const texto = cancelado
    ? 'Não foi cobrado nada. Pode voltar ao ecrã da loja e escolher outra forma de pagar.'
    : 'Obrigado! Pode voltar ao ecrã da loja: o seu código de levantamento aparece lá.'
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>TopBio — ${titulo}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F1EA;color:#002E26;
font:18px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:1.6rem;margin:0 0 .5rem}p{max-width:30ch;margin:0 auto}</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

/**
 * Os dois caminhos do pagamento que chegam por GET: o aviso da ifthenpay e a
 * página do fim da Stripe. Nenhum vem de um browser da loja, por isso não
 * passam pelo travão da origem nem pela sessão (ver o `worker.js`).
 */
export const GET_PATHS = new Set(['/api/pay/ifthenpay', '/api/pay/feito'])

export async function handleGet(request, env, path, ip) {
  if (overApiLimit(ip)) return new Response('limite', { status: 429 })
  const url = new URL(request.url)
  if (path === '/api/pay/feito') return payDonePage(url)
  if (env.DB) await payIfthenpayNotify(env, url)
  // Sempre 200, pela mesma razão do aviso da Stripe.
  return new Response('ok')
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
     WHERE id = ?1 AND method IN ('mbway', 'cartao') AND pay_id IS NOT NULL
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
// sessão nenhuma, e a Stripe. Nenhum deles escreve «pago» por palavra de quem
// chama: ver o bloco do pagamento.
const ABERTAS = new Set([
  '/api/login',
  '/api/orders/create',
  '/api/pay/start',
  '/api/pay/phone',
  '/api/pay/card',
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
      out = await payReady(env, body)
      break
    case '/api/pay/phone':
      out = await payPhone(env, body)
      break
    case '/api/pay/card':
      out = await payCard(env, body, new URL(request.url).origin)
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
