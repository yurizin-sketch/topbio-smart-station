-- ═══════════════════════════════════════════════════════════════════════════
-- A base de dados da TopBio, no Cloudflare D1
--
-- Correr uma vez, quando a base é criada, e outra vez sempre que este
-- ficheiro mudar. Tudo aqui é `IF NOT EXISTS`, portanto correr duas vezes
-- não parte nada.
--
--   npx wrangler d1 execute topbio --remote --file=server/schema.sql
--
-- Não guarda nada sobre o cliente. Não há nome, telefone, email nem cartão:
-- um pedido é um código, um produto e um valor. Isso é de propósito — o que
-- não se guarda não se perde nem se pede a ninguém para apagar.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Os postos ──────────────────────────────────────────────────────────────
--
-- Uma linha por tablet na rua. Hoje há um; o dia em que houver três, é aqui
-- que se distinguem, e é por isto que o `station_id` anda em todo o lado.
--
-- O PIN do balcão vive aqui em resumo (hash), e não no código. O que estava
-- em `src/config.ts` ia para o repositório público — servia para trancar uma
-- gaveta que já está dentro da loja, não serve para trancar contas.
CREATE TABLE IF NOT EXISTS stations (
  id            TEXT PRIMARY KEY,           -- 'loja-lisboa', 'academia-benfica'
  name          TEXT NOT NULL,              -- como aparece na matriz
  counter_pin   TEXT NOT NULL,              -- sha-256 do PIN do balcão
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);


-- ── Os pedidos ─────────────────────────────────────────────────────────────
--
-- Espelho do que o quiosque cria. O tablet continua a guardar a sua própria
-- cópia: com a internet em baixo tem de conseguir vender à mesma, e um código
-- escrito num papel vale tanto como um código guardado num servidor.
--
-- O `id` vem do tablet (uuid) e é a chave. Assim, se a ligação falhar a meio
-- e o tablet repetir o envio, entra no mesmo sítio em vez de criar um pedido
-- gémeo — ver o `ON CONFLICT` no `api.js`.
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  station_id    TEXT NOT NULL,
  ticket_code   TEXT NOT NULL,              -- TB-XXXX, o que o cliente mostra
  product_id    TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  status        TEXT NOT NULL,              -- awaiting_counter|paid|delivered|cancelled|expired
  method        TEXT,                       -- dinheiro|mbway|cartao — null até alguém receber
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  paid_at       INTEGER,
  closed_at     INTEGER
);

-- Procurar pelo código é o que o balcão faz o dia todo.
CREATE INDEX IF NOT EXISTS orders_by_code ON orders (ticket_code);
-- E a matriz pergunta sempre «neste posto, entre estas duas datas».
CREATE INDEX IF NOT EXISTS orders_by_station ON orders (station_id, created_at);


-- ── O stock, por posto ─────────────────────────────────────────────────────
--
-- Quantos há de cada produto em cada quiosque. Um produto sem linha aqui
-- conta como zero — não como «infinito».
CREATE TABLE IF NOT EXISTS stock (
  station_id    TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (station_id, product_id)
);


-- ── O porquê de cada mexida no stock ───────────────────────────────────────
--
-- Isto é o que faz a diferença entre um número e um número em que se confia.
-- Um stock que só guarda a quantidade actual, no dia em que não bate com a
-- prateleira, não tem como explicar-se — e a partir daí ninguém olha para ele.
-- Aqui fica escrito o que entrou, o que saiu, porquê e por ordem de quem.
--
--   venda      −1, escrito pelo balcão ao receber o dinheiro
--   entrada    +n, mercadoria que chegou ao posto
--   contagem   ajuste depois de contar a prateleira à mão
--   devolucao  +1, o cliente devolveu
--   correcao   engano de dedo
CREATE TABLE IF NOT EXISTS stock_moves (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id    TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  delta         INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  order_id      TEXT,                       -- preenchido quando reason='venda'
  note          TEXT,
  actor         TEXT NOT NULL,              -- 'balcao:loja-lisboa' | 'matriz'
  at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS moves_by_station ON stock_moves (station_id, at);

-- Uma venda desconta uma vez e só uma. Se o balcão carregar duas vezes no
-- botão, ou a resposta se perder e o tablet repetir, esta regra é que impede
-- o stock de descer a dobrar — o segundo `INSERT` bate contra ela e o
-- `api.js` segue em frente sem descontar de novo.
CREATE UNIQUE INDEX IF NOT EXISTS moves_one_per_sale
  ON stock_moves (order_id) WHERE order_id IS NOT NULL;
