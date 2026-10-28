/**
 * Os preços, do lado do servidor.
 *
 * O valor que se cobra pela Stripe ou pela ifthenpay sai daqui e não do
 * tablet. O tablet é código público num aparelho que qualquer pessoa toca: se
 * o preço viesse de lá, bastava uma venda forjada a 0,01 € para levar um
 * frasco pago a cêntimos.
 *
 * GERADO por `scripts/build-prices.ts` — não editar à mão. Mudar um preço é
 * mudar no catálogo e voltar a gerar; mexer só aqui deixa o ecrã a mostrar um
 * valor e o pagamento a cobrar outro.
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
  'top-woman-40': 3500,
  'oleo-de-coco': 2500,
  'feno-grego': 3000,
  'topbio-lip': 8000,
  'top-shape': 4500,
  'top-max': 6000,
  'top-shot': 4000,
  'top-hair': 3500,
}

/** O nome de cada produto, para a página de pagamento da Stripe. */
export const NAMES = {
  'maca-peruana': "Maca Peruana",
  'top-brain': "Top Brain",
  'topcalm': "Top Calm",
  'magnetop': "Magnetop",
  'imune': "Imune+",
  'vitamina-c': "Vitamina C",
  'vitamina-d3-k2': "Vitamina D3+Z+K2",
  'colageno-verisol': "Colagénio Verisol®",
  'acido-hialuronico': "Ácido Hialurónico",
  'articulacao': "Articulação+",
  'termogenico': "Top Termo",
  'vinagre-de-maca': "Vinagre de Maçã",
  'top-omega3': "Top Ómega 3",
  'topcoenzimaq10': "Top Coenzima Q10",
  'top-woman-40': "Top Woman 40+",
  'oleo-de-coco': "Óleo de Coco",
  'feno-grego': "Feno-Grego",
  'topbio-lip': "TopBio Lip",
  'top-shape': "Top Shape",
  'top-max': "Top Max",
  'top-shot': "Top Shot Matinal",
  'top-hair': "Top Hair",
}
