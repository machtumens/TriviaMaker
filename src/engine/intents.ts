import type {
  Intent, SessionState, TeamState,
} from '../registry/index'
import type { GameShowConfig, Question } from '../config/types'
import { rulesForQuestion, rulesForRound } from '../config/resolve'
import { assertTransition } from './phase'

const MS_PER_SECOND = 1000

export const INTENT_TOUCHED_KEYS: Record<Intent['type'], (keyof SessionState)[]> = {
  setPhase: ['phase'],
  awardPoints: ['teams'],
  consumeQuestion: ['consumed'],
  selectQuestion: ['currentQuestionId'],
  setTurn: ['turnTeamId'],
  lockout: ['lockedOutTeamIds'],
  startClock: ['clockStartedAt'],
  stopClock: ['clockStartedAt'],

  playSound: [],
  effect: [],
  eliminate: ['teams'],
  setStyleState: ['styleState'],

  advanceRound: ['roundIndex', 'styleState'],

  custom: [],
}

export function findQuestion(config: GameShowConfig, questionId: string): Question | null {
  for (const bank of config.content.banks) {
    for (const category of bank.categories) {
      for (const question of category.questions) {
        if (question.id === questionId) return question
      }
    }
  }
  return null
}

export function resolvedQuestionSec(
  config: GameShowConfig,
  state: SessionState,
): number | null {
  const round = config.program.rounds[state.roundIndex]
  if (!round) return null
  const question = state.currentQuestionId
    ? findQuestion(config, state.currentQuestionId)
    : null
  const rules = question
    ? rulesForQuestion(config, round, question)
    : rulesForRound(config, round)
  return rules.timer.questionSec
}

function replaceTeam(
  teams: readonly TeamState[],
  teamId: string,
  update: (team: TeamState) => TeamState,
): readonly TeamState[] {
  return teams.map(team => (team.id === teamId ? update(team) : team))
}

function withAdded(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set)
  next.add(value)
  return next
}

function assertNever(value: never): never {
  throw new Error(`[intents] unhandled intent: ${JSON.stringify(value)}`)
}

export function applyIntent(state: SessionState, intent: Intent): SessionState {
  switch (intent.type) {
    case 'setPhase':
      assertTransition(state.phase, intent.phase)
      return { ...state, phase: intent.phase }

    case 'awardPoints':
      return {
        ...state,
        teams: replaceTeam(state.teams, intent.teamId, team => ({
          ...team,
          score: team.score + intent.delta,
        })),
      }

    case 'consumeQuestion':
      return { ...state, consumed: withAdded(state.consumed, intent.questionId) }

    case 'selectQuestion':
      return { ...state, currentQuestionId: intent.questionId }

    case 'setTurn':
      return { ...state, turnTeamId: intent.teamId }

    case 'lockout':
      return { ...state, lockedOutTeamIds: withAdded(state.lockedOutTeamIds, intent.teamId) }

    case 'startClock': {
      const questionSec = resolvedQuestionSec(state.config, state)
      if (questionSec === null) {
        return { ...state, clockStartedAt: null }
      }
      return {
        ...state,
        clockStartedAt: Date.now() - (questionSec * MS_PER_SECOND - intent.ms),
      }
    }

    case 'stopClock':
      return { ...state, clockStartedAt: null }

    case 'playSound':
    case 'effect':
    case 'custom':
      return { ...state }

    case 'eliminate':
      return {
        ...state,
        teams: replaceTeam(state.teams, intent.teamId, team => ({ ...team, eliminated: true })),
      }

    case 'setStyleState':

      return { ...state, styleState: intent.nextStyleState }

    case 'advanceRound': {
      const nextIndex = state.roundIndex + 1
      if (nextIndex > state.config.program.rounds.length - 1) return { ...state }

      return { ...state, roundIndex: nextIndex, styleState: {} }
    }

    default:
      return assertNever(intent)
  }
}
