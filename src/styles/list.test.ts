import assert from 'node:assert/strict'
import { listStyle, feudState, type ListBuildOptions } from './list'
import { resolveConfig } from '../config/resolve'
import { applyIntent } from '../engine/intents'
import type { Intent, SessionState } from '../registry/index'
import type { Category, GameShowConfig, ListStyle, Round } from '../config/types'

const FIXTURE_STYLE: ListStyle = {
  kind: 'list',
  slots: 4,
  strikesAllowed: 3,
  
  showCounts: true,
}

const FIXTURE_CATEGORIES: Category[] = [
  {
    id: 'survey', title: 'Survey',
    questions: [
      {
        id: 'q1', kind: 'survey', prompt: 'Name something in a school bag', answer: 'Books',
        surveyAnswers: [
          { text: 'Books', count: 38 },
          { text: 'Pencil case', count: 27 },
          { text: 'Water bottle', count: 19 },
          { text: 'Phone', count: 11 },
        ],
      },
      {
        id: 'q2', kind: 'survey', prompt: 'Name a school subject', answer: 'Maths',
        surveyAnswers: [{ text: 'Maths', count: 40 }, { text: 'English', count: 30 }],
      },
    ],
  },
]

const ROUND: Round = { id: 'r1', title: 'Feud', bankId: 'bank', style: FIXTURE_STYLE }
const OPTIONS: ListBuildOptions = { ...FIXTURE_STYLE, categories: FIXTURE_CATEGORIES }

function makeConfig(): GameShowConfig {
  const base = resolveConfig({ meta: { id: 'feud', title: 'Feud' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: FIXTURE_CATEGORIES }] },
  }
}

const CONFIG = makeConfig()

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session', config: CONFIG,
    phase: 'reading', roundIndex: 0, currentQuestionId: 'q1',
    consumed: new Set<string>(),
    teams: [
      { id: 'a', name: 'A', color: '#f00', score: 0, eliminated: false },
      { id: 'b', name: 'B', color: '#00f', score: 0, eliminated: false },
    ],
    clockStartedAt: null, styleState: {}, log: [],
    ...overrides,
  }
}

function run(state: SessionState, intents: Intent[]): SessionState {
  return intents.reduce((current, intent) => applyIntent(current, intent), state)
}

function command(state: SessionState, type: string, fields: Record<string, unknown> = {}): Intent[] {
  const intents = listStyle.onCommand?.(state, type, fields)
  assert.ok(intents, `style declined command "${type}"`)
  return intents
}

// An unrevealed answer must not be in the board at all — the audience board is
// derived from this one, so "present but flagged hidden" would ship the answers.
{
  const board = listStyle.buildBoard(ROUND, OPTIONS, makeState())
  const slots = board.meta?.['slots'] as Array<Record<string, unknown>>
  assert.equal(slots.length, 4, 'one slot per answer, capped at style.slots')
  assert.equal(slots.every(slot => slot['revealed'] === false), true, 'nothing starts revealed')

  const serialised = JSON.stringify(board)
  for (const secret of ['Books', 'Pencil case', 'Water bottle', 'Phone']) {
    assert.equal(serialised.includes(secret), false, `hidden answer "${secret}" is absent from the board`)
  }
  assert.equal(board.cells.length, 2, 'cells are the questions, not the answers')
}

{
  const state = makeState()
  const next = run(state, command(state, 'revealAnswer', { answerIndex: 1, teamId: 'b' }))

  assert.deepEqual(feudState(next).revealed['q1'], [1], 'the slot is marked revealed')
  assert.equal(next.teams.find(team => team.id === 'b')?.score, 27, 'the answer pays its own value')
  assert.equal(next.teams.find(team => team.id === 'a')?.score, 0, 'and only to the group that said it')

  const board = listStyle.buildBoard(ROUND, OPTIONS, next)
  const slots = board.meta?.['slots'] as Array<Record<string, unknown>>
  assert.equal(slots[1]?.['text'], 'Pencil case', 'the revealed slot now carries its text')
  assert.equal(slots[1]?.['points'], 27)
  assert.equal(slots[0]?.['text'], undefined, 'its neighbours stay hidden')
  assert.equal(JSON.stringify(board).includes('Water bottle'), false)
}

{
  const state = makeState()
  const once = run(state, command(state, 'revealAnswer', { answerIndex: 0, teamId: 'a' }))
  const twice = run(once, command(once, 'revealAnswer', { answerIndex: 0, teamId: 'b' }))
  assert.equal(twice.teams.find(team => team.id === 'b')?.score, 0, 'a slot cannot be claimed twice')
  assert.deepEqual(feudState(twice).revealed['q1'], [0])
}

{
  let state = makeState({ currentQuestionId: 'q2' })
  state = run(state, command(state, 'revealAnswer', { answerIndex: 0, teamId: 'a' }))
  assert.equal(state.consumed.has('q2'), false, 'still open with a slot left')

  state = run(state, command(state, 'revealAnswer', { answerIndex: 1, teamId: 'b' }))
  assert.equal(state.consumed.has('q2'), true, 'the last slot finishes the question')
  assert.equal(state.phase, 'reveal')
  assert.equal(state.teams.find(team => team.id === 'a')?.score, 40)
  assert.equal(state.teams.find(team => team.id === 'b')?.score, 30)
}

{
  const state = makeState()
  const struck = run(state, command(state, 'strike'))
  assert.equal(feudState(struck).strikes, 1)
  const twice = run(struck, command(struck, 'strike'))
  assert.equal(feudState(twice).strikes, 2, 'strikes accumulate')

}

// Strikes belong to the question, so picking the next one starts clean. onSelect
// runs from the board, the only phase a question can be picked from.
{
  const carried = makeState({
    phase: 'board',
    currentQuestionId: null,
    styleState: { revealed: { q1: [0] }, strikes: 2 },
  })
  assert.equal(feudState(carried).strikes, 2, 'the previous question left strikes behind')

  const fresh = run(carried, listStyle.onSelect(carried, 'q2'))
  assert.equal(feudState(fresh).strikes, 0, 'the new question starts with none')
  assert.deepEqual(feudState(fresh).revealed['q1'], [0], 'without disturbing what was already revealed')
  assert.equal(fresh.currentQuestionId, 'q2')
}

{
  const state = makeState()
  assert.throws(() => command(state, 'revealAnswer', { answerIndex: 9, teamId: 'a' }), /no answer at position 10/)
  assert.throws(() => command(state, 'revealAnswer', { answerIndex: 0 }), /teamId must name the team/)
  assert.equal(listStyle.onCommand?.(state, 'somethingElse', {}), null, 'unknown commands are declined, not thrown')
}

{
  const state = makeState({ consumed: new Set(['q1', 'q2']) })
  const board = listStyle.buildBoard(ROUND, OPTIONS, state)
  assert.equal(listStyle.isRoundComplete(state, board), true)
  assert.deepEqual(listStyle.availableQuestions(state, board), [])
}

console.log('✓ list (family feud) board: all checks passed')
