/**
 * Caminho de um ficheiro estático, resolvido a partir da pasta onde a estação
 * está publicada.
 *
 * Os dados guardam o caminho canónico a partir da raiz (`/products/x.webp`) —
 * é assim que se lê melhor e é o que serve durante o desenvolvimento. Mas a
 * estação pode acabar a correr numa subpasta ou a partir de um ficheiro local
 * (é por isso que o router é o HashRouter), e aí uma barra inicial aponta para
 * fora da aplicação e a imagem não aparece.
 *
 * `import.meta.env.BASE_URL` é o `base` do vite.config.ts e termina sempre em
 * barra, por isso basta tirar a barra da frente do caminho.
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
