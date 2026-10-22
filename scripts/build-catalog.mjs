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
  // Rótulo novo (fórmula «Plus»), lido do rótulo de impressão a 2026-10-21.
  'acido-hialuronico': { capsules: 60, doses: 30, mgPerCapsule: 530, netWeight: '31,8 g' },
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
  // Lido do rótulo de impressão a 2026-10-21.
  'top-hair': { capsules: 60, doses: 30, mgPerCapsule: 500, netWeight: '30 g' },
  topcoenzimaq10: { capsules: 60, doses: 60, mgPerCapsule: 470, netWeight: '28,2 g' },
  'vinagre-de-maca': { capsules: 60, doses: null, mgPerCapsule: null, netWeight: '36 g' },
  'vitamina-c': { capsules: 60, doses: null, mgPerCapsule: null, netWeight: '36 g' },
  // Rótulo novo, lido do PDF de impressão a 2026-10-21.
  'vitamina-d3-k2': { capsules: 60, doses: 30, mgPerCapsule: 500, netWeight: '30 g' },
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
 * `active: false` com preço é outra coisa: deixou de se vender. A linha fica
 * para o nome continuar a existir — o balcão e a matriz lêem esta lista toda,
 * sem filtro, para dar nome ao que já foi vendido. Apagar a linha não tira
 * mais nada da estação do que isto tira, e leva o nome com ela.
 *
 * `handle` é o nome do template (product.<handle>.json). `id` é o da estação, e
 * também o nome da imagem em public/products — quase sempre igual ao handle,
 * mas não nos dois `lip`, em que o handle da Shopify traz o número de cápsulas
 * atrás. Quem for buscar uma imagem ou um rótulo usa o `id`, nunca o handle.
 */
const PRODUCTS = [
  { handle: 'maca-peruana', id: 'maca-peruana', name: 'Maca Peruana', goals: ['energia', 'performance'], priceCents: 3000 },
  { handle: 'top-brain', id: 'top-brain', name: 'Top Brain', goals: ['foco', 'energia', 'performance'], priceCents: 3000 },
  { handle: 'topcalm', id: 'topcalm', name: 'Top Calm', goals: ['sono'], priceCents: 3000 },
  { handle: 'magnetop', id: 'magnetop', name: 'Magnetop', goals: ['sono', 'longevidade'], priceCents: 3000 },
  { handle: 'imune', id: 'imune', name: 'Imune+', goals: ['imunidade'], priceCents: 3000 },
  { handle: 'vitamina-c', id: 'vitamina-c', name: 'Vitamina C', goals: ['imunidade', 'beleza'], priceCents: 3000 },
  { handle: 'vitamina-d3-k2', id: 'vitamina-d3-k2', name: 'Vitamina D3+Z+K2', goals: ['imunidade', 'mobilidade', 'longevidade'], priceCents: 3000 },
  { handle: 'colageno-verisol', id: 'colageno-verisol', name: 'Colagénio Verisol®', goals: ['beleza', 'mobilidade'], priceCents: 3000 },
  /*
   * Mudou de fórmula a 2026-10-21 (rótulo «Plus»): sai o colagénio, a colina e
   * o silício simples, entram astaxantina, coenzima Q10, bambu, biotina e
   * selénio. O template do site ainda descreve a fórmula antiga, por isso a
   * copy vem daqui até o site ser atualizado — e aí apaga-se este `copy`.
   *
   * Alegações só das que o Reg. (UE) 432/2012 autoriza, e só para os
   * nutrientes que o rótulo traz acima de 15% do VRN: vitamina C, zinco,
   * biotina e selénio. Ácido hialurónico, astaxantina, Q10 e bambu não têm
   * alegação autorizada; descrevem-se, não se promete nada por eles.
   */
  {
    handle: 'acido-hialuronico',
    id: 'acido-hialuronico',
    name: 'Ácido Hialurónico',
    goals: ['beleza'],
    priceCents: 3000,
    copy: {
      description:
        'Fórmula com 8 ingredientes, incluindo Vitamina C, Zinco, Biotina e Selénio para a manutenção de pele e cabelo normais.',
      highlights: ['Vitamina C, Zinco e Selénio', 'Biotina para pele e cabelo', 'Proteção celular'],
      ingredients:
        'Ácido Hialurónico · Vitamina C · Astaxantina · Coenzima Q10 · Bambu (sílica) · Zinco · Biotina · Selénio',
      usage: 'Tomar 2 cápsulas por dia, ou de acordo com o seu profissional de saúde.',
      detail: {
        about:
          'O Ácido Hialurónico Plus TopBioEuropa é um suplemento alimentar que combina ácido hialurónico com Vitamina C, Zinco, Biotina e Selénio, a que se juntam astaxantina, coenzima Q10 e extrato de bambu. A Vitamina C contribui para a formação normal de colagénio para o normal funcionamento da pele e para a proteção das células contra as oxidações indesejáveis. O Zinco contribui para a manutenção de pele, cabelo e unhas normais. A Biotina contribui para a manutenção de pele e cabelo normais. O Selénio contribui para a manutenção de cabelo e unhas normais e para a proteção das células contra as oxidações indesejáveis. Formulado para complementar uma alimentação variada e equilibrada.',
        forWhom: [
          'Adultos a partir dos 18 anos.',
          'Quem pretende complementar a alimentação com Vitamina C, Zinco, Biotina e Selénio, nutrientes que contribuem para a manutenção de pele e cabelo normais.',
          'Quem procura um suplemento multiingrediente com ácido hialurónico e antioxidantes naturais, como a astaxantina e a coenzima Q10.',
        ],
        usage:
          'Tomar 2 cápsulas por dia, ou de acordo com o seu profissional de saúde. Tomar com um copo de água.',
        nutrition:
          'Por toma diária de 2 cápsulas: Ácido hialurónico 240 mg, Vitamina C 160 mg (200% VRN), Extrato seco de Haematococcus pluvialis 160 mg (8 mg de astaxantina), Coenzima Q10 100 mg, Extrato seco de bambu 40 mg (30 mg de sílica), Zinco 20 mg (200% VRN), Biotina 200 µg (400% VRN), Selénio 110 µg (200% VRN).',
        notes: [
          'Suplemento alimentar destinado a adultos. Não deve ser consumido por grávidas, lactantes e crianças.',
          'Não utilizar se estiver a tomar medicação.',
          'Não exceder a toma diária recomendada.',
          'Os suplementos alimentares não substituem um regime alimentar variado e equilibrado nem um modo de vida saudável.',
          'Manter fora do alcance e da vista das crianças.',
          'Não utilizar em caso de hipersensibilidade ou alergia a qualquer um dos componentes.',
          'Conservar o produto bem fechado, na embalagem original, em local fresco, ao abrigo da luz, da humidade e do calor, a menos de 25 ºC.',
        ],
        ingredients: [
          { name: 'Ácido Hialurónico – 240 mg', note: 'Na forma de hialuronato de sódio. Substância naturalmente presente no organismo humano, em especial nos tecidos conjuntivos, olhos e fluido sinovial das articulações.' },
          { name: 'Vitamina C – 160 mg', note: 'A Vitamina C contribui para a formação normal de colagénio para o normal funcionamento da pele, para a proteção das células contra as oxidações indesejáveis e para a redução do cansaço e da fadiga.' },
          { name: 'Zinco – 20 mg', note: 'O Zinco contribui para a manutenção de pele, cabelo e unhas normais e para a proteção das células contra as oxidações indesejáveis.' },
          { name: 'Biotina – 200 µg', note: 'A Biotina contribui para a manutenção de pele normal e de cabelo normal.' },
          { name: 'Selénio – 110 µg', note: 'O Selénio contribui para a manutenção de cabelo normal e de unhas normais e para a proteção das células contra as oxidações indesejáveis.' },
          { name: 'Astaxantina & Coenzima Q10', note: 'Astaxantina — carotenoide de origem natural, obtido da microalga Haematococcus pluvialis. Coenzima Q10 (ubiquinona) — substância naturalmente presente nas células do organismo humano.' },
          { name: 'Bambu (Sílica)', note: 'Extrato seco de Bambusa arundinacea, naturalmente rico em ácido silícico.' },
        ],
        faq: [
          { question: 'Como devo tomar?', answer: 'Tome 2 cápsulas por dia com um copo de água, ou de acordo com a indicação do seu profissional de saúde.' },
          { question: 'Posso tomar durante a gravidez ou amamentação?', answer: 'Não. Este suplemento destina-se a adultos e não deve ser consumido por grávidas, lactantes nem crianças.' },
          { question: 'Posso tomar se estiver a fazer medicação?', answer: 'O rótulo indica que não deve ser utilizado por quem está a tomar medicação. Em caso de dúvida, fale com o seu médico.' },
          { question: 'Quanto tempo dura uma embalagem?', answer: 'Com a toma recomendada de 2 cápsulas por dia, as 60 cápsulas dão para 30 dias.' },
        ],
      },
    },
  },
  { handle: 'articulacao', id: 'articulacao', name: 'Articulação+', goals: ['mobilidade', 'performance'], priceCents: 3000 },
  { handle: 'termogenico', id: 'termogenico', name: 'Top Termo', goals: ['peso', 'performance'], priceCents: 8000 },
  { handle: 'vinagre-de-maca', id: 'vinagre-de-maca', name: 'Vinagre de Maçã', goals: ['peso'], priceCents: 3000 },
  { handle: 'top-omega3', id: 'top-omega3', name: 'Top Ómega 3', goals: ['foco', 'beleza', 'longevidade'], priceCents: 3000 },
  { handle: 'topcoenzimaq10', id: 'topcoenzimaq10', name: 'Top Coenzima Q10', goals: ['energia', 'performance', 'longevidade'], priceCents: 3000 },
  { handle: 'top-woman-40', id: 'top-woman-40', name: 'Top Woman 40+', goals: ['sono'], priceCents: 3500 },
  { handle: 'oleo-de-coco', id: 'oleo-de-coco', name: 'Óleo de Coco', goals: ['energia'], priceCents: 2500 },
  { handle: 'feno-grego', id: 'feno-grego', name: 'Feno-Grego', goals: ['energia', 'performance'], priceCents: 3000 },
  { handle: 'topnew-lip', id: 'topbio-lip', name: 'TopBio Lip', goals: ['peso'], priceCents: 8000 },
  // Saiu do catálogo a 2026-10-06. Fica aqui com `active: false` em vez de
  // ser apagado: o balcão e a matriz vão buscar o nome do produto a esta
  // lista inteira, sem filtro, e sem a linha uma ficha ainda por levantar ou
  // uma venda dos últimos 90 dias apareceriam escritas «topbio-lip-mini».
  { handle: 'topnew-lip-mini-20-capsulas', id: 'topbio-lip-mini', name: 'TopBio Lip Mini', goals: ['peso'], priceCents: 4000, active: false },

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
    // O que nao e o mesmo e a toma: o Lip sobe para duas capsulas ao 6.º dia, o
    // Top Max fica em uma por dia e a embalagem dura o mes inteiro (confirmado
    // pela casa a 2026-09-18). Como o Lip fala da toma das 16h00 em mais do que
    // um sitio, cada um deles tem de ser emendado.
    //
    // A ordem conta: a primeira apanha o protocolo inteiro da ficha, e so depois
    // a segunda apanha a frase curta do catalogo, que e o inicio dele.
    copyEmenda: [
      {
        de: 'Primeiros 5 dias: 1 cápsula às 10h00, após o pequeno-almoço. A partir do 6.º dia: 1 cápsula às 10h00 e outra às 16h00, sempre após uma refeição.',
        para: '1 cápsula por dia, às 10h00, após o pequeno-almoço.',
      },
      {
        de: 'Primeiros 5 dias: 1 cápsula às 10h00, após o pequeno-almoço.',
        para: '1 cápsula por dia, às 10h00, após o pequeno-almoço.',
      },
      {
        de: 'Tome após uma refeição — pequeno-almoço para a toma das 10h00 e lanche ou almoço para a toma das 16h00.',
        para: 'Tome após o pequeno-almoço.',
      },
      {
        de: 'Com o protocolo recomendado (1 cápsula nos primeiros 5 dias, 2 cápsulas a partir do 6.º dia), cada embalagem dura aproximadamente um mês.',
        para: 'Com 1 cápsula por dia, a embalagem de 30 cápsulas dura um mês.',
      },
    ],
  },

  {
    handle: 'top-shot',
    id: 'top-shot',
    name: 'Top Shot Matinal',
    goals: ['energia', 'performance', 'imunidade', 'peso'],
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

  {
    handle: 'top-hair',
    id: 'top-hair',
    name: 'Top Hair',
    goals: ['beleza'],
    priceCents: 3500,
    /*
     * Novo a 2026-10-21, ainda sem página no site. A copy sai do rótulo de
     * impressão, não do mockup: o mockup traz outra tabela (colagénio, urtiga,
     * L-cisteína) e promete «fortalecimento» e «crescimento» do cabelo, que
     * não são alegações autorizadas. As que ficam são as do Reg. (UE)
     * 432/2012 para os nutrientes que o rótulo traz acima de 15% do VRN.
     */
    copy: {
      description:
        'Biotina, Zinco, Selénio e Cobre para a manutenção de cabelo normal, com L-Cistina, MSM e vitaminas B e D3.',
      highlights: ['Biotina · Zinco · Selénio', 'L-Cistina + MSM', 'Vitaminas B + D3'],
      ingredients:
        'L-Cistina · MSM · Zinco · Vitamina B6 · Cobre · Folato · Biotina · Selénio · Vitamina D3 · Vitamina B12',
      usage: 'Tomar 2 cápsulas por dia, ou de acordo com o seu profissional de saúde.',
      detail: {
        about:
          'O Top Hair TopBioEuropa é um suplemento alimentar pensado para o cabelo, que junta L-Cistina e MSM a sete vitaminas e minerais. A Biotina, o Zinco e o Selénio contribuem para a manutenção de cabelo normal, e o Cobre contribui para a pigmentação normal do cabelo. O Zinco e o Selénio contribuem também para a manutenção de unhas normais. As vitaminas B6, B12 e o Folato contribuem para a redução do cansaço e da fadiga, e a Vitamina D3 para o normal funcionamento do sistema imunitário. Formulado para complementar uma alimentação variada e equilibrada.',
        forWhom: [
          'Adultos a partir dos 18 anos.',
          'Quem pretende complementar a alimentação com Biotina, Zinco e Selénio, nutrientes que contribuem para a manutenção de cabelo normal.',
          'Quem procura uma fórmula que junte, numa só toma, minerais, vitaminas do complexo B e Vitamina D3.',
        ],
        usage:
          'Tomar 2 cápsulas por dia, ou de acordo com o seu profissional de saúde. Tomar com um copo de água.',
        nutrition:
          'Por toma diária de 2 cápsulas: L-Cistina 300 mg, Metilsulfonilmetano (MSM) 300 mg, Zinco 10 mg (100% VRN), Vitamina B6 2 mg (143% VRN), Cobre 500 µg (50% VRN), Folato 200 µg (100% VRN), Biotina 150 µg (300% VRN), Selénio 55 µg (100% VRN), Vitamina D3 25 µg / 1000 UI (500% VRN), Vitamina B12 25 µg (1000% VRN).',
        notes: [
          'Suplemento alimentar destinado a adultos. Não deve ser consumido por grávidas, lactantes e crianças.',
          'Não utilizar se estiver a tomar medicação.',
          'Não exceder a toma diária recomendada.',
          'Os suplementos alimentares não substituem um regime alimentar variado e equilibrado nem um modo de vida saudável.',
          'Manter fora do alcance e da vista das crianças.',
          'Não utilizar em caso de hipersensibilidade ou alergia a qualquer um dos componentes.',
          'Conservar o produto bem fechado, na embalagem original, em local fresco, ao abrigo da luz, da humidade e do calor, a menos de 25 ºC.',
        ],
        ingredients: [
          { name: 'Biotina – 150 µg', note: 'A Biotina contribui para a manutenção de cabelo normal e de pele normal.' },
          { name: 'Zinco – 10 mg', note: 'O Zinco contribui para a manutenção de cabelo, pele e unhas normais e para o normal funcionamento do sistema imunitário.' },
          { name: 'Selénio – 55 µg', note: 'O Selénio contribui para a manutenção de cabelo normal e de unhas normais e para a proteção das células contra as oxidações indesejáveis.' },
          { name: 'Cobre – 500 µg', note: 'O Cobre contribui para a pigmentação normal do cabelo e para a manutenção de tecidos conjuntivos normais.' },
          { name: 'Vitaminas B6, B12 e Folato', note: 'Contribuem para a redução do cansaço e da fadiga e para o normal funcionamento do sistema imunitário.' },
          { name: 'Vitamina D3 – 25 µg (1000 UI)', note: 'A Vitamina D contribui para o normal funcionamento do sistema imunitário e para a manutenção de ossos normais.' },
          { name: 'L-Cistina & MSM – 300 mg cada', note: 'L-Cistina — aminoácido que contém enxofre. MSM (metilsulfonilmetano) — composto de enxofre de origem natural.' },
        ],
        faq: [
          { question: 'Como devo tomar?', answer: 'Tome 2 cápsulas por dia com um copo de água, ou de acordo com a indicação do seu profissional de saúde.' },
          { question: 'Posso tomar durante a gravidez ou amamentação?', answer: 'Não. Este suplemento destina-se a adultos e não deve ser consumido por grávidas, lactantes nem crianças.' },
          { question: 'Posso tomar se estiver a fazer medicação?', answer: 'O rótulo indica que não deve ser utilizado por quem está a tomar medicação. Em caso de dúvida, fale com o seu médico.' },
          { question: 'Quanto tempo dura uma embalagem?', answer: 'Com a toma recomendada de 2 cápsulas por dia, as 60 cápsulas dão para 30 dias.' },
        ],
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
   * Ficha emprestada: emenda-se-lhe o que só vale para o frasco de origem.
   *
   * Dois produtos podem ser a mesma fórmula em frascos de tamanhos diferentes,
   * e aí a ficha serve-lhes aos dois — menos onde o número de cápsulas manda:
   * a toma diária e o tempo que a embalagem dura. Essas frases vêm em
   * `copyEmenda`, cada uma um par «de → para» aplicado ao texto emprestado.
   *
   * Porquê emendar em vez de escrever a ficha toda de novo: o resto do texto
   * continua a ter um só dono. E porque uma emenda que deixa de encontrar o
   * que procura dá erro — o dia em que o site reescrever a frase, isto queixa-se
   * em vez de a estação ficar calada com a versão antiga.
   */
  if (p.copyFrom && copy?.detail) {
    const antes = copy.detail.faq.find((f) => /quanto tempo/i.test(f.question))?.answer

    for (const { de, para } of p.copyEmenda ?? []) {
      let achou = false
      const emendar = (t) => {
        if (!t.includes(de)) return t
        achou = true
        return t.split(de).join(para)
      }
      const d = copy.detail
      copy.detail = {
        ...d,
        about: emendar(d.about),
        usage: emendar(d.usage),
        notes: d.notes.map(emendar),
        faq: d.faq.map((f) => ({ ...f, answer: emendar(f.answer) })),
      }
      copy.usage = emendar(copy.usage)
      if (!achou) problems.push(`${p.handle}: a emenda «${de.slice(0, 40)}...» já não encontra o texto`)
    }

    /*
     * Rede de segurança: se ninguém emendou quanto tempo dura a embalagem, a
     * resposta emprestada é a do outro frasco. Fica sem resposta a essa, que é
     * menos mau do que a Cláudia prometer um mês num frasco que dá metade.
     */
    const depois = copy.detail.faq.find((f) => /quanto tempo/i.test(f.question))?.answer
    if (antes !== undefined && depois === antes) {
      copy.detail = {
        ...copy.detail,
        faq: copy.detail.faq.filter((f) => !/quanto tempo/i.test(f.question)),
      }
      problems.push(`${p.handle}: dura quanto tempo? ficha emprestada, resposta retirada`)
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
