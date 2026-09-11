/**
 * Configuração da estação.
 *
 * Tudo o que muda entre estações (ou entre dev e produção) vive aqui, para
 * não haver números mágicos espalhados pelos ecrãs.
 */

const STATION_CONFIGURED_KEY = 'topbio_station_id'
const STATION_LOCAL_KEY = 'topbio_station_local'

/**
 * A forma dos ids que esta função gerava antes de existir a tabela `stations`.
 *
 * Ficaram guardados nos tablets de então e são indistinguíveis de uma escolha
 * do dono se olharmos só para a chave onde estão. Daí o padrão.
 */
const GERADO = /^station-[0-9a-f]{8}$/

/**
 * O posto tal como está registado na base de dados, ou vazio se não estiver.
 *
 * Duas origens, por esta ordem: o que ficou guardado neste aparelho (posto no
 * lugar pelo balcão ao entrar, que é quando o servidor nos diz o id verdadeiro)
 * e o que o build traz em `VITE_STATION_ID`. O primeiro ganha porque é
 * específico do aparelho; o segundo serve quando um build só serve uma loja.
 */
function postoRegistado(): string {
  try {
    const guardado = localStorage.getItem(STATION_CONFIGURED_KEY) ?? ''
    // Um id que fomos nós a inventar não é uma configuração. Aceitá-lo como
    // tal punha o quiosque a anunciar-se ao servidor com um nome que ninguém
    // registou, e o servidor a recusar tudo com `posto-desconhecido`.
    if (guardado && !GERADO.test(guardado)) return guardado
  } catch {
    // localStorage desligado. Fica o do build.
  }
  return String(import.meta.env.VITE_STATION_ID ?? '').trim()
}

/**
 * Identificador deste posto.
 *
 * Quando há posto registado é esse — é por ele que o servidor separa as lojas
 * e é ele que viaja em cada pedido. Quando não há, inventa-se um só deste
 * aparelho, para a telemetria e o comprovante terem o que escrever: a estação
 * continua a vender, só não espelha nada para a base de dados.
 */
export function getStationId(): string {
  const registado = postoRegistado()
  if (registado) return registado

  try {
    let id = localStorage.getItem(STATION_LOCAL_KEY)
    if (!id) {
      id = `station-${crypto.randomUUID().slice(0, 8)}`
      localStorage.setItem(STATION_LOCAL_KEY, id)
    }
    return id
  } catch {
    return 'station-sem-memoria'
  }
}

/**
 * Este posto existe na base de dados.
 *
 * Enquanto for falso não se tenta espelhar pedido nenhum: seria bater à porta
 * do servidor uma vez por venda para ouvir sempre a mesma recusa.
 */
export function stationIsRegistered(): boolean {
  return Boolean(postoRegistado())
}

/**
 * O balcão entrou e o servidor disse qual é o posto deste tablet.
 *
 * É assim que um aparelho aprende quem é sem ninguém editar ficheiros: monta-se
 * o tablet, entra-se uma vez no `/staff` com o PIN da loja, e a partir daí as
 * vendas passam a sair com o nome certo.
 */
export function rememberStationId(id: string): void {
  try {
    localStorage.setItem(STATION_CONFIGURED_KEY, id)
  } catch {
    // Sem memória o posto volta ao que o build disser. Não é motivo para falhar
    // uma sessão de balcão que já foi autenticada.
  }
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
   * O PIN de recurso do balcão — o que abre quando o servidor não responde.
   *
   * ⚠️ Isto NÃO é segurança. Está no pacote do browser, qualquer pessoa que abra
   * o inspetor o lê. Faz duas coisas, ambas só quando não há servidor a validar:
   *
   *  - na demonstração publicada (sem base de dados nenhuma por trás), abre o
   *    painel para se poder mostrar;
   *  - numa loja a sério cuja ligação caiu ao início do turno, deixa o dono
   *    abrir o balcão e vender à mão até a rede voltar. Só funciona quando o
   *    servidor não chega a responder — a um PIN errado a que o servidor disse
   *    «não», isto não abre nada.
   *
   * Com o servidor a responder este valor nunca é olhado: quem valida o PIN é o
   * worker, contra o resumo guardado na tabela `stations`, e o que volta é uma
   * sessão assinada. Ver `services/counter.ts`.
   */
  staffPin: '2468',

  /**
   * Ecrã do código: tempo até reiniciar sozinho.
   *
   * Chega para anotar o código com calma e é curto que baste para o próximo
   * cliente não encontrar a compra de outra pessoa no ecrã. Qualquer toque
   * volta a pôr a contagem no início.
   */
  successResetMs: 40_000,

  /** Últimos segundos, em que o ecrã avisa que vai fechar. */
  successWarnMs: 10_000,

  /**
   * Validade da ficha do balcão.
   *
   * Curta de propósito: é o tempo que uma pessoa demora a atravessar a loja.
   * Passado isto o funcionário vê a ficha como expirada e não a cobra — evita
   * que apareça alguém ao balcão, uma hora depois, com um código de um preço
   * que entretanto mudou.
   */
  ticketValidityMs: 10 * 60_000,

  /** Abaixo deste valor mostramos "últimas unidades". */
  lowStockThreshold: 3,

  /** Máximo de produtos sugeridos por objetivo. */
  maxRecommendations: 3,

  /** Prefixo telefónico. Portugal. */
  phoneCountryCode: '+351',
  phoneDigits: 9,

  /**
   * O servidor da estação: pedidos, stock e a vista da matriz.
   *
   * É o mesmo worker da Cláudia — a mesma conta, a mesma origem — e por isso o
   * mesmo endereço por omissão. O `VITE_API_URL` existe para o dia em que a
   * contabilidade mudar de casa sem a voz mudar.
   *
   * Vazio = a estação trabalha só com o que tem em casa: o balcão vê os pedidos
   * deste tablet e mais nada. Não parte, encolhe.
   */
  api: {
    endpoint: import.meta.env.VITE_API_URL ?? import.meta.env.VITE_ASSISTANT_URL ?? '',

    /**
     * Espera máxima por uma resposta da contabilidade.
     *
     * Mais folgado do que o da Cláudia: aqui ninguém está a olhar para uma
     * personagem calada — está uma pessoa ao balcão à espera de fechar uma
     * venda, e vale mais esperar mais um segundo do que cobrar duas vezes.
     */
    timeoutMs: 8_000,
  },

  /** A assistente que fala com o cliente. */
  assistant: {
    /**
     * Onde é que ela pensa.
     *
     * Vazio = falas escritas, sem servidor e sem custo. Preenchido = o nosso
     * worker, que é quem tem a chave da API. A chave nunca entra aqui: este
     * repositório é público.
     */
    endpoint: import.meta.env.VITE_ASSISTANT_URL ?? '',

    /** Depois disto desistimos do modelo e dizemos a fala escrita. */
    timeoutMs: 6_000,

    /** Quantas trocas de palavras é que ela leva consigo. */
    historyTurns: 8,

    /**
     * Silêncio entre saudações à mesma pessoa.
     *
     * Sem isto, quem ficasse ao balcão a decidir levava com "olá" de dez em
     * dez segundos.
     * Quarenta e cinco era demais: quem se afastava a pensar e voltava
     * encontrava-a calada, e ficava com ar de avariada. Vinte chega para não
     * ser insistente e é pouco para o cliente reparar que ela o ignorou.
     */
    greetCooldownMs: 20_000,
  },

  /**
   * Voz da Cláudia.
   *
   * Só conta quando há worker configurado; sem ele fala-se com as vozes do
   * próprio aparelho e nada disto se usa.
   */
  voice: {
    /**
     * Espera máxima pelo áudio antes de desistir.
     *
     * Curto de propósito. Mais do que isto e a pessoa já percebeu que ficou
     * pendurada — mais vale ouvir a voz do tablet do que ouvir silêncio.
     */
    timeoutMs: 5_000,

    /**
     * Falas guardadas em memória no tablet.
     *
     * A estação diz as mesmas dez ou vinte frases o dia todo. O worker já tem a
     * sua própria cache, mas esta poupa também a ida à rede — a segunda vez que
     * a Cláudia diz "Oi!" sai instantânea.
     */
    cacheEntries: 40,
  },
} as const

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}
