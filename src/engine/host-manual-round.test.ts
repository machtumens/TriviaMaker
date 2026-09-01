import assert from 'node:assert/strict'
import { validateConfigPluginsT1 } from '../registry/bootstrap'
import {
  advanceToNextRound, createSession, currentRound, dispatchHostAction, resolveAnswer,
  resolveRoundContent,
} from './session'
import { demoT1 } from '../../presets/demo-t1'
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

const CATEGORIES_2: Category[] = [
  {
    id: 'cat-c', title: 'C',
    questions: [
      { id: 'c-100', kind: 'text', prompt: 'C100?', answer: 'c100', points: 100 },
      { id: 'c-200', kind: 'text', prompt: 'C200?', answer: 'c200', points: 200 },
    ],
  },
  {
    id: 'cat-d', title: 'D',
    questions: [
      { id: 'd-100', kind: 'text', prompt: 'D100?', answer: 'd100', points: 100 },
      { id: 'd-200', kind: 'text', prompt: 'D200?', answer: 'd200', points: 200 },
    ],
  },
]

const ALL_QUESTIONS = [...CATEGORIES, ...CATEGORIES_2].flatMap(c => c.questions)

const ROUND: Round = { id: 'r1', title: 'Round 1', bankId: 'bank', style: GRID }

const ROUND2: Round = {
  id: 'r2', title: 'Round 2', bankId: 'bank2', style: GRID,
  intro: { enabled: true, durationMs: 1, text: 'Round 2' },
}

const CONFIG: GameShowConfig = (() => {
  const base = resolveConfig({ meta: { id: 'host-manual', title: 'Host Manual' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND, ROUND2] },
    content: {
      banks: [
        { id: 'bank', title: 'Bank', categories: CATEGORIES },
        { id: 'bank2', title: 'Bank 2', categories: CATEGORIES_2 },
      ],
    },
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
  return gridStyle.buildBoard(round, options, state)
}

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

const board1 = buildBoard(CONFIG, state)
const CELLS_PER_ROUND = board1.cells.length
assert.equal(CELLS_PER_ROUND, 4, 'a 2x2 board')

const answeredCorrectly: string[] = []

function playRound(board: BoardModel): void {
  const cellQuestionIds = board.cells.map(cell => cell.questionId)
  let guard = 0

  while (!gridStyle.isRoundComplete(state, board)) {
    if (++guard > board.cells.length + 1) throw new Error('round loop did not terminate')

    const available = gridStyle.availableQuestions(state, board)
    const consumedHere = cellQuestionIds.filter(id => state.consumed.has(id)).length
    assert.equal(
      available.length, board.cells.length - consumedHere,
      'availability tracks consumption',
    )
    const questionId = available[0]
    assert.ok(questionId, 'a question is available')

    dispatch(gridStyle.onSelect(state, questionId))
    assert.equal(state.phase, 'reading', 'selecting moves to reading')
    assert.equal(state.currentQuestionId, questionId, 'the selection is recorded')

    dispatch([
      { type: 'startClock', ms: QUESTION_SEC * 1000 },
      { type: 'setPhase', phase: 'armed' },
    ])
    assert.equal(state.phase, 'armed', 'arming moves to armed')
    assert.notEqual(state.clockStartedAt, null, 'the clock is running')

    const correct = state.consumed.size % 2 === 0
    const teamId = correct ? 'a' : 'b'
    dispatch(resolveAnswer(state, { teamId, correct, elapsedMs: 1200 }))
    assert.equal(state.phase, 'reveal', 'judging moves to reveal')
    assert.equal(state.consumed.has(questionId), true, 'the question is consumed')
    if (correct) answeredCorrectly.push(questionId)

    if (gridStyle.isRoundComplete(state, board)) return
    dispatch([{ type: 'setPhase', phase: 'board' }])
  }
}

dispatch([{ type: 'setPhase', phase: 'board' }])
assert.equal(state.phase, 'board', 'the board is up')

playRound(board1)
{
  assert.equal(state.phase, 'reveal', 'round 1 ends parked in reveal, awaiting the host')
  assert.equal(gridStyle.isRoundComplete(state, board1), true, 'the style agrees round 1 is complete')
  assert.equal(gridStyle.availableQuestions(state, board1).length, 0, 'nothing is left to pick in round 1')
  assert.equal(answeredCorrectly.length, 2, 'two of round 1\'s questions were answered correctly')
}

{
  const logBefore = state.log.length
  dispatch(advanceToNextRound(state))
  assert.equal(state.log.length, logBefore + 1, 'the whole boundary is ONE host action')
  assert.equal(state.roundIndex, 1, 'the show is on round 2')
  assert.equal(state.phase, 'roundIntro', 'round 2 has an intro, so reveal -> roundIntro was taken')
  assert.deepEqual(state.styleState, {}, 'the advance cleared round 1\'s style state')
  assert.equal(currentRound(CONFIG, state.roundIndex).id, 'r2', 'currentRound resolves the new round')
}

dispatch([{ type: 'setPhase', phase: 'board' }])
assert.equal(state.phase, 'board', 'round 2\'s board is up')

const board2 = buildBoard(CONFIG, state)
assert.equal(board2.cells.length, CELLS_PER_ROUND, 'round 2 has its own 2x2 board')
assert.equal(
  board2.cells.some(cell => board1.cells.some(c => c.questionId === cell.questionId)), false,
  'round 2 draws entirely different questions — round 1 did not leak into it',
)
playRound(board2)

dispatch([{ type: 'setPhase', phase: 'final' }])

{
  assert.equal(state.phase, 'final', 'the show ended in the final phase')
  assert.equal(state.roundIndex, 1, 'and never moved past the last real round')
  assert.equal(state.consumed.size, CELLS_PER_ROUND * 2, 'every tile of BOTH rounds was played')
  assert.equal(gridStyle.availableQuestions(state, board2).length, 0, 'nothing is left to pick in round 2')
  assert.equal(gridStyle.isRoundComplete(state, board1), true, 'round 1 is still complete')
  assert.equal(gridStyle.isRoundComplete(state, board2), true, 'and so is round 2')
  assert.equal(answeredCorrectly.length, 4, 'four questions were answered correctly across the show')
}

{
  const expectedCorrectTotal = answeredCorrectly
    .map(id => ALL_QUESTIONS.find(q => q.id === id)?.points ?? 0)
    .reduce((sum, points) => sum + points, 0)
  assert.equal(state.teams[0]?.score, expectedCorrectTotal, 'Team A banked the face value of its correct answers')
  assert.equal(state.teams[1]?.score, -200, 'Team B took four 50-point penalties across two rounds')
}

{

  const PER_ROUND = CELLS_PER_ROUND * 3 + (CELLS_PER_ROUND - 1) + 1
  assert.equal(state.log.length, hostActions, 'exactly one log event per host action')
  assert.equal(
    hostActions, 1 + PER_ROUND + 1 + PER_ROUND,
    'start + round 1 + continue + round 2',
  )
  const seqs = state.log.map(e => e.seq)
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'the log is append-only and ordered')
}

{
  assert.deepEqual(state.players, [], 'no player ever connected')
  assert.deepEqual(state.buzzes, [], 'no buzz was ever recorded')
  assert.equal(state.lockedOutTeamIds.size, 0, 'no lockout machinery ran')
}

{
  const before = { phase: state.phase, log: state.log.length }
  const reverted = undo(state, CONFIG.runtime.undo.depth)
  assert.equal(reverted.undone, true, 'the last host action is undoable')
  assert.equal(reverted.state.phase, 'reveal', 'one press steps back exactly one action')
  assert.equal(reverted.state.log.length, before.log + 1, 'the log grew; nothing was erased')
  assert.equal(before.phase, 'final', 'the pre-undo state object was not mutated')
}

{
  const resolved = resolveConfig(demoT1)
  assert.equal(resolved.program.rounds.length, 2, 'demo-t1 authors two rounds')
  assert.deepEqual(
    validateConfigPluginsT1(resolved), [],
    'every plugin key demo-t1 references is registered — it passes preflight',
  )

  const [first, second] = resolved.program.rounds
  assert.ok(first && second, 'both rounds are present')
  assert.equal(first.intermissionAfter?.enabled ?? false, false, 'round 1 has no intermission...')
  assert.equal(second.intro?.enabled, true, '...and round 2 has an intro, so the boundary takes reveal -> roundIntro')

  for (const round of resolved.program.rounds) {
    const content = resolveRoundContent(resolved, round)
    assert.ok(content.length > 0, `round "${round.id}" resolves to at least one category`)
    assert.ok(
      content.every(category => category.questions.length > 0),
      `every category in round "${round.id}" has questions`,
    )
  }
}

console.log('✓ full host-manual two-round show: all checks passed')
