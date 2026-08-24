/**
 * Full host-manual round — PLAN Test Plan, SPEC AC#5 (automated half).
 *
 * Plays a complete grid round the way a host actually would: start, select,
 * arm, judge, next — looping until `isRoundComplete`. Nothing in this file
 * touches a player device, a buzz, or an input plugin, which is the point:
 * invariant #1 says the show must run with zero players connected, and in T1
 * that is true STRUCTURALLY because no input plugin exists at all.
 *
 * The manual pre-show dry run on a real venue network is still required
 * (ARCHITECTURE.md §9). This proves the engine, not the room.
 */

import assert from 'node:assert/strict'
import '../registry/bootstrap'
import {
  createSession, currentRound, dispatchHostAction, resolveAnswer, resolveRoundContent,
} from './session'
import { undo } from './log'
import { gridStyle, type GridBuildOptions } from '../styles/grid'
import { resolveConfig } from '../config/resolve'
import { list } from '../registry/index'
import type { BoardModel, Intent, SessionState } from '../registry/index'
import type { Category, GameShowConfig, GridStyle, Round, StyleConfig } from '../config/types'

const POINT_LADDER = [100, 200]
const QUESTION_SEC = 30

const GRID: StyleConfig = {
  kind: 'grid', columns: 2, rows: POINT_LADDER.length, pointLadder: POINT_LADDER,
  selection: 'freePick', showCategoryHeaders: true,
  consumedStyle: 'dim', dramaticCategoryReveal: false,
}

const CATEGORIES: Category[] = [
  {
    id: 'cat-a', title: 'A',
    questions: [
      { id: 'a-100', kind: 'text', prompt: 'A100?', answer: 'a100', points: 100 },
      { id: 'a-200', kind: 'text', prompt: 'A200?', answer: 'a200', points: 200 },
    ],
  },
  {
    id: 'cat-b', title: 'B',
    questions: [
      { id: 'b-100', kind: 'text', prompt: 'B100?', answer: 'b100', points: 100 },
      { id: 'b-200', kind: 'text', prompt: 'B200?', answer: 'b200', points: 200 },
    ],
  },
]

const ROUND: Round = { id: 'r1', title: 'Round 1', bankId: 'bank', style: GRID }

const CONFIG: GameShowConfig = (() => {
  const base = resolveConfig({ meta: { id: 'host-manual', title: 'Host Manual' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: CATEGORIES }] },
    teams: {
      ...base.teams,
      teams: [
        { id: 'a', name: 'Team A', color: '#f00' },
        { id: 'b', name: 'Team B', color: '#00f' },
      ],
    },
    rules: {
      ...base.rules,
      timer: { ...base.rules.timer, questionSec: QUESTION_SEC },
      wrongAnswer: { ...base.rules.wrongAnswer, penalty: 50 },
    },
  }
})()

function buildBoard(config: GameShowConfig, state: SessionState): BoardModel {
  const round = currentRound(config, state.roundIndex)
  const options: GridBuildOptions = {
    ...(round.style as GridStyle),
    categories: resolveRoundContent(config, round),
  }
  return gridStyle.buildBoard(round, options)
}

// --- no player-device machinery exists at all -------------------------------
{
  assert.deepEqual(list('input'), [], 'T1 registers no input plugin — nothing can depend on one')
}

let state = createSession(CONFIG)
let seq = 0
let hostActions = 0

function dispatch(intents: Intent[]): void {
  seq++
  hostActions++
  state = dispatchHostAction(state, intents, seq, Date.now()).state
}

const board = buildBoard(CONFIG, state)
const TOTAL_CELLS = board.cells.length
assert.equal(TOTAL_CELLS, 4, 'a 2x2 board')

// --- host starts the round --------------------------------------------------
dispatch([{ type: 'setPhase', phase: 'board' }])
assert.equal(state.phase, 'board', 'the board is up')

// --- play every tile ---------------------------------------------------------
const answeredCorrectly: string[] = []
let guard = 0
while (!gridStyle.isRoundComplete(state, board)) {
  if (++guard > TOTAL_CELLS + 1) throw new Error('round loop did not terminate')

  const available = gridStyle.availableQuestions(state, board)
  assert.equal(
    available.length, TOTAL_CELLS - state.consumed.size,
    'availability tracks consumption',
  )
  const questionId = available[0]
  assert.ok(questionId, 'a question is available')

  // select
  dispatch(gridStyle.onSelect(state, questionId))
  assert.equal(state.phase, 'reading', 'selecting moves to reading')
  assert.equal(state.currentQuestionId, questionId, 'the selection is recorded')

  // arm
  dispatch([
    { type: 'startClock', ms: QUESTION_SEC * 1000 },
    { type: 'setPhase', phase: 'armed' },
  ])
  assert.equal(state.phase, 'armed', 'arming moves to armed')
  assert.notEqual(state.clockStartedAt, null, 'the clock is running')

  // judge — alternate correct/wrong so both scoring branches are exercised
  const correct = state.consumed.size % 2 === 0
  const teamId = correct ? 'a' : 'b'
  dispatch(resolveAnswer(state, { teamId, correct, elapsedMs: 1200 }))
  assert.equal(state.phase, 'reveal', 'judging moves to reveal')
  assert.equal(state.consumed.has(questionId), true, 'the question is consumed')
  if (correct) answeredCorrectly.push(questionId)

  // next
  const complete = gridStyle.isRoundComplete(state, board)
  dispatch([{ type: 'setPhase', phase: complete ? 'final' : 'board' }])
}

// --- the round finished on its own terms ------------------------------------
{
  assert.equal(state.phase, 'final', 'the round ended in the final phase')
  assert.equal(state.consumed.size, TOTAL_CELLS, 'every tile was played')
  assert.equal(gridStyle.availableQuestions(state, board).length, 0, 'nothing is left to pick')
  assert.equal(gridStyle.isRoundComplete(state, board), true, 'the style agrees the round is complete')
  assert.equal(answeredCorrectly.length, 2, 'two questions were answered correctly')
}

// --- scores match the flat formula ------------------------------------------
{
  const expectedCorrectTotal = answeredCorrectly
    .map(id => CATEGORIES.flatMap(c => c.questions).find(q => q.id === id)?.points ?? 0)
    .reduce((sum, points) => sum + points, 0)
  assert.equal(state.teams[0]?.score, expectedCorrectTotal, 'Team A banked the face value of its correct answers')
  assert.equal(state.teams[1]?.score, -100, 'Team B took two 50-point penalties')
}

// --- one event per host action, and the log never shrank --------------------
{
  assert.equal(state.log.length, hostActions, 'exactly one log event per host action')
  assert.equal(hostActions, 1 + TOTAL_CELLS * 4, 'start + (select, arm, judge, next) per tile')
  const seqs = state.log.map(e => e.seq)
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'the log is append-only and ordered')
}

// --- zero player devices were involved, start to finish ---------------------
{
  assert.deepEqual(state.players, [], 'no player ever connected')
  assert.deepEqual(state.buzzes, [], 'no buzz was ever recorded')
  assert.equal(state.lockedOutTeamIds.size, 0, 'no lockout machinery ran')
}

// --- the host can take back the last thing they did -------------------------
{
  const before = { phase: state.phase, log: state.log.length }
  const reverted = undo(state, CONFIG.runtime.undo.depth)
  assert.equal(reverted.undone, true, 'the last host action is undoable')
  assert.equal(reverted.state.phase, 'reveal', 'one press steps back exactly one action')
  assert.equal(reverted.state.log.length, before.log + 1, 'the log grew; nothing was erased')
  assert.equal(before.phase, 'final', 'the pre-undo state object was not mutated')
}

console.log('✓ full host-manual round: all checks passed')
