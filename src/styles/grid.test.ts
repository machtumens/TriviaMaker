import assert from 'node:assert/strict'
import { gridStyle, type GridBuildOptions } from './grid'
import { resolveConfig } from '../config/resolve'
import type { SessionState } from '../registry/index'
import type { Category, GameShowConfig, GridStyle, Round } from '../config/types'

const POINT_LADDER = [100, 200, 300]
const COLUMNS = 2
const ROWS = POINT_LADDER.length

const FIXTURE_STYLE: GridStyle = {
  kind: 'grid',
  columns: COLUMNS,
  rows: ROWS,
  pointLadder: POINT_LADDER,
  selection: 'freePick',
  showCategoryHeaders: true,
  consumedStyle: 'dim',
  dramaticCategoryReveal: false,
}

const FIXTURE_CATEGORIES: Category[] = [
  {
    id: 'sci', title: 'Science',
    questions: [
      { id: 'sci-100', kind: 'text', prompt: 'Red planet?', answer: 'Mars', points: 100 },
      { id: 'sci-200', kind: 'text', prompt: 'Plants absorb which gas?', answer: 'CO2', points: 200 },
      { id: 'sci-300', kind: 'text', prompt: 'Speed of light unit?', answer: 'm/s', points: 300 },
    ],
  },
  {
    id: 'geo', title: 'Geography',
    questions: [
      { id: 'geo-100', kind: 'text', prompt: 'Capital of Japan?', answer: 'Tokyo', points: 100 },
      { id: 'geo-200', kind: 'text', prompt: 'Longest river?', answer: 'Nile', points: 200 },
      { id: 'geo-300', kind: 'text', prompt: 'Largest desert?', answer: 'Antarctic', points: 300 },
    ],
  },
]

const ROUND: Round = {
  id: 'r1',
  title: 'Round 1',
  bankId: 'bank',
  style: FIXTURE_STYLE,
}

const OPTIONS: GridBuildOptions = { ...FIXTURE_STYLE, categories: FIXTURE_CATEGORIES }

const CONFIG: GameShowConfig = (() => {
  const base = resolveConfig({ meta: { id: 'grid', title: 'Grid' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: FIXTURE_CATEGORIES }] },
  }
})()

function makeState(consumed: string[] = []): SessionState {
  return {
    id: 'session', joinCode: '000000', config: CONFIG,
    phase: 'board', roundIndex: 0, currentQuestionId: null,
    consumed: new Set(consumed),
    teams: [{ id: 'a', name: 'A', color: '#f00', score: 0, streak: 0, lifelinesUsed: {}, eliminated: false }],
    players: [], buzzes: [], turnTeamId: null, attemptsUsed: 0,
    lockedOutTeamIds: new Set<string>(), clockStartedAt: null, styleState: {}, log: [],
  }
}

const board = gridStyle.buildBoard(ROUND, OPTIONS, makeState())

{
  assert.equal(gridStyle.key, 'grid', 'registered under the "grid" key')
  assert.equal(board.kind, 'grid', 'board is tagged with its style kind')
  assert.equal(
    board.cells.length, COLUMNS * ROWS,
    'one cell per (category, point-ladder rung)',
  )
}

{
  const target = FIXTURE_CATEGORIES[0]?.questions[1]
  assert.ok(target, 'fixture question exists')
  const cell = board.cells.find(c => c.questionId === target.id)
  assert.ok(cell, `a cell exists for fixture question "${target.id}"`)
  assert.equal(cell.label, target.prompt, 'the cell label carries the real question prompt')
  assert.equal(cell.row, 1, 'row indexes the point ladder')
  assert.equal(cell.col, 0, 'col indexes the resolved categories')
  assert.equal(cell.meta?.['points'], POINT_LADDER[1], 'the cell carries its ladder point value')
}
{
  const geo = FIXTURE_CATEGORIES[1]?.questions[2]
  assert.ok(geo, 'fixture question exists')
  const cell = board.cells.find(c => c.questionId === geo.id)
  assert.ok(cell, 'the second category is represented too')
  assert.equal(cell.label, geo.prompt, 'its label is the real prompt')
  assert.equal(cell.col, 1, 'second category is column 1')
}
{
  const ids = board.cells.map(c => c.questionId)
  assert.equal(new Set(ids).size, ids.length, 'every cell maps to a distinct question')
  const cellIds = board.cells.map(c => c.id)
  assert.equal(new Set(cellIds).size, cellIds.length, 'cell ids are unique')
}

{
  const CONSUMED_ID = 'sci-200'
  const available = gridStyle.availableQuestions(makeState([CONSUMED_ID]), board)
  assert.equal(available.length, COLUMNS * ROWS - 1, 'exactly one question drops out')
  assert.equal(available.includes(CONSUMED_ID), false, 'the consumed question is not offered')
  assert.equal(available.includes('sci-100'), true, 'unconsumed questions remain available')
}

{
  const intents = gridStyle.onSelect(makeState(), 'sci-100')
  assert.deepEqual(
    intents,
    [
      { type: 'selectQuestion', questionId: 'sci-100' },
      { type: 'setPhase', phase: 'reading' },
    ],
    'select emits selectQuestion then setPhase, in that order',
  )
}

{
  assert.deepEqual(gridStyle.onResolved(makeState(), true), [], 'no style-specific consequences')
  assert.deepEqual(gridStyle.onResolved(makeState(), false), [], 'including on a wrong answer')
}

{
  const allIds = board.cells.map(c => c.questionId)
  const partial = allIds.slice(0, allIds.length - 1)
  assert.equal(
    gridStyle.isRoundComplete(makeState(partial), board), false,
    'one unconsumed cell means the round is not complete',
  )
  assert.equal(
    gridStyle.isRoundComplete(makeState(allIds), board), true,
    'every cell consumed means the round is complete',
  )
}

{
  const shortCategories: Category[] = [
    { id: 'short', title: 'Short', questions: [FIXTURE_CATEGORIES[0]!.questions[0]!] },
  ]
  const shortBoard = gridStyle.buildBoard(ROUND, { ...FIXTURE_STYLE, categories: shortCategories }, makeState())
  assert.equal(shortBoard.cells.length, 1, 'only the authored questions become tiles')
}

console.log('✓ grid style: all checks passed')
