/**
 * INTENT APPLICATION — the only place `SessionState` changes shape.
 *
 * Plugins never mutate state; they return `Intent[]` and the engine applies
 * them here. Two rules make undo, replay and dispute-audit work at all:
 *
 *   1. `applyIntent` is PURE — it returns a new object and never writes to its
 *      argument or anything reachable from it.
 *   2. Every intent type declares WHICH top-level `SessionState` keys it can
 *      touch (`INTENT_TOUCHED_KEYS`). That declaration is DATA, not code: the
 *      generic snapshot-diff undo in `log.ts` reads it to know what to save.
 *      There is no hand-written inverse operation for any intent, anywhere.
 *
 * Design Locks L2 / L2a.
 */

import type {
  Intent, SessionState, TeamState,
} from '../registry/index'
import type { GameShowConfig, Question } from '../config/types'
import { rulesForQuestion, rulesForRound } from '../config/resolve'
import { assertTransition } from './phase'

const MS_PER_SECOND = 1000

/**
 * Which top-level `SessionState` keys each intent type may write.
 *
 * Deliberately minimal: an over-listed key costs a wasted snapshot entry, but
 * an under-listed key silently breaks undo. Entries with no keys are
 * presentation-only intents that never touch engine state.
 */
export const INTENT_TOUCHED_KEYS: Record<Intent['type'], (keyof SessionState)[]> = {
  setPhase: ['phase'],
  awardPoints: ['teams'],
  consumeQuestion: ['consumed'],
  selectQuestion: ['currentQuestionId'],
  setTurn: ['turnTeamId'],
  lockout: ['lockedOutTeamIds'],
  startClock: ['clockStartedAt'],
  stopClock: ['clockStartedAt'],
  // presentation-only — no engine state is touched
  playSound: [],
  effect: [],
  eliminate: ['teams'],
  setStyleState: ['styleState'],
  // The first intent to declare TWO keys in one entry. `log.ts` unions the keys
  // of a whole batch before snapshotting, so both rewind in a single undo.
  advanceRound: ['roundIndex', 'styleState'],
  // no generic way to know what a custom intent touches. Known limitation:
  // a custom intent is not undoable in T1 (PLAN Open Items).
  custom: [],
}

/** Find a question anywhere in the config's banks. `null` when unknown. */
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

/**
 * The countdown length in effect right now, following the full cascade
 * (event -> round -> question). `null` means the question is untimed.
 *
 * Shared by `applyIntent`'s clock arithmetic and by the broadcast payload, so
 * the engine and the on-screen countdown can never disagree about the limit.
 */
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

/**
 * Apply one intent. Pure: returns a new state object whose untouched top-level
 * values are reference-identical to the input's.
 */
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
      // Anchor the clock so `questionSec - (now - clockStartedAt)` equals the
      // requested remaining time. Naively stamping `Date.now()` here would
      // silently restart a paused question's countdown from full.
      const questionSec = resolvedQuestionSec(state.config, state)
      if (questionSec === null) {
        // Untimed question: there is no countdown to resume, so pause/resume
        // is a no-op. Without this guard `null * 1000` coerces to 0 and
        // produces a nonsense future-dated anchor.
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
      // Wholesale replacement, not a merge: the style owns the whole bag, and a
      // merge would make "delete a key" impossible to express as an intent.
      return { ...state, styleState: intent.nextStyleState }

    case 'advanceRound': {
      // T2.2-L1 layer B: belt-and-braces bound. `session.ts`'s
      // `advanceToNextRound` (layer A) is expected to prevent this from ever
      // being reached out of range in normal operation — this no-op is the
      // defensive backstop so a future direct-dispatch caller can never push
      // `roundIndex` past the last valid `program.rounds` index. An
      // out-of-range index does not fail here: it fails on the NEXT
      // `broadcastState`, which is a live-show-ending crash a frame after the
      // click rather than a rejected click.
      const nextIndex = state.roundIndex + 1
      if (nextIndex > state.config.program.rounds.length - 1) return { ...state }
      // Clearing `styleState` here is the engine-level safety net against one
      // round's style state bleeding into the next (see `SessionState`).
      return { ...state, roundIndex: nextIndex, styleState: {} }
    }

    default:
      return assertNever(intent)
  }
}
