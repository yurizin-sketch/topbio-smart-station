/**
 * Gera src/data/catalog.seed.ts a partir dos templates de produto do tema
 * Shopify institucional.
 *
 * Porquê gerar em vez de escrever à mão: a copy dos produtos já foi revista
 * (Reg. (UE) 432/2012 — alegações de saúde) e vive no tema. Duplicá-la à mão
 * garantia que, mais cedo ou mais tarde, a estação diria uma coisa e o site
 * diria outra. Aqui há uma única fonte de verdade.
 *
 * O que NÃO vem do tema, e por isso está nesta tabela:
 *  · nome comercial  — o título vive no produto Shopify, não no template;
 *  · preço           — idem; abaixo estão os da tabela oficial;
 *  · objetivo        — taxonomia própria da estação;
 *
 * Produto que ainda não tem página no site leva a copy em `copy:` aqui mesmo.
 * É a excepção, não a regra: quando o template existir, apaga-se o `copy` e
 * volta a haver uma só fonte de verdade.
 *
 * Correr com:  node scripts/build-catalog.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATES = resolve(
  here,
  '..',
  '..',
  'topneweuropa-institucional',
  'dawn-topneweuropa',
  'templates',
)
const OUT = resolve(here, '..', 'src', 'data', 'catalog.seed.ts')

/**
 * Tabela de preços oficial, recebida a 2026-08-10.
 * Top Ómega 3 e Top Coenzima Q10 ficaram em falta nessa tabela; preço
 * confirmado a 2026-08-28 (30 € cada).
 *
 * `priceCents: 0` + `active: false` significa "ainda não tem preço": o produto
 * fica fora da estação em vez de aparecer com um número inventado. Nunca pôr um
 * preço de recheio aqui — é este o valor que se cobra ao balcão.
 *
 * `handle` é o nome do template (product.<handle>.json) e também o id da
 * imagem em public/products.
 */
const PRODUCTS = [
  { handle: 'maca-peruana', id: 'maca-peruana', name: 'Maca Peruana', goals: ['energia', 'performance'], priceCents: 3000 },
  { handle: 'top-brain', id: 'top-brain', name: 'Top Brain', goals: ['foco', 'energia'], priceCents: 3000 },
  { handle: 'topcalm', id: 'topcalm', name: 'Top Calm', goals: ['sono'], priceCents: 3000 },
  { handle: 'magnetop', id: 'magnetop', name: 'Magnetop', goals: ['energia', 'sono', 'performance'], priceCents: 3000 },
  { handle: 'imune', id: 'imune', name: 'Imune+', goals: ['imunidade'], priceCents: 3000 },
  { handle: 'vitamina-c', id: 'vitamina-c', name: 'Vitamina C', goals: ['imunidade', 'beleza'], priceCents: 3000 },
  { handle: 'vitamina-d3-k2', id: 'vitamina-d3-k2', name: 'Vitamina D3 + K2', goals: ['imunidade', 'mobilidade'], priceCents: 3000 },
  { handle: 'colageno-verisol', id: 'colageno-verisol', name: 'Colagénio Verisol®', goals: ['beleza'], priceCents: 3000 },
  { handle: 'acido-hialuronico', id: 'acido-hialuronico', name: 'Ácido Hialurónico', goals: ['beleza'], priceCents: 3000 },
  { handle: 'articulacao', id: 'articulacao', name: 'Articulação+', goals: ['mobilidade', 'performance'], priceCents: 3000 },
  { handle: 'termogenico', id: 'termogenico', name: 'Top Termo', goals: ['peso', 'performance'], priceCents: 8000 },
  { handle: 'vinagre-de-maca', id: 'vinagre-de-maca', name: 'Vinagre de Maçã', goals: ['peso'], priceCents: 3000 },
  { handle: 'top-omega3', id: 'top-omega3', name: 'Top Ómega 3', goals: ['foco', 'beleza'], priceCents: 3000 },
  { handle: 'topcoenzimaq10', id: 'topcoenzimaq10', name: 'Top Coenzima Q10', goals: ['energia'], priceCents: 3000 },
  { handle: 'top-woman-40', id: 'top-woman-40', name: 'Top Woman 40+', goals: ['sono', 'energia'], priceCents: 4000 },
  { handle: 'oleo-de-coco', id: 'oleo-de-coco', name: 'Óleo de Coco', goals: ['peso', 'energia'], priceCents: 2500 },
  { handle: 'feno-grego', id: 'feno-grego', name: 'Feno-Grego', goals: ['energia', 'performance'], priceCents: 3000 },
  { handle: 'topnew-lip', id: 'topbio-lip', name: 'TopBio Lip', goals: ['peso'], priceCents: 8000 },
  { handle: 'topnew-lip-mini-20-capsulas', id: 'topbio-lip-mini', name: 'TopBio Lip Mini', goals: ['peso'], priceCents: 4000 },

  // Ainda sem página no site: a copy vem daqui até o template existir.
  //
  // Os destaques são só o que o Reg. (CE) 1924/2006 deixa dizer. O crómio tem
  // alegações autorizadas e ambas as fórmulas o trazem acima do VRN, por isso
  // essas ficam. O resto da copy comercial (emagrecimento, colesterol,
  // anti-inflamatório, libido) não tem alegação autorizada em suplementos e
  // não entra na estação — o ecrã está à porta da loja, à vista de qualquer
  // fiscalização.
  {
    handle: 'top-shape', id: 'top-shape', name: 'Top Shape', goals: ['peso'],
    priceCents: 4500,
    copy: {
      description: 'Fórmula com Morosil® (extrato de laranja Moro), berberina, açafrão e cromo quelado, em 2 cápsulas por dia.',
      highlights: ['Metabolismo normal dos macronutrientes', 'Glicemia normal', '2 cápsulas por dia'],
      ingredients: 'Morosil® (extrato de laranja Moro) 400 mg · Berberina 300 mg · Crocus sativus (açafrão) 30 mg · Cromo quelado 200 mcg',
      usage: 'Dose diária recomendada: 2 cápsulas por dia, ou conforme indicação do seu profissional de saúde. Não exceder a dose diária recomendada.',
    },
  },
  {
    handle: 'top-max', id: 'top-max', name: 'Top Max', goals: ['peso', 'energia'],
    priceCents: 6000,
    copy: {
      description: 'Fórmula com clorela, espirulina, extrato de rizoma de curcuma, psyllium e crómio, em 2 cápsulas por dia.',
      highlights: ['Metabolismo normal dos macronutrientes', 'Glicemia normal', '2 cápsulas por dia'],
      ingredients: 'Clorela 270 mg · Espirulina 200 mg · Extrato de rizoma de Curcuma 200 mg · Psyllium 250 mg · Crómio 31 µg',
      usage: 'Nos primeiros 5 dias, 1 cápsula após o pequeno-almoço. A partir do 6.º dia, 1 após o pequeno-almoço e 1 após o almoço. Beba água ao longo do dia.',
    },
  },
  {
    handle: 'top-shot', id: 'top-shot', name: 'Top Shot Matinal', goals: ['energia', 'imunidade'],
    priceCents: 4500,
    copy: {
      description: 'Pó solúvel com inulina, gengibre, curcuma, maca peruana, zinco, própolis e flavonoides. Uma colher de chá por dia, de manhã.',
      // Sem os miligramas de zinco por dose não se pode afirmar as alegações
      // autorizadas do zinco (exigem ≥ 15% do VRN). Assim que a ficha técnica
      // der o valor, entram aqui «Sistema imunitário normal» e «Cabelo, pele e
      // unhas normais» — até lá, só o que é verificável.
      highlights: ['Pó solúvel', '5 g por dose', '7 ingredientes'],
      ingredients: 'Inulina · Gengibre · Curcuma · Maca peruana · Zinco · Própolis · Flavonoides',
      usage: 'Dilua 1 colher de chá (5 g) em 100 ml de água ou sumo. Tome de manhã, em jejum, e aguarde 15 a 30 minutos antes de comer.',
    },
  },
]

const clean = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    // Tirar as tags deixa espaços encostados à pontuação («por dia , de manhã»).
    .replace(/\s+([,.;:!?%)»])/g, '$1')
    .replace(/([(«])\s+/g, '$1')
    .trim()

/** Primeira frase útil, sem cortar uma palavra a meio. */
const firstSentence = (text, max) => {
  const t = clean(text)
  const dot = t.indexOf('. ')
  const cut = dot > 40 && dot < max ? dot + 1 : -1
  if (cut > 0) return t.slice(0, cut)
  if (t.length <= max) return t
  const space = t.lastIndexOf(' ', max)
  return t.slice(0, space > 0 ? space : max).replace(/[,;:]$/, '') + '…'
}

const ts = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"

/** A copy revista que vive no tema. `null` se o produto ainda lá não estiver. */
const templateCopy = (handle) => {
  const file = join(TEMPLATES, `product.${handle}.json`)
  if (!existsSync(file)) return null

  const json = JSON.parse(readFileSync(file, 'utf8'))
  const section = (type) => Object.values(json.sections).find((s) => s.type === type)
  const hero = section('tne-product-hero')?.settings ?? {}

  const ingredientNames = Object.values(section('tne-product-ingredientes')?.blocks ?? {})
    .map((b) => b.settings?.title)
    .filter(Boolean)

  return {
    description: firstSentence(hero.subtitle, 170),
    usage: firstSentence(hero.desc_como_tomar, 190),
    ingredients: ingredientNames.length
      ? ingredientNames.join(' · ')
      : firstSentence(hero.desc_nutricional, 170),
    highlights: [hero.benefit_1, hero.benefit_2, hero.benefit_3].filter(Boolean).map(clean),
  }
}

const rows = []
const problems = []

for (const p of PRODUCTS) {
  // A copy inline ganha ao template de propósito: é ela que está mais fresca
  // enquanto o site não acompanha.
  const copy = p.copy ?? templateCopy(p.handle)
  if (!copy) {
    problems.push(`template em falta: ${p.handle}`)
    continue
  }
  const { description, usage, ingredients, highlights } = copy

  if (!description) problems.push(`${p.handle}: sem descrição`)
  if (!usage) problems.push(`${p.handle}: sem modo de uso`)
  if (!ingredients) problems.push(`${p.handle}: sem composição`)

  rows.push(`  {
    id: ${ts(p.id)},
    name: ${ts(p.name)},
    priceCents: ${p.priceCents},
    inStore: true,
    image: ${ts(`/products/${p.id}.webp`)},
    description: ${ts(description)},
    highlights: [${highlights.map(ts).join(', ')}],
    ingredients: ${ts(ingredients)},
    usage: ${ts(usage)},
    goals: [${p.goals.map(ts).join(', ')}],
    active: ${p.active !== false},
  },`)
}

const header = `import type { Product } from '../types'

/**
 * FICHEIRO GERADO — não editar à mão.
 *
 * Fonte: dawn-topneweuropa/templates/product.*.json (copy já revista), mais a
 * copy inline do gerador para os produtos que ainda não têm página no site.
 * Regenerar com:  node scripts/build-catalog.mjs
 *
 * Preços: tabela oficial de 2026-08-10, mais Top Ómega 3 e Top Coenzima Q10
 * confirmados a 2026-08-28. \`priceCents: 0\` com \`active: false\`
 * é um produto à espera de preço — fica fora da estação em vez de aparecer
 * com um número inventado, porque é este o valor que se cobra ao balcão.
 *
 * \`inStore\` é sempre true: a estação é um tablet dentro da loja e tudo o que
 * está aqui se levanta ao balcão. Quando faltar mesmo stock de um produto,
 * põe-se a false — é o único sinal de indisponível que existe.
 */
export const catalogSeed: Product[] = [
`

writeFileSync(OUT, header + rows.join('\n') + '\n]\n', 'utf8')

console.log(`${rows.length} produtos escritos em src/data/catalog.seed.ts`)
if (problems.length) {
  console.log(`\nAvisos (${problems.length}):`)
  for (const p of problems) console.log('  ' + p)
}
