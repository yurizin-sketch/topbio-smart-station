/**
 * Configuração da estação.
 *
 * Tudo o que muda entre máquinas (ou entre dev e produção) vive aqui, para
 * não haver números mágicos espalhados pelos ecrãs.
 */

const STATION_ID_KEY = 'topbio_station_id'

/**
 * Identificador persistente desta máquina.
 * Gerado uma vez e guardado localmente — é o que permite saber de que
 * estação veio cada venda sem identificar o cliente.
 */
export function getStationId(): string {
  let id = localStorage.getItem(STATION_ID_KEY)
  if (!id) {
    id = `station-${crypto.randomUUID().slice(0, 8)}`
    localStorage.setItem(STATION_ID_KEY, id)
  }
  return id
}

export const config = {
  /**
   * Interruptor de segurança comercial.
   *
   * Enquanto for `false`, a estação assume que os preços do catálogo são
   * provisórios e mostra um aviso permanente. Só passa a `true` quando a
   * tabela oficial estiver carregada — cobrar um valor errado a um cliente
   * é um problema muito mais caro do que um ecrã com uma tarja.
   */
  pricesConfirmed: true,

  /** Volta ao ecrã de atração após este tempo sem toques. */
  idleTimeoutMs: 90_000,

  /**
   * PIN do /staff.
   *
   * ⚠️ Isto NÃO é segurança. Está no bundle, qualquer pessoa que abra o
   * inspetor lê-o. Serve só para o cliente curioso que carrega no ecrã não cair
   * no painel do balcão por acidente. A validação a sério só existe quando o
   * backend autenticar o funcionário — até lá, o tablet não fica sozinho.
   */
  staffPin: '2468',

  /** Ecrã de sucesso: tempo até reiniciar sozinho. */
  successResetMs: 12_000,

  /** Quanto tempo o MB WAY espera pela confirmação do cliente. */
  mbwayTimeoutMs: 180_000,

  /**
   * Validade do ticket de pagamento ao balcão.
   * Enquanto está válido o stock fica reservado, por isso não pode ser
   * generoso — senão uma pessoa que desiste bloqueia a última unidade.
   */
  ticketValidityMs: 10 * 60_000,

  /** Abaixo deste valor mostramos "últimas unidades". */
  lowStockThreshold: 3,

  /** Máximo de produtos sugeridos por objetivo. */
  maxRecommendations: 3,

  /** Prefixo telefónico. Portugal. */
  phoneCountryCode: '+351',
  phoneDigits: 9,
} as const

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}
