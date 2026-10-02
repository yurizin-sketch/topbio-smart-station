-- Pagamento no tablet (MB WAY pela Easypay) e dados da fatura.
--
-- Só para a base que já existia antes disto. Uma base nova sai do
-- `schema.sql` com estas colunas lá dentro, e correr isto nela dá erro de
-- coluna repetida — que não estraga nada.
--
--   npx wrangler d1 execute topbio --remote --file=migrations/0002_pagamento.sql

ALTER TABLE orders ADD COLUMN nif TEXT;
ALTER TABLE orders ADD COLUMN invoice_name TEXT;
ALTER TABLE orders ADD COLUMN invoice_email TEXT;
ALTER TABLE orders ADD COLUMN pay_id TEXT;
ALTER TABLE orders ADD COLUMN pay_url TEXT;
