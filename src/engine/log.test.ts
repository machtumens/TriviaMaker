/**
 * Event log + generic undo — PLAN Sub-Phase 2 (item 10), SPEC AC#6.
 *
 * Cases (d) and (e) are the ones that matter most: they prove undo works at
 * HOST-ACTION granularity (Design Lock L2a). A host who presses "mark correct"
 * performs ONE action that happens to be three intents; pressing undo once must
 * put the room back exactly where it was, not two-thirds of the way.
 */

import assert from 'node:assert/strict'
import { applyIntentsWithLog, undo } from './log'
import { resolveConfig } from '../config/resolve'
import type { GameEvent, Intent, Phase, SessionState } from '../registry/index'
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
  const base = resolveConfig({ meta: { id: 'log', title: 'Log' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: {
      banks: [{
        id: 'bank', title: 'Bank',
        categories: [{
          id: 'cat', title: 'Cat',
          questions: [{ id: 'q1', kind: 'text', prompt: 'P1', answer: 'A1', points: 100 }],
        }],
      }],
    },
  }
})()

/**
 * A 4-round variant of `CONFIG`. From T2.2 on, `applyIntent`'s `advanceRound`
 * case is BOUNDED by `program.rounds.length`, so any block that parks
 * `roundIndex` above 0 and expects a REAL advance must supply a config with
 * enough rounds to make that advance legal.
 */
const MULTI_ROUND_CONFIG: GameShowConfig = {
  ...CONFIG,
  program: {
    ...CONFIG.program,
    rounds: ['r1', 'r2', 'r3', 'r4'].map(id => ({ ...ROUND, id })),
  },
}

const START_SCORE = 10

function makeState(phase: Phase = 'board'): SessionState {
  return {
    id: 'session',
    joinCode: '000000',
    config: CONFIG,
    phase,
    roundIndex: 0,
    currentQuestionId: null,
    consumed: new Set<string>(),
    teams: [
      { id: 'a', name: 'A', color: '#f00', score: START_SCORE, streak: 0, lifelinesUsed: {}, eliminated: false },
    ],
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

function reversedSeqs(log: readonly GameEvent[]): Set<number> {
  const seqs = new Set<number>()
  for (const event of log) {
    const target = event.payload['reversalOf']
    if (typeof target === 'number') seqs.add(target)
  }
  return seqs
}

const DEPTH = 50

// --- (a) single-intent action: undo restores, log grows -------------------
{
  const before = makeState()
  const applied = applyIntentsWithLog(
    before,
    [{ type: 'awardPoints', teamId: 'a', delta: 100, reason: 'correct answer' }],
    1, Date.now(),
  )
  assert.equal(applied.state.teams[0]?.score, START_SCORE + 100, 'the award applied')
  assert.equal(applied.state.log.length, 1, 'one host action produced one event')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the award was undone')
  assert.equal(result.state.teams[0]?.score, START_SCORE, 'the score is back to its pre-award value')
  assert.equal(result.state.log.length, 2, 'log grows to 2 (original + reversal), never shrinks to 1')
  assert.equal(result.state.log[0], applied.state.log[0], 'the original event is untouched')
  assert.equal(result.state.log[1]?.payload['reversalOf'], 1, 'the reversal names what it reversed')
  assert.equal(result.state.log[1]?.name, applied.event.name, 'the reversal reuses the original event name')
}

// --- (b) depth bounds how far back undo can reach -------------------------
{
  const EVENT_COUNT = 10
  const SMALL_DEPTH = 5
  const OUT_OF_REACH_SEQ = EVENT_COUNT - SMALL_DEPTH   // the (N-depth)th event, 1-indexed

  let state = makeState()
  for (let seq = 1; seq <= EVENT_COUNT; seq++) {
    state = applyIntentsWithLog(
      state,
      [{ type: 'awardPoints', teamId: 'a', delta: 1, reason: `award ${seq}` }],
      seq, Date.now(),
    ).state
  }
  assert.equal(state.log.length, EVENT_COUNT, 'N events logged')

  // Undo until it refuses. Every undo APPENDS a reversal (L3), so reversals
  // themselves consume window slots — the reachable count is bounded well
  // below N, which is exactly the property being asserted.
  const MAX_ATTEMPTS = EVENT_COUNT * 2
  let successes = 0
  let refused = false
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = undo(state, SMALL_DEPTH)
    state = result.state
    if (!result.undone) { refused = true; break }
    successes++
  }
  assert.equal(refused, true, 'undo eventually refuses rather than walking the whole log')
  assert.ok(successes >= 1, 'at least one undo succeeded')
  assert.ok(successes < SMALL_DEPTH, `undo reach is bounded by depth (${successes} < ${SMALL_DEPTH})`)

  const reversed = reversedSeqs(state.log)
  assert.equal(
    reversed.has(OUT_OF_REACH_SEQ), false,
    `the (N-depth)th event (seq ${OUT_OF_REACH_SEQ}) is never reachable by undo`,
  )
  assert.equal(reversed.has(1), false, 'the very first event is never reachable by undo')
  assert.equal(undo(state, SMALL_DEPTH).undone, false, 'a further attempt is a no-op, not an error')
}

// --- (c) undo on an empty log is a no-op ----------------------------------
{
  const state = makeState()
  const result = undo(state, DEPTH)
  assert.equal(result.undone, false, 'nothing to undo')
  assert.equal(result.state, state, 'state is returned untouched')
}

// --- (d) 2-intent host action (grid.onSelect shape) ------------------------
{
  const before = makeState('board')
  const batch: Intent[] = [
    { type: 'selectQuestion', questionId: 'q1' },
    { type: 'setPhase', phase: 'reading' },
  ]
  const applied = applyIntentsWithLog(before, batch, 1, Date.now())
  assert.equal(applied.state.currentQuestionId, 'q1', 'the question was selected')
  assert.equal(applied.state.phase, 'reading', 'the phase advanced')
  assert.equal(applied.state.log.length, 1, 'a 2-intent host action logs ONE event, not two')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the host action was undone')
  assert.equal(result.state.currentQuestionId, null, 'currentQuestionId restored by the same single undo')
  assert.equal(result.state.phase, 'board', 'phase restored by the same single undo')
  assert.equal(result.state.log.length, 2, 'log is 2 (one batched action + one reversal), never 3')
}

// --- (e) 3-intent host action (resolveAnswer shape) ------------------------
{
  const before = makeState('armed')
  const batch: Intent[] = [
    { type: 'awardPoints', teamId: 'a', delta: 200, reason: 'correct answer' },
    { type: 'consumeQuestion', questionId: 'q1' },
    { type: 'setPhase', phase: 'reveal' },
  ]
  const applied = applyIntentsWithLog(before, batch, 1, Date.now())
  assert.equal(applied.state.teams[0]?.score, START_SCORE + 200, 'the award applied')
  assert.equal(applied.state.consumed.has('q1'), true, 'the question was consumed')
  assert.equal(applied.state.phase, 'reveal', 'the phase advanced')
  assert.equal(applied.state.log.length, 1, 'a 3-intent host action logs ONE event, not three')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the host action was undone')
  assert.equal(result.state.teams[0]?.score, START_SCORE, 'score restored by ONE undo')
  assert.equal(result.state.consumed.has('q1'), false, 'consumed restored by the same undo')
  assert.equal(result.state.consumed.size, 0, 'the consumed set is the pre-batch set, not a patched copy')
  assert.equal(result.state.phase, 'armed', 'phase restored by the same undo')
  assert.equal(result.state.log.length, 2, 'log is 2 (one batched action + one reversal), never 4')
}

// --- (f) a setStyleState batch reverses in exactly one undo ---------------
{
  const ORIGINAL = { revealedSlots: ['a'], ownership: { c1: 'teamA' } }
  const before: SessionState = { ...makeState('board'), styleState: ORIGINAL }

  const batch: Intent[] = [{ type: 'setStyleState', nextStyleState: { revealed: ['x'] } }]
  const applied = applyIntentsWithLog(before, batch, 1, Date.now())
  assert.deepEqual(applied.state.styleState, { revealed: ['x'] }, 'the style write applied')
  assert.equal(applied.state.log.length, 1, 'one host action produced one event')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the style write was undone')
  assert.deepEqual(
    result.state.styleState, ORIGINAL,
    'ONE undo restores the pre-batch styleState value',
  )
  assert.equal(
    result.state.styleState, ORIGINAL,
    'the snapshot restores the original object, not a reconstructed copy',
  )
  assert.equal(result.state.log.length, 2, 'log is 2 (action + reversal)')
  assert.equal(
    undo(result.state, DEPTH).undone, false,
    'a second undo finds nothing left — the first one reversed the whole action',
  )
}

// --- (g) advanceRound touches TWO keys and both rewind in one undo ---------
// The first intent in the codebase whose INTENT_TOUCHED_KEYS row names more
// than one key. The batch-union snapshot is what makes this work; a per-intent
// or single-key snapshot would leave roundIndex or styleState stranded.
{
  const ORIGINAL = { revealed: ['x'], guesses: 4 }
  const before: SessionState = {
    ...makeState('board'),
    config: MULTI_ROUND_CONFIG,
    roundIndex: 2,
    styleState: ORIGINAL,
  }

  const applied = applyIntentsWithLog(before, [{ type: 'advanceRound' }], 1, Date.now())
  assert.equal(applied.state.roundIndex, 3, 'the round advanced')
  assert.deepEqual(applied.state.styleState, {}, 'and styleState was cleared')
  assert.equal(applied.state.log.length, 1, 'one host action produced one event')
  assert.equal(applied.event.name, 'round.started', 'advanceRound logs an exact-match event name')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the round advance was undone')
  assert.equal(result.state.roundIndex, 2, 'roundIndex rewound by ONE undo')
  assert.deepEqual(result.state.styleState, ORIGINAL, 'styleState rewound by the SAME undo')
  assert.equal(result.state.log.length, 2, 'log is 2 (action + reversal), never 3')
}

// --- (h) a WHOLE round boundary reverses in exactly one undo (T2.2-L2/L4) --
// The batch shape `advanceToNextRound` produces: an elimination, a score reset
// per surviving team, the advance, and the entry phase. If any of these were a
// separate host action, taking back an elimination would cost two undo presses
// and the projector would show a half-undone state between them — the same
// class of bug as T1's cycle-0 FAIL. This is the direct regression guard.
{
  // The top-level CONFIG has exactly one round, which the T2.2 bound would
  // (correctly) refuse to advance past.
  const ORIGINAL_STYLE_STATE = { revealed: ['x'] }
  const before: SessionState = {
    ...makeState('reveal'),
    config: MULTI_ROUND_CONFIG,
    styleState: ORIGINAL_STYLE_STATE,
    teams: [
      { id: 'a', name: 'A', color: '#f00', score: 10, streak: 0, lifelinesUsed: {}, eliminated: false },
      { id: 'b', name: 'B', color: '#0f0', score: 20, streak: 0, lifelinesUsed: {}, eliminated: false },
      { id: 'c', name: 'C', color: '#00f', score: 5, streak: 0, lifelinesUsed: {}, eliminated: false },
    ],
  }

  const RESET_REASON = 'round boundary: scores reset (program.carryScores is false)'
  const batch: Intent[] = [
    { type: 'eliminate', teamId: 'c' },
    { type: 'awardPoints', teamId: 'a', delta: -10, reason: RESET_REASON },
    { type: 'awardPoints', teamId: 'b', delta: -20, reason: RESET_REASON },
    { type: 'advanceRound' },
    { type: 'setPhase', phase: 'board' },
  ]

  const applied = applyIntentsWithLog(before, batch, 1, Date.now())
  assert.equal(applied.state.roundIndex, 1, 'the round advanced')
  assert.equal(applied.state.teams[0]?.score, 0, 'team A was reset')
  assert.equal(applied.state.teams[1]?.score, 0, 'team B was reset')
  assert.equal(applied.state.teams[2]?.eliminated, true, 'team C was eliminated')
  assert.equal(applied.state.phase, 'board', 'and the entry phase landed')
  assert.deepEqual(applied.state.styleState, {}, 'the advance cleared styleState')
  assert.equal(applied.state.log.length, 1, 'a 5-intent host action logs ONE event, not five')

  const result = undo(applied.state, DEPTH)
  assert.equal(result.undone, true, 'the whole boundary was undone')
  assert.equal(result.state.roundIndex, 0, 'roundIndex restored by ONE undo')
  assert.equal(result.state.teams[0]?.score, 10, 'team A score restored by the SAME undo')
  assert.equal(result.state.teams[1]?.score, 20, 'team B score restored by the SAME undo')
  assert.equal(result.state.teams[2]?.eliminated, false, 'team C un-eliminated by the SAME undo')
  assert.equal(result.state.phase, 'reveal', 'phase restored by the SAME undo')
  assert.deepEqual(result.state.styleState, ORIGINAL_STYLE_STATE, 'styleState restored by the SAME undo')
  assert.equal(result.state.log.length, 2, 'log is 2 (action + reversal), never 3+')
  assert.equal(
    undo(result.state, DEPTH).undone, false,
    'a second press finds nothing left — the first one reversed the entire boundary',
  )
  // Team C carried a non-zero score (5) and got no awardPoints reset intent of
  // its own, yet its score is still restored: the touched-key union captures
  // the WHOLE `teams` field once, not a per-team patch. Omitting a redundant
  // awardPoints intent therefore never weakens undo coverage.
  assert.equal(result.state.teams[2]?.score, 5, 'a team with no awardPoints intent of its own is restored anyway')
}

// --- the batch payload keeps the full ordered intent list for audit -------
{
  const batch: Intent[] = [
    { type: 'awardPoints', teamId: 'a', delta: 50, reason: 'correct answer' },
    { type: 'consumeQuestion', questionId: 'q1' },
    { type: 'setPhase', phase: 'reveal' },
  ]
  const applied = applyIntentsWithLog(makeState('armed'), batch, 7, 12_345)
  assert.equal(applied.event.seq, 7, 'the caller-supplied seq is used verbatim')
  assert.equal(applied.event.at, 12_345, 'the caller-supplied timestamp is used verbatim')
  assert.deepEqual(
    applied.event.payload['intents'], batch,
    'every intent in the action is recorded in order for dispute audit',
  )
  assert.notEqual(
    (applied.event.payload['intents'] as Intent[])[0], batch[0],
    'logged intents are copies, so a later caller mutation cannot rewrite history',
  )
}

console.log('✓ event log + undo: all checks passed')
