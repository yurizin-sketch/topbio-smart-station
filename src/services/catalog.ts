import type { GoalId, Product } from '../types'
import { catalogSeed } from '../data/catalog.seed'

/**
 * Acesso ao catálogo.
 *
 * A app do protótipo anterior tinha o catálogo compilado dentro do bundle:
 * mudar um preço obrigava a rebuild e deploy, e o painel de gestão não
 * alimentava o ecrã. Aqui a origem é substituível — a semente local é só o
 * plano B para quando a rede falha.
 */

export interface CatalogSource {
  readonly kind: string
  /** Devolve a função para cancelar a subscrição. */
  subscribe(onChange: (products: Product[]) => void): () => void
}

/** Origem local. Responde de imediato e nunca falha. */
export class SeedCatalog implements CatalogSource {
  readonly kind = 'seed'

  subscribe(onChange: (products: Product[]) => void): () => void {
    onChange(catalogSeed)
    return () => {}
  }
}

let current: CatalogSource = new SeedCatalog()

export function getCatalog(): CatalogSource {
  return current
}

export function setCatalog(next: CatalogSource): void {
  current = next
}

/**
 * Este produto pode ser vendido agora.
 *
 * A estação é um tablet dentro da loja: não entrega nada, só fecha a venda e
 * emite a ficha que o cliente leva ao balcão. Por isso há uma única pergunta
 * a fazer — há unidades na loja? — e não duas vias de entrega.
 */
export function isAvailable(product: Product): boolean {
  return product.active && product.inStore
}

/** Produtos que a estação pode vender. */
export function purchasable(products: Product[]): Product[] {
  return products.filter(isAvailable)
}

/**
 * Tudo o que a loja tem numa secção.
 *
 * Sem ordenação por via de entrega: tudo se levanta no mesmo balcão, por isso
 * a ordem do catálogo é a ordem que a loja escolheu mostrar.
 *
 * Sem tecto: houve um de três, e a secção da energia mostrava a Maca, o Top
 * Brain e o Magnetop e escondia o Top Shot e a Coenzima, que eram os que a
 * loja queria lá. Quem decide o que entra numa secção são os `goals` do
 * catálogo, não um corte pela ordem.
 */
export function recommendFor(products: Product[], goal: GoalId): Product[] {
  return purchasable(products).filter((p) => p.goals.includes(goal))
}
