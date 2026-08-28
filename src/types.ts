/**
 * Objetivo que o cliente escolhe no início da sessão.
 *
 * A lista acompanha a gama real: cada objetivo tem de ter pelo menos um
 * produto aprovado por trás, senão é uma porta que não abre.
 */
export type GoalId =
  | 'sono'
  | 'energia'
  | 'performance'
  | 'beleza'
  | 'imunidade'
  | 'peso'
  | 'foco'
  | 'mobilidade'

export interface Goal {
  id: GoalId
  label: string
  /** Texto de apoio à navegação. Nunca uma alegação de saúde. */
  hint: string
  icon: string
}

/**
 * Compartimento físico da máquina, no formato `A01`..`C08`.
 * O tipo é uma string opaca de propósito: a grelha real (quantas
 * prateleiras, quantas colunas) só se sabe quando a máquina for escolhida,
 * por isso não a fixamos no sistema de tipos.
 */
export type SlotId = string

/**
 * Como o produto chega às mãos do cliente.
 *
 * A estação fica à porta da loja, e a loja tem sempre stock. Por isso um
 * produto que não esteja carregado na máquina NÃO está esgotado — muda só a
 * forma de entrega. Nunca há becos sem saída.
 */
export type Fulfilment =
  /** Sai no compartimento, ali mesmo. */
  | 'machine'
  /** Levanta-se ao balcão, lá dentro. */
  | 'counter'

export interface Product {
  id: string
  name: string
  /** Preço em cêntimos. Nunca usar float para dinheiro. */
  priceCents: number
  /** Compartimento na máquina. `null` = este produto não está carregado. */
  slotId: SlotId | null
  /** Unidades dentro do compartimento. Zero não significa esgotado. */
  machineStock: number
  /** Existe em loja. Na prática é quase sempre `true`. */
  inStore: boolean
  image: string
  /** Descrição factual do produto. Sem alegações de efeito. */
  description: string
  /** Características do produto (formato, cápsulas, origem), não benefícios. */
  highlights: string[]
  ingredients: string
  usage: string
  goals: GoalId[]
  active: boolean
}

export type PaymentMethod = 'mbway' | 'counter'

export type OrderStatus =
  /** Criada no quiosque, ainda sem método escolhido. */
  | 'created'
  /** Pedido enviado ao MB WAY, à espera de confirmação do cliente. */
  | 'awaiting_payment'
  /** Ticket emitido, cliente vai pagar ao balcão. */
  | 'awaiting_counter'
  /** Confirmada pelo servidor (webhook ou staff). Só aqui é que se despacha. */
  | 'paid'
  | 'dispensing'
  | 'dispensed'
  | 'failed'
  | 'expired'
  | 'cancelled'

export interface Order {
  id: string
  stationId: string
  productId: string
  /** Só preenchido quando a entrega é pela máquina. */
  slotId: SlotId | null
  fulfilment: Fulfilment
  amountCents: number
  method: PaymentMethod | null
  status: OrderStatus
  /** Código curto legível para o balcão, ex.: `TB-4821`. */
  ticketCode?: string
  /** Telemóvel usado no MB WAY, só os últimos 3 dígitos são persistidos. */
  phoneSuffix?: string
  createdAt: number
  expiresAt: number
  failureReason?: string
}
