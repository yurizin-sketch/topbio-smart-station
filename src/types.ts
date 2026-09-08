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

/**
 * Como é que o dinheiro entrou, na caixa da loja.
 *
 * Não é uma escolha do quiosque: o quiosque não cobra nada. É o que o
 * funcionário carrega no balcão depois de receber, e é o que deixa a matriz
 * fechar a caixa ao fim do dia sem andar a adivinhar.
 *
 * O MB WAY continua a existir na loja — o que deixou de existir foi o MB WAY
 * *no tablet*. Quem paga por MB WAY paga à pessoa do balcão, tal como paga
 * com uma nota ou com o cartão.
 */
export type PaymentMethod = 'dinheiro' | 'mbway' | 'cartao'

/** O nome de cada um, para os botões do balcão e para os relatórios. */
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  mbway: 'MB WAY',
  cartao: 'Cartão',
}

export type OrderStatus =
  /** Criada no quiosque, ainda sem ficha emitida. */
  | 'created'
  /** Ficha emitida, o cliente vai a caminho do balcão. */
  | 'awaiting_counter'
  /**
   * O funcionário recebeu o dinheiro e confirmou. Só aqui é que se entrega.
   *
   * Quem escreve este estado é sempre uma pessoa, no `/staff`. O quiosque não
   * o escreve em circunstância nenhuma: não tem como saber se pagaram.
   */
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
  /** Como pagaram. Preenchido pelo balcão ao receber; antes disso, `null`. */
  method: PaymentMethod | null
  status: OrderStatus
  /** Código curto legível para o balcão, ex.: `TB-4821`. */
  ticketCode?: string
  createdAt: number
  expiresAt: number
  failureReason?: string
}
