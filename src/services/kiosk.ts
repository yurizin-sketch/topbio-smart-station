/**
 * Modo quiosque — pôr o tablet a portar-se como uma máquina de loja e não como
 * um telemóvel de bolso.
 *
 * ⚠️ Aviso honesto, porque é a pergunta que toda a gente faz: uma página web
 * NÃO consegue impedir alguém de fechar o browser, carregar no botão de casa
 * ou deslizar a app para fora. Isso é o sistema do aparelho que manda — e ainda
 * bem: se qualquer site conseguisse prender o telemóvel, a web era uma
 * armadilha. O cadeado a sério faz-se no próprio tablet:
 *   • Android: "Fixar ecrã" (grátis, nas Definições) ou o Fully Kiosk Browser
 *     (a app que os quiosques a sério usam — barra o botão de casa, a barra de
 *     estado e o recuar, e só sai com um gesto e PIN secretos).
 *   • iPad: "Acesso Guiado" (triplo-clique no botão lateral, sai com código).
 *
 * O que ESTE ficheiro faz é o andar de baixo, que o cadeado do sistema não
 * cobre: tirar os gestos que tiram o cliente do fluxo sem querer e manter o
 * ecrã aceso. Os dois juntos é que dão o quiosque.
 *
 * De propósito NÃO se mexe no botão de recuar: a estação usa-o de verdade
 * (as setas "←" nos ecrãs), e sequestrá-lo aqui partia essa navegação. Quem
 * desliga o recuar é o modo quiosque do aparelho, que é o sítio certo.
 */

// Guarda-se a referência para o bloqueio não ser recolhido pelo lixo e o ecrã
// não voltar a apagar-se sozinho. O tipo exato varia entre browsers — `any`
// evita depender de uma lib de tipos que pode não estar ligada.
let bloqueioEcra: any = null

async function segurarEcra(): Promise<void> {
  try {
    // Onde não existir a API não faz mal: o tablet trata do brilho pelas
    // definições dele (pôr o ecrã a "nunca desligar").
    bloqueioEcra = (await (navigator as any).wakeLock?.request('screen')) ?? null
    // O sistema larga o bloqueio de cada vez que a app se esconde; esquecê-lo
    // aqui para o voltarmos a pedir quando a estação regressa a primeiro plano.
    bloqueioEcra?.addEventListener?.('release', () => {
      bloqueioEcra = null
    })
  } catch {
    // Pedido negado ou indisponível. Não é motivo para partir o arranque.
  }
}

/**
 * Liga o modo quiosque. Chama-se uma vez, no arranque (ver `main.tsx`).
 */
export function ativarModoQuiosque(): void {
  // 1) Ecrã sempre aceso — e a reganhar o bloqueio quando o tablet volta a
  //    primeiro plano, porque o sistema larga-o de cada vez que a app se esconde.
  void segurarEcra()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void segurarEcra()
  })

  // 2) Menu do toque longo / botão direito: não há aqui nada para copiar nem
  //    para abrir noutro lado, e o menu só serviria para o cliente se perder.
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  // 3) Zoom por pinça no iOS. No Android o viewport (`user-scalable=no`) e o
  //    `touch-action` do CSS já o barram; o iOS ignora o viewport dentro de uma
  //    app instalada, por isso fecha-se a porta também por aqui.
  document.addEventListener('gesturestart', (e) => e.preventDefault())
}
