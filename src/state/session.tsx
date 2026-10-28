import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { GoalId, Order, OrderStatus, Product } from '../types'
import { config, getStationId } from '../config'
import { getCatalog, purchasable } from '../services/catalog'
import { upsertOrder } from '../services/orders'

/**
 * Estado da sessão do cliente.
 *
 * Uma "sessão" começa quando alguém toca no ecrã e acaba quando a compra
 * termina ou o tempo esgota. É deliberadamente pequena e volátil: ao
 * reiniciar não fica rasto do cliente anterior no ecrã seguinte.
 */

/** Uma linha do carrinho, enquanto o cliente ainda está a escolher. */
export interface CartLine {
  product: Product
  quantity: number
}

interface SessionState {
  products: Product[]
  catalogReady: boolean
  goal: GoalId | null
  product: Product | null
  /**
   * O carrinho. Vive na sessão, como o resto: o cliente seguinte nunca vê o
   * que o anterior lá deixou.
   */
  cart: CartLine[]
  order: Order | null
}

type Action =
  | { type: 'catalog_loaded'; products: Product[] }
  | { type: 'goal_selected'; goal: GoalId }
  | { type: 'product_selected'; product: Product }
  | { type: 'cart_add'; product: Product; quantity: number }
  | { type: 'cart_set'; productId: string; quantity: number }
  | { type: 'order_created'; order: Order }
  | { type: 'order_updated'; patch: Partial<Order> }
  | { type: 'reset' }

const initialState: SessionState = {
  products: [],
  catalogReady: false,
  goal: null,
  product: null,
  cart: [],
  order: null,
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'catalog_loaded':
      return { ...state, products: action.products, catalogReady: true }

    case 'goal_selected':
      // Trocar de objetivo invalida o produto escolhido antes.
      return { ...state, goal: action.goal, product: null, order: null }

    case 'product_selected':
      return { ...state, product: action.product, order: null }

    case 'cart_add': {
      const ja = state.cart.find((l) => l.product.id === action.product.id)
      if (ja) {
        return {
          ...state,
          cart: state.cart.map((l) =>
            l === ja ? { ...l, quantity: Math.min(config.maxQuantity, l.quantity + action.quantity) } : l,
          ),
        }
      }
      if (state.cart.length >= config.maxCartLines) return state
      return { ...state, cart: [...state.cart, { product: action.product, quantity: action.quantity }] }
    }

    case 'cart_set':
      // Zero tira a linha do carrinho.
      return {
        ...state,
        cart: state.cart
          .map((l) =>
            l.product.id === action.productId
              ? { ...l, quantity: Math.min(config.maxQuantity, Math.max(0, action.quantity)) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      }

    case 'order_created':
      // O carrinho passou a ser a venda; não fica para trás à espera de outra.
      return { ...state, order: action.order, cart: [] }

    case 'order_updated': {
      if (!state.order) return state
      // Mesma guarda do `reset`, pela mesma razão.
      //
      // O ecrã de sucesso marca a encomenda como paga num efeito que depende da
      // encomenda. Sem esta verificação o reducer devolvia sempre um objeto
      // novo, o efeito via uma encomenda "diferente" e voltava a marcar — o
      // tablet ficava preso num ciclo até o separador congelar.
      const order = state.order
      const changed = (Object.keys(action.patch) as (keyof Order)[]).some(
        (key) => action.patch[key] !== order[key],
      )
      if (!changed) return state
      return { ...state, order: { ...order, ...action.patch } }
    }

    case 'reset':
      // Nada de cliente por limpar — devolvemos o mesmo objeto.
      //
      // Sem esta guarda o ecrã de atração girava em falso: chama `reset()` ao
      // montar, o reducer devolvia sempre um estado novo, o `api` recalculava,
      // o `reset` mudava de identidade e o efeito voltava a disparar. Era o
      // ecrã que está ligado o dia todo a gastar bateria do tablet a fazer nada.
      if (!state.goal && !state.product && !state.order && !state.cart.length) return state
      // O catálogo sobrevive ao reset: é da estação, não do cliente.
      return {
        ...initialState,
        products: state.products,
        catalogReady: state.catalogReady,
      }
  }
}

interface SessionApi extends SessionState {
  selectGoal(goal: GoalId): void
  selectProduct(product: Product): void
  /** Juntar frascos de um produto ao carrinho (soma, se já lá estiver). */
  addToCart(product: Product, quantity: number): void
  /** Mudar quantos frascos de um produto; 0 tira-o do carrinho. */
  setCartQuantity(productId: string, quantity: number): void
  /**
   * Fechar o carrinho numa venda. `lines` serve para quem acabou de juntar
   * o último produto e ainda não vê o carrinho atualizado (o `dispatch` só
   * chega no render seguinte).
   */
  createOrder(lines?: CartLine[]): Order
  updateOrder(patch: Partial<Order>): void
  setOrderStatus(status: OrderStatus): void
  reset(): void
}

const SessionContext = createContext<SessionApi | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Filtramos à entrada, não em cada ecrã. Um produto inativo (sem preço
  // aprovado, por exemplo) não deve existir para o cliente em lado nenhum — nem
  // na lista, nem numa pesquisa, nem num link direto para a ficha. Se o filtro
  // vivesse em cada ecrã, bastava esquecer um para a estação cobrar 0,00 €.
  useEffect(() => {
    return getCatalog().subscribe((products) =>
      dispatch({ type: 'catalog_loaded', products: purchasable(products) }),
    )
  }, [])

  // A sessão do quiosque é volátil de propósito — desaparece assim que o
  // cliente sai da frente do ecrã. Mas se ele leva um código para o balcão,
  // alguém do outro lado tem de o conseguir ver. Espelhamos aqui, num só sítio,
  // em vez de espalhar chamadas por cada ecrã de checkout.
  //
  // Todo o pedido que chega a estes dois estados acaba nas mãos do funcionário:
  // ou falta cobrar, ou falta entregar. Nada se resolve sozinho no tablet.
  const { order } = state
  useEffect(() => {
    if (!order) return
    if (order.status === 'awaiting_counter' || order.status === 'paid') upsertOrder(order)
  }, [order])

  const api = useMemo<SessionApi>(
    () => ({
      ...state,

      selectGoal: (goal) => dispatch({ type: 'goal_selected', goal }),

      selectProduct: (product) => dispatch({ type: 'product_selected', product }),

      addToCart: (product, quantity) => dispatch({ type: 'cart_add', product, quantity }),

      setCartQuantity: (productId, quantity) => dispatch({ type: 'cart_set', productId, quantity }),

      createOrder: (lines = state.cart) => {
        if (!lines.length) throw new Error('createOrder com o carrinho vazio')

        const now = Date.now()
        const items = lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          name: l.product.name,
          unitCents: l.product.priceCents,
        }))
        const order: Order = {
          id: crypto.randomUUID(),
          stationId: getStationId(),
          // Há pelo menos uma: o carrinho vazio já parou em cima.
          productId: items[0]!.productId,
          quantity: items.reduce((n, i) => n + i.quantity, 0),
          items,
          amountCents: items.reduce((n, i) => n + i.unitCents * i.quantity, 0),
          // Nasce a null e assim fica até uma pessoa receber o dinheiro.
          method: null,
          status: 'created',
          createdAt: now,
          expiresAt: now + config.ticketValidityMs,
        }
        dispatch({ type: 'order_created', order })
        return order
      },

      updateOrder: (patch) => dispatch({ type: 'order_updated', patch }),

      setOrderStatus: (status) => dispatch({ type: 'order_updated', patch: { status } }),

      reset: () => dispatch({ type: 'reset' }),
    }),
    [state],
  )

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession fora do SessionProvider')
  return ctx
}
