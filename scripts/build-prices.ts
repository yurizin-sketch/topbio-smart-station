/**
 * Gera o `server/prices.js` a partir do catálogo do tablet.
 *
 *   npx tsx scripts/build-prices.ts
 *
 * Corre-se depois do `build-catalog.mjs`, sempre que um preço mudar: o
 * servidor cobra pela tabela dele, e uma tabela esquecida cobra o preço velho.
 */
import fs from 'node:fs'
import { catalogSeed } from '../src/data/catalog.seed'

const linhas = catalogSeed
  .filter((p) => p.active && p.priceCents > 0)
  .map((p) => `  '${p.id}': ${p.priceCents},`)
  .join('\n')

const out = `/**
 * Os preços, do lado do servidor.
 *
 * O valor que se cobra na Easypay sai daqui e não do tablet. O tablet é código
 * público num aparelho que qualquer pessoa toca: se o preço viesse de lá,
 * bastava uma venda forjada a 0,01 € para levar um frasco pago a cêntimos.
 *
 * GERADO por \`scripts/build-prices.ts\` — não editar à mão. Mudar um preço é
 * mudar no catálogo e voltar a gerar; mexer só aqui deixa o ecrã a mostrar um
 * valor e a Easypay a cobrar outro.
 */
export const PRICES = {
${linhas}
}
`

fs.writeFileSync(new URL('../server/prices.js', import.meta.url), out)
console.log(`server/prices.js: ${catalogSeed.filter((p) => p.active && p.priceCents > 0).length} preços`)
