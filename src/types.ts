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
 * A ficha do produto por inteiro, tal como está no site.
 *
 * O que está em `Product` é o que cabe num ecrã: uma frase, três chips, uma
 * linha de composição. Isto é o resto — o texto todo que a casa escreveu sobre
 * cada frasco, sem cortes.
 *
 * Existe por causa da Cláudia. Ela apresenta o produto a quem chega e responde
 * a quem pergunta, e para isso precisa de saber mais do que aquilo que está
 * escrito no ecrã, que a pessoa já está a ler sozinha.
 *
 * Vem toda do site — `scripts/build-catalog.mjs` copia-a dos templates da loja
 * — e é por isso que se pode dizer em voz alta sem medo: é a mesma copy que
 * passou pela revisão legal (Regulamento CE 1924/2006), palavra por palavra.
 * Não se escreve nada aqui à mão: à próxima geração desaparecia.
 */
export interface ProductDetail {
  /** A descrição longa, a que o ecrã só mostra a primeira frase. */
  about: string
  /** Para quem é este produto. Uma linha por pessoa. */
  forWhom: string[]
  /** Como tomar, por extenso — doses, horas, com ou sem comida. */
  usage: string
  /** O que traz por dose, com os miligramas. */
  nutrition: string
  /** Avisos, contraindicações e quem não deve tomar. */
  notes: string[]
  /** Cada ingrediente e o que ele é. */
  ingredients: { name: string; note: string }[]
  /** O que os clientes perguntam, já respondido pela casa. */
  faq: { question: string; answer: string }[]
}

/**
 * O que está impresso no rótulo do frasco.
 *
 * Existe porque a pergunta mais comum ao balcão — «quantas cápsulas traz?» —
 * não tem resposta em lado nenhum do site. Nem na copy dos produtos, nem na
 * tabela de preços. Só no rótulo, que se vê na fotografia.
 *
 * ATENÇÃO À PROVENIÊNCIA. Ao contrário de tudo o resto, isto não vem do tema
 * Shopify: foi lido das fotografias em `public/products/` e escrito à mão na
 * tabela `LABELS` do gerador. Quando um frasco mudar de rótulo, a fotografia
 * muda e esta tabela não muda sozinha — é preciso ir lá corrigir. Os campos
 * ficam a `null` quando o rótulo não diz: melhor calar do que arredondar.
 */
export interface ProductPack {
  /** Cápsulas por frasco. `null` no que não é em cápsulas, como o pó. */
  capsules: number | null
  /** Doses que a embalagem dá, tal como o rótulo as conta. */
  doses: number | null
  /** Miligramas por cápsula. */
  mgPerCapsule: number | null
  /** Peso líquido, com a unidade, como vem escrito ("36 g"). */
  netWeight: string | null
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
  /**
   * A ficha completa, para a Cláudia.
   *
   * Opcional porque há três produtos que ainda não têm página no site e vivem
   * da copy escrita à mão no gerador. Desses ela diz o que sabe, que é menos.
   */
  detail?: ProductDetail
  /** O que diz o rótulo do frasco. Falta onde a fotografia não o mostra. */
  pack?: ProductPack
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
