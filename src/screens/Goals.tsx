import { useNavigate } from 'react-router-dom'
import { Button, Frame } from '../components/ui'
import { goals } from '../data/goals'
import { useSession } from '../state/session'
import { track } from '../services/telemetry'
import { legal } from '../data/legal'
import type { GoalId } from '../types'

export function Goals() {
  const navigate = useNavigate()
  const { selectGoal } = useSession()

  const choose = (goal: GoalId) => {
    selectGoal(goal)
    track({ type: 'goal_selected', goal })
    navigate('/recommendations')
  }

  return (
    <Frame
      legal={legal.advice}
      actions={
        <Button variant="ghost" onClick={() => navigate('/kiosk')} label="Recomeçar">
          ⟳
        </Button>
      }
    >
      <p className="eyebrow">Vamos encontrar a melhor opção</p>
      <h1 className="title">O que procura hoje?</h1>
      <p className="subtitle">Escolha o objetivo que mais combina com este momento.</p>

      <div className="grid grid--goals">
        {/*
          Nenhum objetivo é desativado.
          A loja tem sempre alguma coisa a propor para cada objetivo — logo há
          sempre resposta para dar. Bloquear uma escolha aqui era mandar embora
          um cliente que estava a dois passos de comprar.
        */}
        {goals.map((goal, i) => (
          <button
            key={goal.id}
            type="button"
            className="card"
            onClick={() => choose(goal.id)}
          >
            <span className="card__index">{String(i + 1).padStart(2, '0')}</span>
            <span className="card__icon" aria-hidden="true">
              {goal.icon}
            </span>
            <h2 className="card__title">{goal.label}</h2>
            <p className="card__text">{goal.hint}</p>
          </button>
        ))}
      </div>
    </Frame>
  )
}
