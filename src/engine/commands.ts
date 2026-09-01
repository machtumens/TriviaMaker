import { resolve, type Intent, type SessionState, type StylePlugin } from '../registry/index'
import { resolvedQuestionSec } from './intents'
import { advanceToNextRound, currentRound, resolveAnswer, styleKeyFor } from './session'

const MS_PER_SECOND = 1000

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[commands] command field "${field}" must be a non-empty string`)
  }
  return value
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[commands] command field "${field}" must be a finite number`)
  }
  return value
}

export function intentsForCommand(state: SessionState, type: string, payload: unknown): Intent[] {
  const fields = (payload ?? {}) as Record<string, unknown>

  switch (type) {
    case 'start':
      return [{ type: 'setPhase', phase: 'board' }]

    case 'select': {
      const round = currentRound(state.config, state.roundIndex)
      const style = resolve<StylePlugin>('style', styleKeyFor(round))
      return style.onSelect(state, requireString(fields['questionId'], 'select.questionId'))
    }

    case 'arm': {
      const questionSec = resolvedQuestionSec(state.config, state)
      const intents: Intent[] = []
      if (questionSec !== null) intents.push({ type: 'startClock', ms: questionSec * MS_PER_SECOND })
      intents.push({ type: 'setPhase', phase: 'armed' })
      return intents
    }

    case 'markCorrect':
    case 'markWrong':
      return resolveAnswer(state, {
        teamId: requireString(fields['teamId'], `${type}.teamId`),
        correct: type === 'markCorrect',
      })

    case 'next':
      return [{ type: 'setPhase', phase: 'board' }]

    case 'advanceRound': {
      const eliminateTeamId = typeof fields['eliminateTeamId'] === 'string'
        ? fields['eliminateTeamId']
        : undefined
      return advanceToNextRound(state, { eliminateTeamId })
    }

    case 'continue': {
      if (state.phase === 'intermission') {
        const round = currentRound(state.config, state.roundIndex)
        return [{ type: 'setPhase', phase: round.intro?.enabled ? 'roundIntro' : 'board' }]
      }
      if (state.phase === 'roundIntro') return [{ type: 'setPhase', phase: 'board' }]
      throw new Error(`[commands] "continue" is not valid from phase "${state.phase}"`)
    }

    case 'endRound':
      return [{ type: 'setPhase', phase: 'final' }]

    case 'pause':
      return [{ type: 'stopClock' }]

    case 'resume':
      return [{ type: 'startClock', ms: requireNumber(fields['ms'], 'resume.ms') }]

    default:
      throw new Error(`[commands] unknown command "${type}"`)
  }
}
