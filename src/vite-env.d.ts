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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
