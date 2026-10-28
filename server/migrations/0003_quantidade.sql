-- Mais do que um frasco na mesma venda do tablet.
--
-- O `amount_cents` continua a ser o total da venda; isto diz quantos frascos
-- saem, que é o que o balcão entrega e o que o stock desconta.
--
-- Corre-se uma vez, ANTES de publicar o worker que já usa a coluna:
--
--   npx wrangler d1 execute topbio --remote --file=migrations/0003_quantidade.sql

ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
