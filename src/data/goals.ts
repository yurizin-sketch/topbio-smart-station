import type { Goal } from '../types'

/**
 * Taxonomia de objetivos.
 *
 * Nota legal: estes rótulos são ferramentas de navegação, não alegações.
 * "Sono e calma" descreve o que a pessoa procura, não o que o produto faz.
 * O Reg. (UE) 432/2012 só permite alegações de saúde da lista autorizada,
 * por isso nenhum texto aqui pode prometer um efeito fisiológico.
 */
export const goals: Goal[] = [
  {
    id: 'sono',
    label: 'Sono e calma',
    hint: 'Para a rotina do fim do dia',
    icon: '🌙',
  },
  {
    id: 'energia',
    label: 'Energia',
    hint: 'Para o dia a dia ativo',
    icon: '⚡',
  },
  {
    id: 'performance',
    label: 'Performance',
    hint: 'Para quem treina com regularidade',
    icon: '🏃',
  },
  {
    id: 'beleza',
    label: 'Beleza e longevidade',
    hint: 'Pele, cabelo e unhas',
    icon: '✨',
  },
  {
    id: 'imunidade',
    label: 'Imunidade',
    hint: 'Para as épocas mais exigentes',
    icon: '🛡️',
  },
  {
    id: 'peso',
    label: 'Controlo de peso',
    hint: 'Para acompanhar uma rotina equilibrada',
    icon: '⚖️',
  },
  {
    id: 'foco',
    label: 'Foco e memória',
    hint: 'Para dias de muita exigência mental',
    icon: '🧠',
  },
  {
    id: 'mobilidade',
    label: 'Articulações',
    hint: 'Para quem quer manter-se em movimento',
    icon: '🦵',
  },
]

export function goalById(id: GoalIdLike): Goal | undefined {
  return goals.find((g) => g.id === id)
}

type GoalIdLike = Goal['id'] | string | null
