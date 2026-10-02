/**
 * Os preços, do lado do servidor.
 *
 * O valor que se cobra na Easypay sai daqui e não do tablet. O tablet é código
 * público num aparelho que qualquer pessoa toca: se o preço viesse de lá,
 * bastava uma venda forjada a 0,01 € para levar um frasco pago a cêntimos.
 *
 * GERADO por `scripts/build-prices.ts` — não editar à mão. Mudar um preço é
 * mudar no catálogo e voltar a gerar; mexer só aqui deixa o ecrã a mostrar um
 * valor e a Easypay a cobrar outro.
 */
export const PRICES = {
  'maca-peruana': 3000,
  'top-brain': 3000,
  'topcalm': 3000,
  'magnetop': 3000,
  'imune': 3000,
  'vitamina-c': 3000,
  'vitamina-d3-k2': 3000,
  'colageno-verisol': 3000,
  'acido-hialuronico': 3000,
  'articulacao': 3000,
  'termogenico': 8000,
  'vinagre-de-maca': 3000,
  'top-omega3': 3000,
  'topcoenzimaq10': 3000,
  'top-woman-40': 4000,
  'oleo-de-coco': 2500,
  'feno-grego': 3000,
  'topbio-lip': 8000,
  'topbio-lip-mini': 4000,
  'top-shape': 4500,
  'top-max': 6000,
  'top-shot': 4000,
}
