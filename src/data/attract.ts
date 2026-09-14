/**
 * Vídeos do ecrã de descanso.
 *
 * Enquanto ninguém toca, o tablet passa estes clips em cadeia e recomeça do
 * princípio. Qualquer toque no ecrã acaba o descanso e começa a sessão do
 * cliente (ver `screens/Attract.tsx`).
 *
 * Como trocar os vídeos:
 *  1. Põe os ficheiros em `public/media/attract/`.
 *  2. Escreve aqui os nomes, por ordem, com a barra à frente:
 *       export const attractVideos = ['/media/attract/1.mp4', '/media/attract/2.mp4']
 *
 * Lista vazia = volta-se ao fundo com a marca (o de sempre), sem vídeo. Se um
 * ficheiro não existir ou não tocar, a estação também recua para esse fundo em
 * vez de ficar com um retângulo preto — nunca deixa o ecrã de montra às moscas.
 *
 * Formato: MP4 (H.264) é o que toca em todo o lado; WebM também serve. Os clips
 * passam SEM SOM — o browser não deixa um vídeo arrancar sozinho com áudio, e
 * um quiosque a falar sozinho na loja o dia todo era de mais. Ao alto
 * (o tablet é retrato) e curtos: dois ou três de 10-20 s valem mais que um
 * longo, que o cliente não vai ficar a ver até ao fim.
 */
export const attractVideos: string[] = [
  // '/media/attract/1.mp4',
  // '/media/attract/2.mp4',
]
