/**
 * Gera as imagens de produto da estação a partir dos mockups oficiais.
 *
 * Origem: pasta «Produtos Mockups» do repositório institucional — são os
 * ficheiros aprovados, já com a marca TopBio no rótulo. Nunca usar imagens
 * do site antigo (têm «Topnew» impresso) nem fotografias de stock.
 *
 * Correr com:  node scripts/build-product-images.mjs
 *
 * O resultado (public/products/*.webp) é versionado, para que a estação
 * arranque sem depender desta pasta nem da internet.
 */
import { mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'public', 'products')

const MOCKUPS = resolve(
  here,
  '..',
  '..',
  'topneweuropa-institucional',
  'Produtos Mockups',
)

/**
 * Segunda origem: mockups entregues à mão, largados em «Product/» na raiz do
 * projeto. Procura-se aqui quando o ficheiro ainda não foi arrumado no
 * repositório institucional — o sítio certo continua a ser o de cima.
 */
const HANDOFF = resolve(here, '..', 'Product')

/** Primeira origem que tenha o ficheiro, ou `null` se nenhuma tiver. */
function locate(rel) {
  for (const root of [MOCKUPS, HANDOFF]) {
    const path = join(root, rel)
    if (existsSync(path)) return path
  }
  return null
}

/** id do produto → ficheiro dentro de «Produtos Mockups». */
const SOURCES = {
  'acido-hialuronico': 'Ácido Hialurônico/Ácido-Hialurônico-Mockup.png',
  articulacao: 'Articulação+/Articulação+.png',
  'colageno-verisol': 'TopVerisol/topverisol-mockup.png',
  'feno-grego': 'Feno Grego/Feno-Grego-Mockup.png',
  imune: 'Imune+/Imune+.png',
  'maca-peruana': 'Maca Peruana/Maca-Peruana-Mockup.png',
  magnetop: 'Magnetop/Magnetop-Mockup.png',
  'oleo-de-coco': 'Óleo de Coco/Óleo-de-Coco-mockup.png',
  termogenico: 'Termogenico/Mockup-Termo.png',
  'top-brain': 'TOP BRAIN/top-brain-mockup.png',
  'top-max': 'TOP-MAX-MOCKUP.png',
  'top-omega3': 'Top Omega3/Top-Omega3-mockup.png',
  'top-shape': 'Top-Shape-Mockup.png',
  'top-shot': 'Top-Shot-Mockup.png',
  'top-woman-40': 'TopWoman/TopWoman-Mockup.png',
  topcalm: 'TopCalm/TOPCALM.png',
  topcoenzimaq10: 'TopCoenzimaQ10/TOP-COENZIMA-MOCKUP.png',
  'topbio-lip': 'TopLIP/TOPbiolip-mockup.png',
  'topbio-lip-mini': 'Top Minilip/TopbioLip-mockup.png',
  'vinagre-de-maca': 'Top Vinagre de Maça (GOMA)/Vinagre-de-Maça-(Goma)-mockup.png',
  'vitamina-c': 'Vita C/Vita-C.png',
  'vitamina-d3-k2': 'Vita D/Vita D.png',
}

mkdirSync(outDir, { recursive: true })

let ok = 0
const missing = []

for (const [id, rel] of Object.entries(SOURCES)) {
  const src = locate(rel)
  if (!src) {
    missing.push(`${id} → ${rel}`)
    continue
  }
  const dest = join(outDir, `${id}.webp`)
  // `trim` corta a moldura vazia do mockup para o frasco encher o cartão;
  // `contain` com fundo transparente devolve sempre um quadrado, para que a
  // grelha do ecrã não salte de altura entre produtos.
  await sharp(src)
    .trim({ threshold: 12 })
    .resize(900, 900, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 6 })
    .toFile(dest)
  const kb = Math.round(statSync(dest).size / 1024)
  console.log(`${id.padEnd(24)} ${String(kb).padStart(4)} KB`)
  ok++
}

console.log(`\n${ok} imagens geradas em public/products`)
if (missing.length) {
  console.log(`\nEm falta (${missing.length}):`)
  for (const m of missing) console.log('  ' + m)
}
