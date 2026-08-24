/**
 * SESSION — the engine's public surface.
 *
 * Three responsibilities, deliberately kept small:
 *
 *   1. `createSession` snapshots the resolved config into the session
 *      (invariant #2 — an editor edit mid-show must never mutate a live board).
 *   2. `dispatchHostAction` is the ONLY call site of `applyIntentsWithLog`
 *      anywhere in the codebase (Design Lock L16). Routing every host action
 *      through one function is what makes "one press = one undo" a structural
 *      guarantee rather than a convention every future call site must remember.
 *   3. `resolveRoundContent` turns a round's `bankId`/`categoryIds` into the
 *      real `Category[]` a style needs, and fails loudly on bad authoring
 *      rather than silently rendering an empty board on stage.
 */

import { randomUUID } from 'node:crypto'
import {
  resolve,
  type GameEvent, type Intent, type ScoringPlugin, type SessionState,
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
  /** ms from arming to answer. Derived from the clock anchor when omitted. */
  elapsedMs?: number
  isSteal?: boolean
  wager?: number
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

/** The registry key a round's style is registered under. */
export function styleKeyFor(round: Round): RegistryKey {
  return round.style.kind === 'custom' ? round.style.plugin : round.style.kind
}

/** The round currently in play. Throws rather than rendering a blank show. */
export function currentRound(config: GameShowConfig, roundIndex: number): Round {
  const round = config.program.rounds[roundIndex]
  if (!round) {
    throw new Error(
      `[session] no round at index ${roundIndex}; program.rounds has ${config.program.rounds.length}`,
    )
  }
  return round
}

/**
 * Freeze the resolved config into a new session.
 *
 * `structuredClone` is the point of this function: a shallow copy would leave
 * the live board pointing at the author's object, and a mid-show content edit
 * would silently change questions the host had already read out.
 */
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
    log: [],
  }
}

/**
 * Resolve a round's authored content references into real categories.
 *
 * Every failure path throws with the round id, the bad reference and the known
 * alternatives. An authoring typo that produced a silently-empty board would
 * only be discovered on stage.
 */
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
    // The author's explicit ordering wins over the bank's own order.
    result.push(category)
  }
  return result
}

/**
 * Apply one whole host action and log it as ONE event.
 *
 * The ONLY place `applyIntentsWithLog` is called (L16). Everything else —
 * `server.ts`, the host controller over HTTP, future tiers — comes through
 * here, which is what keeps one host press reversible by one undo press.
 */
export function dispatchHostAction(
  state: SessionState,
  intents: Intent[],
  seq: number,
  at: number,
): { state: SessionState; event: GameEvent } {
  return applyIntentsWithLog(state, intents, seq, at)
}

/**
 * The generic consume/award/advance sequence for ANY style (Design Lock L6).
 *
 * Returns intents; the caller passes the whole array to ONE
 * `dispatchHostAction` call so a single undo reverses the whole adjudication.
 * `StylePlugin.onResolved` is for style-SPECIFIC extra consequences only.
 */
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
    // Always trailing: the event name and the phase snapshot both key off it.
    { type: 'setPhase', phase: 'reveal' },
  ]
}
