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
  /** ms from arming to answer. Derived from the clock anchor when omitted. */
  elapsedMs?: number
  isSteal?: boolean
  wager?: number
}

export interface AdvanceRoundInput {
  /** Required only when Round.eliminateLowest is true AND the lowest score is tied between 2+ teams. */
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
    styleState: {},
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

/**
 * The whole round boundary as ONE host action's worth of intents (T2.2-L2).
 *
 * Everything that happens when a round ends — the `eliminateLowest`
 * elimination, the `carryScores` score reset, any `minTeams`-driven skips, the
 * round advance itself, and the entry phase of the round being entered — is one
 * returned array, dispatched through ONE `dispatchHostAction` call. That is the
 * point: if elimination were its own earlier action, taking it back would need
 * two undo presses and the projector would show a half-undone board between
 * them.
 *
 * Throws rather than returning a partial batch. A rejected command consumes no
 * `seq` (see `server.ts`), so a bad click leaves no hole in the audit trail.
 * Analogous in shape and trust level to `resolveAnswer`.
 */
export function advanceToNextRound(state: SessionState, input: AdvanceRoundInput = {}): Intent[] {
  // T2.2-L10: a string comparison, not a `buildBoard` re-verification. Whether
  // the round is actually FINISHED is the host UI's call, made from the
  // `round.isComplete` the server already shipped with the board.
  if (state.phase !== 'reveal') {
    throw new Error(`[session] advanceToNextRound: phase must be "reveal", got "${state.phase}"`)
  }

  const round = currentRound(state.config, state.roundIndex)
  const rounds = state.config.program.rounds
  // T2.2-L1 layer A. Rejecting the command here is what keeps the failure at
  // the click; `applyIntent`'s own bound is the backstop, not the front line.
  if (state.roundIndex >= rounds.length - 1) {
    throw new Error(
      `[session] round "${round.id}" is the last round; call "endRound" (setPhase: 'final'), not "advanceRound"`,
    )
  }

  const intents: Intent[] = []
  let remainingCount = state.teams.filter(t => !t.eliminated).length

  if (round.eliminateLowest) {
    const remaining = state.teams.filter(t => !t.eliminated)
    // `> 1`, not `> 0`: with one team left there is nothing to contest, and
    // with none left `Math.min(...[])` would be `-Infinity`.
    if (remaining.length > 1) {
      const lowestScore = Math.min(...remaining.map(t => t.score))
      const candidates = remaining.filter(t => t.score === lowestScore)
      let chosen: TeamState | undefined
      if (candidates.length === 1) {
        chosen = candidates[0]!
      } else {
        // T2.2-L3: a tie is never resolved by the engine picking first-in-array.
        // The host decides, and the decision is validated by set membership —
        // an id outside the tied set is rejected exactly like no id at all.
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

  // T2.2-L4: in the SAME batch, so one undo restores every team's pre-reset
  // score together with the advance.
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

  // T2.2-L5: `Round.minTeams` reads "skip this round if fewer than n teams
  // remain", so walk forward past every round that fails against the
  // POST-elimination count.
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
    // Every remaining round failed its minTeams requirement — nothing is left
    // to play. End the show WITHOUT moving roundIndex: `broadcastState` reads
    // `config.program.rounds[state.roundIndex]` unconditionally, in every phase
    // including `final`, so roundIndex must stay valid (T2.2-L1/L5). The
    // elimination and score reset above still apply; only the advance and the
    // entry-phase step are skipped.
    intents.push({ type: 'setPhase', phase: 'final' })
    return intents
  }

  // One `advanceRound` per round crossed. The batch-union undo already handles
  // a batch containing the same intent type more than once.
  const advances = candidateIndex - state.roundIndex
  for (let i = 0; i < advances; i++) intents.push({ type: 'advanceRound' })

  // The round just finished owns the intermission; the round being entered owns
  // the intro. An intermission wins — its own "continue" lands on the intro.
  const target: Phase = round.intermissionAfter?.enabled
    ? 'intermission'
    : enteredRound.intro?.enabled ? 'roundIntro' : 'board'
  intents.push({ type: 'setPhase', phase: target })

  return intents
}
