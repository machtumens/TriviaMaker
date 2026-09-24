
import {
  resolve,
  type GameEvent, type Intent, type Phase, type ScoringPlugin, type SessionState,
  type StylePlugin, type TeamState,
} from '../registry/index'
import type {
  Category, GameShowConfig, RegistryKey, Round,
} from '../config/types'
import { rulesForQuestion } from '../config/resolve'
import { findQuestion } from './intents'
import { applyIntentsWithLog } from './log'

export { applyIntent, findQuestion, resolvedQuestionSec } from './intents'
export { undo } from './log'

export interface CreateSessionOptions {
  id?: string
}

export interface ResolveAnswerInput {
  teamId: string
  correct: boolean
}

export interface AdvanceRoundInput {
  eliminateTeamId?: string

  /**
   * The teams the host has sent through from a round that cuts the field
   * (`advanceTop`). Naming them replaces the score rule: everyone else on the
   * round's roster is out. It exists because "who won the heat" is a call made
   * out loud in the room — a tie, a disputed answer, a group that has to leave
   * early — and the engine should record that call, not overrule it.
   */
  advanceTeamIds?: readonly string[]
}

function initialTeams(config: GameShowConfig): TeamState[] {
  return config.teams.teams.map(team => ({
    id: team.id,
    name: team.name,
    color: team.color,
    score: team.startingScore ?? 0,
    eliminated: false,
  }))
}

export function styleKeyFor(round: Round): RegistryKey {
  return round.style.kind === 'custom' ? round.style.plugin : round.style.kind
}

export function currentRound(config: GameShowConfig, roundIndex: number): Round {
  const round = config.program.rounds[roundIndex]
  if (!round) {
    throw new Error(
      `[session] no round at index ${roundIndex}; program.rounds has ${config.program.rounds.length}`,
    )
  }
  return round
}

export function createSession(
  config: GameShowConfig,
  options: CreateSessionOptions = {},
): SessionState {
  const snapshot = structuredClone(config)
  return {
    id: options.id ?? crypto.randomUUID(),
    config: snapshot,
    phase: 'lobby',
    roundIndex: 0,
    currentQuestionId: null,
    consumed: new Set<string>(),
    teams: initialTeams(snapshot),
    clockStartedAt: null,
    styleState: {},
    log: [],
  }
}

export function resolveRoundContent(config: GameShowConfig, round: Round): Category[] {
  if (round.bankId === undefined) {
    throw new Error(
      `[session] round "${round.id}": no bankId set; a grid-style round requires round.bankId`,
    )
  }

  const bank = config.content.banks.find(b => b.id === round.bankId)
  if (!bank) {
    const known = config.content.banks.map(b => b.id).join(', ') || '(none)'
    throw new Error(
      `[session] round "${round.id}": bankId "${round.bankId}" not found in content.banks. Known banks: ${known}`,
    )
  }

  if (round.categoryIds === undefined) {
    const result = bank.categories
    if (result.length === 0) {
      throw new Error(
        `[session] round "${round.id}": bank "${round.bankId}" has zero categories`,
      )
    }
    return result
  }

  if (round.categoryIds.length === 0) {
    throw new Error(
      `[session] round "${round.id}": categoryIds is an empty array — a grid-style round requires at least one category`,
    )
  }

  const result: Category[] = []
  for (const id of round.categoryIds) {
    const category = bank.categories.find(c => c.id === id)
    if (!category) {
      const known = bank.categories.map(c => c.id).join(', ')
      throw new Error(
        `[session] round "${round.id}": categoryIds references unknown category "${id}" in bank "${round.bankId}". Known categories: ${known}`,
      )
    }

    result.push(category)
  }
  return result
}

export function dispatchHostAction(
  state: SessionState,
  intents: Intent[],
  seq: number,
  at: number,
): { state: SessionState; event: GameEvent } {
  return applyIntentsWithLog(state, intents, seq, at)
}

export function resolveAnswer(state: SessionState, input: ResolveAnswerInput): Intent[] {
  const round = currentRound(state.config, state.roundIndex)
  const questionId = state.currentQuestionId
  if (questionId === null) {
    throw new Error(`[session] round "${round.id}": no question is selected; cannot resolve an answer`)
  }
  const question = findQuestion(state.config, questionId)
  if (!question) {
    throw new Error(`[session] question "${questionId}" is not present in the session's content snapshot`)
  }

  const rules = rulesForQuestion(state.config, round, question)
  const scoring = resolve<ScoringPlugin>('scoring', rules.scoring.engine)

  const deltas = scoring.score({
    state,
    rules,
    question,
    teamId: input.teamId,
    correct: input.correct,
  })

  const style = resolve<StylePlugin>('style', styleKeyFor(round))

  return [
    ...deltas.map((delta): Intent => ({
      type: 'awardPoints',
      teamId: delta.teamId,
      delta: delta.delta,
      reason: delta.reason,
    })),
    { type: 'consumeQuestion', questionId },
    ...style.onResolved(state, input.correct),

    { type: 'setPhase', phase: 'reveal' },
  ]
}

/**
 * Who is actually playing a round: still in the show, and on the round's team
 * list if it has one. Heats eliminate inside this set, never outside it.
 */
export function rosterFor(round: Round, teams: readonly TeamState[]): TeamState[] {
  const live = teams.filter(team => !team.eliminated)
  if (!round.teamIds || round.teamIds.length === 0) return live
  const allowed = new Set(round.teamIds)
  return live.filter(team => allowed.has(team.id))
}

export function advanceToNextRound(state: SessionState, input: AdvanceRoundInput = {}): Intent[] {
  if (state.phase !== 'reveal') {
    throw new Error(`[session] advanceToNextRound: phase must be "reveal", got "${state.phase}"`)
  }

  const round = currentRound(state.config, state.roundIndex)
  const rounds = state.config.program.rounds

  if (state.roundIndex >= rounds.length - 1) {
    throw new Error(
      `[session] round "${round.id}" is the last round; call "endRound" (setPhase: 'final'), not "advanceRound"`,
    )
  }

  const intents: Intent[] = []
  let remainingCount = state.teams.filter(t => !t.eliminated).length

  if (round.eliminateLowest) {
    const remaining = rosterFor(round, state.teams)

    if (remaining.length > 1) {
      const lowestScore = Math.min(...remaining.map(t => t.score))
      const candidates = remaining.filter(t => t.score === lowestScore)
      let chosen: TeamState | undefined
      if (candidates.length === 1) {
        chosen = candidates[0]!
      } else {
        chosen = input.eliminateTeamId
          ? candidates.find(t => t.id === input.eliminateTeamId)
          : undefined
        if (!chosen) {
          const names = candidates.map(t => `${t.name} (${t.id})`).join(', ')
          throw new Error(
            `[session] round "${round.id}": eliminateLowest tie between ${candidates.length} teams — ${names}. Resend "advanceRound" with eliminateTeamId set to one of these ids.`,
          )
        }
      }
      intents.push({ type: 'eliminate', teamId: chosen.id })
      remainingCount -= 1
    }
  }

  // A cut keeps the top N by score. Everyone strictly below the lowest surviving
  // score is out; a tie on that line advances all of them, because dropping one
  // tied team on the engine's own authority is exactly the call a host has to make
  // out loud in the room.
  if (round.advanceTop !== undefined) {
    const standing = rosterFor(round, state.teams)
      .filter(t => !intents.some(i => i.type === 'eliminate' && i.teamId === t.id))

    const chosen = input.advanceTeamIds
    if (chosen !== undefined && chosen.length > 0) {
      const inRound = new Set(standing.map(t => t.id))
      const unknown = chosen.filter(id => !inRound.has(id))
      if (unknown.length > 0) {
        throw new Error(
          `[session] round "${round.id}": cannot send ${unknown.join(', ')} through — ` +
          `not playing this round. Playing: ${standing.map(t => t.id).join(', ')}.`,
        )
      }
      const going = new Set(chosen)
      for (const team of standing) {
        if (!going.has(team.id)) {
          intents.push({ type: 'eliminate', teamId: team.id })
          remainingCount -= 1
        }
      }
    } else if (standing.length > round.advanceTop && round.advanceTop > 0) {
      const ranked = [...standing].sort((a, b) => b.score - a.score)
      const lowestSurviving = ranked[round.advanceTop - 1]!.score
      for (const team of ranked) {
        if (team.score < lowestSurviving) {
          intents.push({ type: 'eliminate', teamId: team.id })
          remainingCount -= 1
        }
      }
    }
  }

  if (!state.config.program.carryScores) {
    for (const team of state.teams) {
      if (team.score !== 0) {
        intents.push({
          type: 'awardPoints', teamId: team.id, delta: -team.score,
          reason: 'round boundary: scores reset (program.carryScores is false)',
        })
      }
    }
  }

  let candidateIndex = state.roundIndex + 1
  while (
    candidateIndex < rounds.length
    && rounds[candidateIndex]!.minTeams !== undefined
    && remainingCount < rounds[candidateIndex]!.minTeams!
  ) {
    candidateIndex++
  }

  const enteredRound = rounds[candidateIndex]
  if (!enteredRound) {
    intents.push({ type: 'setPhase', phase: 'final' })
    return intents
  }

  const advances = candidateIndex - state.roundIndex
  for (let i = 0; i < advances; i++) intents.push({ type: 'advanceRound' })

  const target: Phase = round.intermissionAfter?.enabled
    ? 'intermission'
    : enteredRound.intro?.enabled ? 'roundIntro' : 'board'
  intents.push({ type: 'setPhase', phase: target })

  return intents
}
