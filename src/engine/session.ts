import { randomUUID } from 'node:crypto'
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

const NUMERIC_CHARSET = '0123456789'
const ALPHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const ALPHANUMERIC_CHARSET = ALPHA_CHARSET + '23456789'

export interface CreateSessionOptions {
  id?: string
  joinCode?: string
}

export interface ResolveAnswerInput {
  teamId: string
  correct: boolean

  elapsedMs?: number
  isSteal?: boolean
  wager?: number
}

export interface AdvanceRoundInput {

  eliminateTeamId?: string
}

function charsetFor(kind: GameShowConfig['join']['codeCharset']): string {
  switch (kind) {
    case 'alpha': return ALPHA_CHARSET
    case 'alphanumeric': return ALPHANUMERIC_CHARSET
    default: return NUMERIC_CHARSET
  }
}

function generateJoinCode(config: GameShowConfig): string {
  const charset = charsetFor(config.join.codeCharset)
  let code = ''
  for (let i = 0; i < config.join.codeLength; i++) {
    code += charset[Math.floor(Math.random() * charset.length)] ?? '0'
  }
  return code
}

function initialTeams(config: GameShowConfig): TeamState[] {
  return config.teams.teams.map(team => ({
    id: team.id,
    name: team.name,
    color: team.color,
    score: team.startingScore ?? 0,
    streak: 0,
    lifelinesUsed: {},
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
    id: options.id ?? randomUUID(),
    joinCode: options.joinCode ?? generateJoinCode(snapshot),
    config: snapshot,
    phase: 'lobby',
    roundIndex: 0,
    currentQuestionId: null,
    consumed: new Set<string>(),
    teams: initialTeams(snapshot),
    players: [],
    buzzes: [],
    turnTeamId: null,
    attemptsUsed: 0,
    lockedOutTeamIds: new Set<string>(),
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
  const elapsedMs = input.elapsedMs
    ?? (state.clockStartedAt === null ? 0 : Date.now() - state.clockStartedAt)

  const deltas = scoring.score({
    state,
    rules,
    question,
    teamId: input.teamId,
    correct: input.correct,
    elapsedMs,
    isSteal: input.isSteal ?? false,
    wager: input.wager,
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
    const remaining = state.teams.filter(t => !t.eliminated)

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
