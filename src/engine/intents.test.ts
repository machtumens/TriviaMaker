/**
 * Intent application — PLAN Sub-Phase 2 (item 7).
 *
 * Two things are proven per intent type:
 *   1. the keys `INTENT_TOUCHED_KEYS` declares actually change, and
 *   2. every OTHER top-level key is reference-equal (===) to the input's.
 *
 * (2) is the real assertion. If an intent quietly reallocates an untouched key
 * the snapshot-diff undo in `log.ts` still "works", but the log fills with
 * bogus diffs and reconnect/replay start disagreeing about state identity.
 */

import assert from 'node:assert/strict'
import { INTENT_TOUCHED_KEYS, applyIntent } from './intents'
import { resolveConfig } from '../config/resolve'
import type { Intent, SessionState } from '../registry/index'
import type { GameShowConfig, Round } from '../config/types'

const ROUND: Round = {
  id: 'r1',
  title: 'Round 1',
  bankId: 'bank',
  style: {
    kind: 'grid', columns: 1, rows: 1, pointLadder: [100],
    selection: 'freePick', showCategoryHeaders: true,
    consumedStyle: 'dim', dramaticCategoryReveal: false,
  },
}

const CONFIG: GameShowConfig = (() => {
  const base = resolveConfig({ meta: { id: 'intents', title: 'Intents' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: {
      banks: [{
        id: 'bank',
        title: 'Bank',
        categories: [{
          id: 'cat',
          title: 'Cat',
          questions: [{ id: 'q1', kind: 'text', prompt: 'P1', answer: 'A1', points: 100 }],
        }],
      }],
    },
  }
})()

/**
 * A 5-round variant of `CONFIG`. Needed from T2.2 on: `applyIntent`'s
 * `advanceRound` case is now BOUNDED, so the default single-round `CONFIG`
 * makes `roundIndex: 0` already the last valid index and every advance a no-op.
 * Blocks that mean to exercise a REAL advance must say so with this fixture.
 */
const CONFIG_MULTI_ROUND: GameShowConfig = {
  ...CONFIG,
  program: {
    ...CONFIG.program,
    rounds: ['r0', 'r1', 'r2', 'r3', 'r4'].map(id => ({ ...ROUND, id })),
  },
}

const CLOCK_SENTINEL = 1

function makeState(): SessionState {
  return {
    id: 'session',
    joinCode: '000000',
    config: CONFIG,
    phase: 'board',
    roundIndex: 0,
    currentQuestionId: 'q1',
    consumed: new Set<string>(),
    teams: [
      { id: 'a', name: 'A', color: '#f00', score: 10, streak: 0, lifelinesUsed: {}, eliminated: false },
      { id: 'b', name: 'B', color: '#0f0', score: 20, streak: 0, lifelinesUsed: {}, eliminated: false },
    ],
    players: [],
    buzzes: [],
    turnTeamId: null,
    attemptsUsed: 0,
    lockedOutTeamIds: new Set<string>(),
    clockStartedAt: CLOCK_SENTINEL,
    styleState: {},
    log: [],
  }
}

/**
 * Apply one intent and assert the touched/untouched split declared by
 * `INTENT_TOUCHED_KEYS` is exactly what happened.
 *
 * `stateOverride` exists for intents whose behaviour depends on state the
 * default fixture does not carry — `advanceRound` needs a multi-round config to
 * do anything at all now that it is bounded.
 */
function applyAndCheck(
  intent: Intent,
  stateOverride: Partial<SessionState> = {},
): { before: SessionState; after: SessionState } {
  const before: SessionState = { ...makeState(), ...stateOverride }
  const after = applyIntent(before, intent)
  const touched = new Set<string>(INTENT_TOUCHED_KEYS[intent.type])

  for (const key of Object.keys(before) as Array<keyof SessionState>) {
    if (touched.has(key)) {
      assert.notEqual(
        after[key], before[key],
        `${intent.type}: declared-touched key "${key}" should be a new value`,
      )
    } else {
      assert.equal(
        after[key], before[key],
        `${intent.type}: untouched key "${key}" must be reference-equal`,
      )
    }
  }
  return { before, after }
}

// --- setPhase ---------------------------------------------------------------
{
  const { after } = applyAndCheck({ type: 'setPhase', phase: 'reading' })
  assert.equal(after.phase, 'reading', 'setPhase moves the phase')
}
{
  assert.throws(
    () => applyIntent(makeState(), { type: 'setPhase', phase: 'lobby' }),
    /illegal transition "board" -> "lobby"/,
    'an illegal setPhase target is rejected by assertTransition',
  )
}

// --- awardPoints ------------------------------------------------------------
{
  const { before, after } = applyAndCheck({
    type: 'awardPoints', teamId: 'a', delta: 100, reason: 'correct answer',
  })
  assert.equal(after.teams[0]?.score, 110, 'the awarded team gains the delta')
  assert.equal(after.teams[1]?.score, 20, 'other teams are untouched')
  assert.equal(after.teams[1], before.teams[1], 'untouched team objects are not reallocated')
  assert.equal(before.teams[0]?.score, 10, 'the input state is not mutated')
}

// --- consumeQuestion --------------------------------------------------------
{
  const { before, after } = applyAndCheck({ type: 'consumeQuestion', questionId: 'q1' })
  assert.equal(after.consumed.has('q1'), true, 'the question is marked consumed')
  assert.equal(before.consumed.has('q1'), false, 'the input Set is not mutated')
}

// --- selectQuestion ---------------------------------------------------------
{
  const { after } = applyAndCheck({ type: 'selectQuestion', questionId: 'q-other' })
  assert.equal(after.currentQuestionId, 'q-other', 'the selected question is recorded')
}

// --- setTurn ----------------------------------------------------------------
{
  const { after } = applyAndCheck({ type: 'setTurn', teamId: 'b' })
  assert.equal(after.turnTeamId, 'b', 'the turn owner is recorded')
}

// --- lockout ----------------------------------------------------------------
{
  const { before, after } = applyAndCheck({ type: 'lockout', teamId: 'a' })
  assert.equal(after.lockedOutTeamIds.has('a'), true, 'the team is locked out')
  assert.equal(before.lockedOutTeamIds.has('a'), false, 'the input Set is not mutated')
}

// --- startClock -------------------------------------------------------------
{
  const QUESTION_SEC = 30
  const REMAINING_MS = 12_000
  const { after } = applyAndCheck({ type: 'startClock', ms: REMAINING_MS })
  assert.notEqual(after.clockStartedAt, null, 'a timed question gets a clock anchor')
  const elapsed = Date.now() - (after.clockStartedAt ?? 0)
  const remaining = QUESTION_SEC * 1000 - elapsed
  assert.ok(
    Math.abs(remaining - REMAINING_MS) < 1000,
    `resume anchors the clock at the requested remaining time (got ${remaining}ms)`,
  )
}
{
  // Untimed question (questionSec: null) must no-op rather than coerce null*1000.
  const base = makeState()
  const untimedConfig: GameShowConfig = {
    ...CONFIG,
    rules: { ...CONFIG.rules, timer: { ...CONFIG.rules.timer, questionSec: null } },
  }
  const state: SessionState = { ...base, config: untimedConfig }
  const after = applyIntent(state, { type: 'startClock', ms: 5000 })
  assert.equal(after.clockStartedAt, null, 'an untimed question has no clock to resume')
}

// --- stopClock --------------------------------------------------------------
{
  const { after } = applyAndCheck({ type: 'stopClock' })
  assert.equal(after.clockStartedAt, null, 'stopClock clears the anchor')
}

// --- eliminate --------------------------------------------------------------
{
  const { before, after } = applyAndCheck({ type: 'eliminate', teamId: 'b' })
  assert.equal(after.teams[1]?.eliminated, true, 'the team is eliminated')
  assert.equal(after.teams[0], before.teams[0], 'other team objects are not reallocated')
  assert.equal(before.teams[1]?.eliminated, false, 'the input state is not mutated')
}

// --- setStyleState ----------------------------------------------------------
{
  const NEXT = { revealedSlots: ['a', 'b'], ownership: { c1: 'teamA' } }
  const { after } = applyAndCheck({ type: 'setStyleState', nextStyleState: NEXT })
  assert.deepEqual(after.styleState, NEXT, 'the intent\'s value becomes the new styleState')
  // Documents a sharp edge rather than endorsing it: the intent's object is
  // adopted BY REFERENCE, so a caller that keeps and later mutates it would
  // rewrite live state and the logged audit copy alike. Emitters must hand over
  // a freshly-built object. Change this assertion if defensive cloning is ever
  // added — it is here so that change is a deliberate one, not a silent one.
  assert.equal(after.styleState, NEXT, 'adopted by reference, not copied')
}
{
  // Replacement, not a merge — a style must be able to DELETE one of its keys.
  const before: SessionState = { ...makeState(), styleState: { stale: 1, alsoStale: 2 } }
  const after = applyIntent(before, { type: 'setStyleState', nextStyleState: { fresh: 3 } })
  assert.deepEqual(after.styleState, { fresh: 3 }, 'the previous keys are gone, not merged')
}

// --- advanceRound -----------------------------------------------------------
{
  const { before, after } = applyAndCheck({ type: 'advanceRound' }, { config: CONFIG_MULTI_ROUND })
  assert.equal(after.roundIndex, before.roundIndex + 1, 'advanceRound moves to the next round')
  assert.deepEqual(after.styleState, {}, 'and clears styleState')
}
{
  // The reset matters most when there IS something to clear.
  const before: SessionState = {
    ...makeState(),
    config: CONFIG_MULTI_ROUND,
    roundIndex: 3,
    styleState: { revealed: ['x'], guesses: 4 },
  }
  const after = applyIntent(before, { type: 'advanceRound' })
  assert.equal(after.roundIndex, 4, 'roundIndex increments from a non-zero value')
  assert.deepEqual(after.styleState, {}, 'a populated styleState is cleared at the round boundary')
  assert.deepEqual(
    before.styleState, { revealed: ['x'], guesses: 4 },
    'the input state is not mutated',
  )
}

// --- advanceRound: bounded at the last round (T2.2-L1 layer B) --------------
{
  // The default CONFIG has exactly 1 round, so roundIndex 0 IS the last valid
  // index — the fixture this test needs, with no override.
  const before = makeState()
  assert.equal(
    before.config.program.rounds.length - 1, before.roundIndex,
    'fixture check: the default config puts the state on its last round',
  )
  const after = applyIntent(before, { type: 'advanceRound' })
  assert.equal(
    after.roundIndex, before.roundIndex,
    'advanceRound no-ops at the last round instead of producing an out-of-range index',
  )
  assert.deepEqual(after.styleState, before.styleState, 'a no-op advance does not clear styleState either')
}
{
  // A populated styleState survives a REJECTED advance. Clearing it would be a
  // half-applied intent: the visible round never changed, but the style's state
  // for that round silently vanished.
  const before: SessionState = { ...makeState(), styleState: { revealed: ['x'] } }
  const after = applyIntent(before, { type: 'advanceRound' })
  assert.equal(after.roundIndex, 0, 'still on the last round')
  assert.deepEqual(after.styleState, { revealed: ['x'] }, 'the rejected advance left styleState alone')
}

// --- presentation-only intents touch nothing --------------------------------
{
  applyAndCheck({ type: 'playSound', key: 'buzz' })
  applyAndCheck({ type: 'effect', key: 'confettiBurst', options: { intensity: 2 } })
  applyAndCheck({ type: 'custom', key: 'anything', payload: { a: 1 } })
}

// --- the table covers the whole Intent union --------------------------------
{
  const EXPECTED: Array<Intent['type']> = [
    'setPhase', 'awardPoints', 'consumeQuestion', 'selectQuestion', 'setTurn',
    'lockout', 'startClock', 'stopClock', 'playSound', 'effect', 'eliminate',
    'setStyleState', 'advanceRound', 'custom',
  ]
  assert.deepEqual(
    Object.keys(INTENT_TOUCHED_KEYS).sort(),
    [...EXPECTED].sort(),
    'every Intent type has a touched-keys row',
  )
}

console.log('✓ intent application: all checks passed')
