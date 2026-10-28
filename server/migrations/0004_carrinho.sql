-- O carrinho: produtos diferentes na mesma venda do tablet.
--
-- Cada venda passa a ter as suas linhas aqui. As vendas de antes não têm
-- linhas e continuam a valer pelo `product_id` e `quantity` da própria venda.
--
-- E o stock deixa de aceitar uma saída por venda para aceitar uma por produto
-- da venda: uma venda de Maca e Top Hair desconta os dois.
--
-- Corre-se uma vez, ANTES de publicar o worker que já usa o carrinho:
--
--   npx wrangler d1 execute topbio --remote --file=migrations/0004_carrinho.sql

CREATE TABLE IF NOT EXISTS order_items (
  order_id    TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  unit_cents  INTEGER NOT NULL,           -- preço de um frasco no momento da venda
  PRIMARY KEY (order_id, product_id)
);

DROP INDEX IF EXISTS moves_one_per_sale;
CREATE UNIQUE INDEX IF NOT EXISTS moves_one_per_sale_line
  ON stock_moves (order_id, product_id) WHERE order_id IS NOT NULL;
