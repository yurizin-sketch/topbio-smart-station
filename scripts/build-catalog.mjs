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
 * O que está impresso no rótulo de cada frasco, lido das fotografias.
 *
 * É a única tabela deste ficheiro que não vem do tema nem da tabela de preços:
 * o número de cápsulas não existe em lado nenhum escrito, só no rótulo. Foi
 * lido de `public/products/<id>.webp` a 2026-09-18. A chave é o `id` e não o
 * `handle` justamente por isso: é o nome da fotografia que foi lida, e nos dois
 * `lip` o handle da Shopify não lhe corresponde.
 *
 * Por isso mesmo: quando um frasco mudar de rótulo, isto não se corrige
 * sozinho. Trocada a fotografia, vem-se aqui confirmar o número.
 *
 * `null` é «o rótulo não diz» — e fica-se por aí. Há frascos cuja fotografia só
 * mostra as cápsulas e esconde o resto do rótulo por trás da curva do vidro;
 * desses regista-se o que se vê e mais nada. Arredondar ou deduzir a partir do
 * peso seria inventar um número que a pessoa vai conferir na mão dela.
 */
const LABELS = {
  'acido-hialuronico': { capsules: 60, doses: null, mgPerCapsule: null, netWeight: null },
  articulacao: { capsules: 60, doses: null, mgPerCapsule: null, netWeight: null },
  'colageno-verisol': { capsules: 60, doses: 30, mgPerCapsule: 600, netWeight: '36 g' },
  'feno-grego': { capsules: 60, doses: 30, mgPerCapsule: 550, netWeight: '33 g' },
  imune: { capsules: 60, doses: null, mgPerCapsule: null, netWeight: null },
  'maca-peruana': { capsules: 60, doses: 30, mgPerCapsule: 500, netWeight: '36 g' },
  magnetop: { capsules: 60, doses: 30, mgPerCapsule: 600, netWeight: '36 g' },
  'oleo-de-coco': { capsules: 30, doses: 15, mgPerCapsule: 600, netWeight: '40,5 g' },
  termogenico: { capsules: 45, doses: 22, mgPerCapsule: 600, netWeight: '27 g' },
  'top-brain': { capsules: 60, doses: 30, mgPerCapsule: null, netWeight: '46,44 g' },
  'top-max': { capsules: 30, doses: null, mgPerCapsule: null, netWeight: null },
  'top-omega3': { capsules: 60, doses: 60, mgPerCapsule: 1418.75, netWeight: '85,13 g' },
  'top-shape': { capsules: 60, doses: 30, mgPerCapsule: null, netWeight: '33,9 g' },
  // Pó, não cápsulas: toma diária de 5 g, 150 g na embalagem.
  'top-shot': { capsules: null, doses: 30, mgPerCapsule: null, netWeight: '150 g' },
  'top-woman-40': { capsules: 60, doses: 30, mgPerCapsule: 550, netWeight: '33 g' },
  'topbio-lip': { capsules: 45, doses: 22, mgPerCapsule: 600, netWeight: '27 g' },
  'topbio-lip-mini': { capsules: 20, doses: 10, mgPerCapsule: 600, netWeight: '18 g' },
  topcalm: { capsules: 60, doses: 30, mgPerCapsule: 655, netWeight: '33 g' },
  topcoenzimaq10: { capsules: 60, doses: 60, mgPerCapsule: 470, netWeight: '28,2 g' },
  'vinagre-de-maca': { capsules: 60, doses: null, mgPerCapsule: null, netWeight: '36 g' },
  'vitamina-c': { capsules: 60, doses: null, mgPerCapsule: null, netWeight: '36 g' },
  'vitamina-d3-k2': { capsules: 60, doses: null, mgPerCapsule: 600, netWeight: '36 g' },
}

/**
 * Tabela de preços oficial, recebida a 2026-08-10.
 * Top Ómega 3 e Top Coenzima Q10 ficaram em falta nessa tabela; preço
 * confirmado a 2026-08-28 (30 € cada).
 *
 * `priceCents: 0` + `active: false` significa "ainda não tem preço": o produto
 * fica fora da estação em vez de aparecer com um número inventado. Nunca pôr um
 * preço de recheio aqui — é este o valor que se cobra ao balcão.
 *
 * `handle` é o nome do template (product.<handle>.json). `id` é o da estação, e
 * também o nome da imagem em public/products — quase sempre igual ao handle,
 * mas não nos dois `lip`, em que o handle da Shopify traz o número de cápsulas
 * atrás. Quem for buscar uma imagem ou um rótulo usa o `id`, nunca o handle.
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
    handle: 'top-shape',
    id: 'top-shape',
    name: 'Top Shape',
    goals: ['peso'],
    priceCents: 4500,
    copy: {
      description:
        'Morosil®, berberina, açafrão e cromo quelado, em 2 cápsulas por dia.',
      highlights: ['Morosil® 400 mg', 'Berberina 300 mg', 'Cromo quelado 200 mcg'],
      ingredients:
        'Morosil® (extrato de laranja Moro) · Berberina · Crocus sativus (açafrão) · Cromo quelado',
      usage: 'Dose diária recomendada: 2 cápsulas por dia.',
      detail: {
        about:
          'O Top Shape é um suplemento alimentar desenvolvido com ingredientes cuidadosamente selecionados, pensado para integrar uma alimentação equilibrada e um estilo de vida ativo. A sua fórmula combina Morosil® (Extrato de Laranja Moro), Berberina, Crocus sativus (Açafrão) e Cromo Quelado, reunindo ingredientes amplamente utilizados em suplementos alimentares destinados ao bem-estar metabólico. Foi desenvolvido para quem procura uma fórmula moderna, com ingredientes de elevada qualidade, para complementar uma rotina de alimentação equilibrada e hábitos de vida saudáveis.',
        forWhom: [],
        usage:
          'Dose diária recomendada: equivalente a 2 cápsulas por dia, ou conforme indicação do seu profissional de saúde.',
        nutrition:
          'Por dose diária de 2 cápsulas: Morosil® (extrato de laranja Moro) 400 mg, Berberina 300 mg, Crocus sativus (extrato de açafrão) 30 mg, Cromo quelado 200 mcg.',
        notes: [
          'Não exceder a dose diária recomendada.',
          'Os suplementos alimentares não devem ser utilizados como substitutos de um regime alimentar variado e equilibrado e de um estilo de vida saudável.',
          'Manter fora do alcance das crianças.',
          'Não recomendado durante a gravidez e amamentação, salvo indicação de um profissional de saúde.',
        ],
        ingredients: [
          {
            name: 'Morosil® (Extrato de Laranja Moro) – 400 mg',
            note: 'Extrato padronizado obtido da laranja vermelha Moro (Citrus sinensis), naturalmente rico em antocianinas e outros compostos bioativos característicos desta variedade.',
          },
          {
            name: 'Berberina – 300 mg',
            note: 'Composto de origem vegetal amplamente utilizado em suplementos alimentares.',
          },
          {
            name: 'Crocus sativus (Extrato de Açafrão) – 30 mg',
            note: 'Extrato obtido dos estigmas do açafrão (Crocus sativus L.), ingrediente de elevada qualidade utilizado em formulações nutricionais.',
          },
          {
            name: 'Cromo Quelado – 200 mcg',
            note: 'O cromo contribui para o metabolismo normal dos macronutrientes e para a manutenção de níveis normais de glicose no sangue.',
          },
        ],
        faq: [],
      },
    },
  },

  {
    handle: 'top-max',
    id: 'top-max',
    name: 'Top Max',
    goals: ['peso', 'energia'],
    priceCents: 6000,
    // Mesma formula do TopBio Lip, noutro tamanho de frasco: trinta capsulas em
    // vez de quarenta e cinco. Sendo o mesmo produto, a ficha e a mesma, e vale
    // mais ir busca-la ao tema do que manter duas copias a divergir com o tempo.
    copyFrom: 'topnew-lip',
  },

  {
    handle: 'top-shot',
    id: 'top-shot',
    name: 'Top Shot Matinal',
    goals: ['energia', 'imunidade'],
    priceCents: 4000,
    /*
     * O unico da gama que nao e em capsulas: e po, cinco gramas diluidos.
     *
     * A copy que a casa mandou traz frases que ficaram de fora, pela regra do
     * comentario la em cima: "promovem energia, foco, digestao equilibrada e
     * suporte imunologico", "acelerar o metabolismo, favorecer a saciedade e
     * estimular as defesas do organismo", "start energetico e digestivo",
     * "manter o metabolismo ativo", "potencializar o efeito termogenico e
     * vasodilatador". Nenhuma delas tem alegacao autorizada, e esta e a unica
     * ficha da estacao que a Claudia diz em voz alta a porta da loja.
     *
     * O que ficou e tudo o resto, que e o que a pessoa precisa de saber: o que
     * leva, quanto se dilui, em quanta agua, a que horas e quem deve comecar
     * por meia dose.
     */
    copy: {
      description: 'Suplemento em pó: 5 g diluídos em água ou sumo, uma vez por dia.',
      highlights: ['Em pó', '5 g por toma', '30 doses'],
      ingredients:
        'Gengibre · Cúrcuma · Maca peruana · Própolis · Vitamina C · Zinco · Inulina · Pimenta preta',
      usage: 'Diluir 5 g em água ou sumo.',
      detail: {
        about:
          'O Top Shot é o único da gama que não vem em cápsulas: é um pó, que se dilui em água ou sumo. Pode ser tomado em jejum, antes do treino, ou diluído ao longo do dia.',
        forWhom: [],
        usage:
          'Dose diária: 5 g diluídos em água ou sumo. Em dose única, com 100 a 200 ml de água: em jejum, ou a seguir ao pequeno-almoço em caso de sensibilidade gástrica. Ao longo do dia, com 1 litro de água: diluir os 5 g e beber entre a manhã e a tarde. Antes do treino, com 150 a 250 ml de água: cerca de 30 minutos antes do exercício.',
        nutrition: '',
        notes: [
          'Quem tem sensibilidade gástrica pode começar com meia dose, 2,5 g, durante 3 a 5 dias, para avaliar a adaptação do organismo.',
          'Evitar a toma à noite.',
          'Não exceder a dose diária recomendada.',
          'Os suplementos alimentares não devem ser utilizados como substitutos de um regime alimentar variado e equilibrado e de um estilo de vida saudável.',
          'Manter fora do alcance das crianças.',
        ],
        ingredients: [],
        faq: [],
      },
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

/**
 * Os itens de uma lista do site, um a um.
 *
 * O «para quem é» e os avisos vêm em `<ul><li>`. Passá-los pelo `clean` inteiro
 * dava um parágrafo só, com as frases todas coladas umas às outras — ilegível
 * no ecrã e impossível de dizer em voz alta. Separados, cada um é uma frase.
 *
 * Sem `<li>` nenhum devolve o texto todo como um único item: há campos que são
 * um parágrafo simples e não vale a pena perdê-los por isso.
 */
const listItems = (html) => {
  const raw = String(html ?? '')
  const items = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1]))
  const úteis = items.filter(Boolean)
  if (úteis.length) return úteis
  const solto = clean(raw)
  return solto ? [solto] : []
}

/** Uma lista em TypeScript, uma entrada por linha para o diff se ler. */
const tsList = (itens, indent) =>
  itens.length ? `[\n${itens.map((i) => `${indent}  ${i},`).join('\n')}\n${indent}]` : '[]'

/** O rótulo como literal TypeScript. `null` sai tal e qual, que é o que é. */
const packLiteral = (p) =>
  `{ capsules: ${p.capsules}, doses: ${p.doses}, mgPerCapsule: ${p.mgPerCapsule}, netWeight: ${
    p.netWeight === null ? 'null' : ts(p.netWeight)
  } }`

/** A ficha completa, já como literal TypeScript pronto a colar na linha. */
const detailLiteral = (d) => {
  const i = '      '
  return `{
${i}about: ${ts(d.about)},
${i}forWhom: ${tsList(d.forWhom.map(ts), i)},
${i}usage: ${ts(d.usage)},
${i}nutrition: ${ts(d.nutrition)},
${i}notes: ${tsList(d.notes.map(ts), i)},
${i}ingredients: ${tsList(
    d.ingredients.map((x) => `{ name: ${ts(x.name)}, note: ${ts(x.note)} }`),
    i,
  )},
${i}faq: ${tsList(
    d.faq.map((x) => `{ question: ${ts(x.question)}, answer: ${ts(x.answer)} }`),
    i,
  )},
    }`
}

/** A copy revista que vive no tema. `null` se o produto ainda lá não estiver. */
const templateCopy = (handle) => {
  const file = join(TEMPLATES, `product.${handle}.json`)
  if (!existsSync(file)) return null

  const json = JSON.parse(readFileSync(file, 'utf8'))
  const section = (type) => Object.values(json.sections).find((s) => s.type === type)
  const hero = section('tne-product-hero')?.settings ?? {}

  const ingredientes = Object.values(section('tne-product-ingredientes')?.blocks ?? {})
    .map((b) => ({ name: clean(b.settings?.title), note: clean(b.settings?.description) }))
    .filter((i) => i.name)

  const ingredientNames = ingredientes.map((i) => i.name)

  const faq = Object.values(section('tne-product-faq')?.blocks ?? {})
    .map((b) => ({ question: clean(b.settings?.question), answer: clean(b.settings?.answer) }))
    .filter((f) => f.question && f.answer)

  return {
    description: firstSentence(hero.subtitle, 170),
    usage: firstSentence(hero.desc_como_tomar, 190),
    ingredients: ingredientNames.length
      ? ingredientNames.join(' · ')
      : firstSentence(hero.desc_nutricional, 170),
    highlights: [hero.benefit_1, hero.benefit_2, hero.benefit_3].filter(Boolean).map(clean),

    /**
     * E agora o mesmo, mas inteiro.
     *
     * Em cima corta-se tudo à primeira frase, porque é o que cabe no ecrã de um
     * tablet. Aqui não se corta nada: é o que a Cláudia diz em voz alta e é o
     * que ela tem para responder a quem pergunta. Só não vem daqui o preço nem
     * as imagens — o preço é da tabela da loja e as imagens já as temos.
     */
    detail: {
      about: clean(hero.desc_descricao) || clean(hero.subtitle),
      forWhom: listItems(hero.desc_para_quem),
      usage: clean(hero.desc_como_tomar),
      nutrition: clean(hero.desc_nutricional),
      notes: listItems(hero.desc_observacoes),
      ingredients: ingredientes,
      faq,
    },
  }
}

const rows = []
const problems = []

for (const p of PRODUCTS) {
  // A copy inline ganha ao template de propósito: é ela que está mais fresca
  // enquanto o site não acompanha.
  const copy = p.copy ?? templateCopy(p.copyFrom ?? p.handle)

  /*
   * Ficha emprestada: tira-se-lhe o que só vale para o frasco de origem.
   *
   * Dois produtos podem ser a mesma fórmula em frascos de tamanhos diferentes,
   * e aí a ficha serve-lhes aos dois — menos a pergunta de quanto tempo dura a
   * embalagem, que depende de quantas cápsulas lá vêm. Deixá-la passar punha a
   * Cláudia a prometer um mês num frasco que dá metade. Fica sem resposta a
   * essa, que é menos do que ter uma errada.
   */
  if (p.copyFrom && copy?.detail) {
    copy.detail = {
      ...copy.detail,
      faq: copy.detail.faq.filter((f) => !/quanto tempo/i.test(f.question)),
    }

    /*
     * E troca-se-lhe o nome. O texto do site fala do produto pelo nome, e a
     * Cláudia anunciava «Top Max» para logo a seguir dizer «o TopBio LIP é um
     * suplemento...» — à porta da loja isso não é uma subtileza, é outra caixa.
     */
    const origem = PRODUCTS.find((o) => o.handle === p.copyFrom)
    if (!origem) problems.push(`${p.handle}: copyFrom aponta a ${p.copyFrom}, que não existe`)
    else if (/[^\w\sÀ-ÿ]/.test(origem.name)) {
      // A troca é uma expressão regular feita do nome, e um nome com pontuação
      // faria dela outra coisa. Nunca aconteceu; se acontecer, avisa em vez de
      // trocar à toa.
      problems.push(`${p.handle}: nome de origem «${origem.name}» tem pontuação, troca por fazer`)
    } else {
      const nome = new RegExp(origem.name, 'gi')
      const trocar = (t) => t.replace(nome, p.name)
      const d = copy.detail
      copy.detail = {
        ...d,
        about: trocar(d.about),
        forWhom: d.forWhom.map(trocar),
        usage: trocar(d.usage),
        nutrition: trocar(d.nutrition),
        notes: d.notes.map(trocar),
        ingredients: d.ingredients.map((i) => ({ name: trocar(i.name), note: trocar(i.note) })),
        faq: d.faq.map((f) => ({ question: trocar(f.question), answer: trocar(f.answer) })),
      }
      copy.description = trocar(copy.description)
    }
  }
  if (!copy) {
    problems.push(`template em falta: ${p.handle}`)
    continue
  }
  const { description, usage, ingredients, highlights, detail } = copy

  // Produto novo entra aqui sem rótulo lido. Avisa-se, porque «quantas cápsulas
  // traz?» é a pergunta que mais se ouve e a Cláudia fica sem a saber.
  const label = LABELS[p.id] ?? null
  if (!label) problems.push(`${p.handle}: rótulo por ler (ver a foto em public/products)`)

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
    active: ${p.active !== false},${label ? `
    pack: ${packLiteral(label)},` : ''}${detail ? `
    detail: ${detailLiteral(detail)},` : ''}
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
