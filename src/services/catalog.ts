import type { Fulfilment, GoalId, Product } from '../types'
import { catalogSeed } from '../data/catalog.seed'
import { config } from '../config'

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
 * Como é que este produto chega ao cliente, agora.
 *
 * Se está carregado na máquina, sai na máquina. Se não está, levanta-se ao
 * balcão — a loja é a dois passos. Só devolve `null` no caso raro de o
 * produto estar descontinuado também em loja.
 */
export function fulfilmentFor(product: Product): Fulfilment | null {
  if (product.slotId && product.machineStock > 0) return 'machine'
  if (product.inStore) return 'counter'
  return null
}

/** Produtos que a estação pode vender, por qualquer via. */
export function purchasable(products: Product[]): Product[] {
  return products.filter((p) => p.active && fulfilmentFor(p) !== null)
}

/**
 * Sugestões para um objetivo.
 *
 * Ordena por entrega imediata primeiro: entre duas opções igualmente
 * adequadas, mostrar antes a que sai na máquina poupa uma ida à loja a quem
 * só quer comprar e seguir caminho.
 */
export function recommendFor(products: Product[], goal: GoalId): Product[] {
  const rank = (p: Product) => (fulfilmentFor(p) === 'machine' ? 0 : 1)

  return purchasable(products)
    .filter((p) => p.goals.includes(goal))
    .sort((a, b) => rank(a) - rank(b) || b.machineStock - a.machineStock)
    .slice(0, config.maxRecommendations)
}

/** Só para o operador: sinaliza compartimentos a precisar de reposição. */
export function needsRestock(product: Product): boolean {
  return (
    product.slotId !== null &&
    product.machineStock > 0 &&
    product.machineStock <= config.lowStockThreshold
  )
}
