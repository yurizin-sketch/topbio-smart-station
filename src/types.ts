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

export interface Product {
  id: string
  name: string
  /** Preço em cêntimos. Nunca usar float para dinheiro. */
  priceCents: number
  /**
   * Há unidades na loja.
   *
   * A estação é um tablet dentro da loja e não entrega nada por si: tudo o que
   * se compra aqui se levanta ao balcão. Este é o único sinal de disponível /
   * indisponível que existe.
   */
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
  /** Confirmada pelo servidor (webhook ou staff). Só aqui é que se entrega. */
  | 'paid'
  /** Produto entregue em mão pelo balcão. Fim de linha. */
  | 'delivered'
  | 'failed'
  | 'expired'
  | 'cancelled'

export interface Order {
  id: string
  stationId: string
  productId: string
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
