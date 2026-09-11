/// <reference types="vite/client" />

/**
 * As variáveis que a estação lê ao ser compilada.
 *
 * Tudo o que tem prefixo `VITE_` acaba dentro do JavaScript que vai para o
 * tablet, e este repositório é público — portanto aqui só entram endereços,
 * nunca chaves. A chave da API do modelo vive no servidor e não sai de lá.
 */
interface ImportMetaEnv {
  /**
   * Onde é que a assistente pensa.
   *
   * Endereço do nosso worker (ver `server/`). Sem isto a estação continua a
   * funcionar com as falas escritas — a assistente fica mais simples, não
   * desaparece.
   */
  readonly VITE_ASSISTANT_URL?: string

  /**
   * Onde ficam as contas: pedidos, stock e a vista da matriz.
   *
   * Por omissão é o mesmo worker do `VITE_ASSISTANT_URL` — é o mesmo servidor,
   * a mesma conta. Só se preenche para os separar.
   *
   * Sem isto a estação vende à mesma, mas cada tablet fica com o seu livro: o
   * balcão vê os pedidos deste aparelho e a matriz não vê nada.
   */
  readonly VITE_API_URL?: string

  /**
   * Que posto é este tablet, na tabela `stations` da base de dados.
   *
   * Normalmente fica vazio. O tablet aprende quem é na primeira vez que alguém
   * entra no `/staff` com o PIN da loja — é o servidor que responde com o id
   * certo, e fica guardado no aparelho. Isto serve só para quem compila um
   * build dedicado a uma loja e quer poupar esse passo.
   */
  readonly VITE_STATION_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
