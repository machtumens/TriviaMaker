/**
 * Broadcast redaction + board delivery — PLAN Sub-Phase 4 (item 17a).
 * SPEC AC#4, AC#7 (data half), AC#17, invariant #4.
 *
 * Self-contained by design: it registers its own fixture style rather than
 * importing `grid.ts` or `bootstrap.ts`, so Sub-Phase 4 stays genuinely
 * parallel-safe with Sub-Phase 3.
 *
 * The strongest assertion here is value-based, not key-based: every secret in
 * the fixture is a unique sentinel string, and the whole serialised stage and
 * player payloads are searched for it. A key-name scan alone would be fooled by
 * the config's legitimate `copy.answer` section and would miss a leak smuggled
 * under a differently-named field.
 */

import assert from 'node:assert/strict'
import { broadcastState } from './broadcast'
import { register, type BoardModel, type Intent, type SessionState, type StylePlugin, type TransportHandle } from '../registry/index'
import { resolveConfig } from '../config/resolve'
import type { Category, GameShowConfig, Round, StyleConfig } from '../config/types'

const POINT_LADDER = [100, 200]
const FIXTURE_STYLE_KEY = 'fixture-grid'

// Unique sentinels — anything that leaks is unmistakably identifiable.
const SECRETS = {
  answer: 'SENTINEL-ANSWER-8f21',
  accepted: 'SENTINEL-ACCEPTED-8f21',
  hostNote: 'SENTINEL-HOSTNOTE-8f21',
}

const FIXTURE_CATEGORIES: Category[] = [
  {
    id: 'cat-a', title: 'Category A',
    questions: [
      {
        id: 'a-100', kind: 'text', points: 100,
        prompt: 'SENTINEL-PROMPT-a100',
        answer: `${SECRETS.answer}-a100`,
        acceptedAnswers: [`${SECRETS.accepted}-a100`],
        hostNote: `${SECRETS.hostNote}-a100`,
        correctChoiceIndex: 2,
        numericAnswer: 424242,
      },
      {
        id: 'a-200', kind: 'text', points: 200,
        prompt: 'SENTINEL-PROMPT-a200',
        answer: `${SECRETS.answer}-a200`,
      },
    ],
  },
  {
    id: 'cat-b', title: 'Category B',
    questions: [
      { id: 'b-100', kind: 'text', points: 100, prompt: 'SENTINEL-PROMPT-b100', answer: `${SECRETS.answer}-b100` },
      { id: 'b-200', kind: 'text', points: 200, prompt: 'SENTINEL-PROMPT-b200', answer: `${SECRETS.answer}-b200` },
    ],
  },
]

const ALL_PROMPTS = FIXTURE_CATEGORIES.flatMap(c => c.questions.map(q => q.prompt))

const FIXTURE_STYLE_CONFIG = {
  kind: FIXTURE_STYLE_KEY,
  columns: FIXTURE_CATEGORIES.length,
  rows: POINT_LADDER.length,
  pointLadder: POINT_LADDER,
} as unknown as StyleConfig

const ROUND: Round = {
  id: 'r1',
  title: 'Fixture Round',
  bankId: 'bank',
  style: FIXTURE_STYLE_CONFIG,
}

const CONFIG: GameShowConfig = (() => {
  const base = resolveConfig({ meta: { id: 'broadcast', title: 'Broadcast' } })
  return {
    ...base,
    program: { ...base.program, rounds: [ROUND] },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: FIXTURE_CATEGORIES }] },
  }
})()

// --- a minimal style plugin, defined here so this file stands alone --------
interface FixtureOptions { pointLadder: number[]; categories: Category[] }

const fixtureStyle: StylePlugin<FixtureOptions> = {
  key: FIXTURE_STYLE_KEY,
  stageComponent: 'fixture-stage',
  hostComponent: 'fixture-host',
  buildBoard(round: Round, options: FixtureOptions): BoardModel {
    const cells: BoardModel['cells'] = []
    for (let row = 0; row < options.pointLadder.length; row++) {
      for (let col = 0; col < options.categories.length; col++) {
        const question = options.categories[col]?.questions[row]
        if (!question) continue
        cells.push({
          id: `${round.id}:${col}:${row}`,
          questionId: question.id,
          label: question.prompt,
          row, col, consumed: false,
        })
      }
    }
    // `broadcastState` reads the audience point-value ladder back off the
    // BOARD (never off `round.style`), so a style that wants point-value
    // labels must publish its ladder here — exactly as `grid.ts` does.
    return { kind: FIXTURE_STYLE_KEY, cells, meta: { pointLadder: options.pointLadder } }
  },
  availableQuestions: (state, board) =>
    board.cells.map(c => c.questionId).filter(id => !state.consumed.has(id)),
  onSelect: (_state, questionId): Intent[] => [{ type: 'selectQuestion', questionId }],
  onResolved: (): Intent[] => [],
  isRoundComplete: (state, board) => board.cells.every(c => state.consumed.has(c.questionId)),
}

register('style', fixtureStyle)

const state: SessionState = {
  id: 'session', joinCode: '000000', config: CONFIG,
  phase: 'reading', roundIndex: 0, currentQuestionId: 'a-100',
  consumed: new Set(['b-100']),
  teams: [{ id: 'a', name: 'A', color: '#f00', score: 0, streak: 0, lifelinesUsed: {}, eliminated: false }],
  players: [], buzzes: [], turnTeamId: null, attemptsUsed: 0,
  lockedOutTeamIds: new Set<string>(), clockStartedAt: null, styleState: {}, log: [],
}

// --- run it -----------------------------------------------------------------
const calls: Array<{ channel: string; payload: unknown }> = []
const fakeHandle: TransportHandle = {
  broadcast: (channel, payload) => { calls.push({ channel, payload }) },
  onCommand: () => { /* not used here */ },
  rtt: () => 0,
  stop: async () => { /* not used here */ },
}

broadcastState(fakeHandle, state, CONFIG)

function payloadFor(channel: string): Record<string, unknown> {
  const matches = calls.filter(c => c.channel === channel)
  assert.equal(matches.length, 1, `channel "${channel}" received exactly one broadcast`)
  return matches[0]?.payload as Record<string, unknown>
}

function boardOf(payload: Record<string, unknown>): BoardModel {
  return payload['board'] as BoardModel
}

// --- (a) all three channels, exactly once each ------------------------------
{
  assert.equal(calls.length, 3, 'exactly three broadcasts, one per channel')
  assert.deepEqual(
    [...calls.map(c => c.channel)].sort(),
    ['host', 'player', 'stage'],
    'host, stage and player each received a payload',
  )
}

const hostPayload = payloadFor('host')
const stagePayload = payloadFor('stage')
const playerPayload = payloadFor('player')

// --- (b) the host board carries real content --------------------------------
{
  const board = boardOf(hostPayload)
  assert.equal(
    board.cells.length, FIXTURE_CATEGORIES.length * POINT_LADDER.length,
    'the host board has one cell per (category, rung)',
  )
  const withRealLabel = board.cells.filter(cell => ALL_PROMPTS.includes(cell.label))
  assert.equal(
    withRealLabel.length, board.cells.length,
    'every host cell label is the real question prompt — the board reached the payload with content',
  )
  const consumedCell = board.cells.find(c => c.questionId === 'b-100')
  assert.equal(consumedCell?.consumed, true, 'consumption is derived from state.consumed')
  const unplayedCell = board.cells.find(c => c.questionId === 'a-200')
  assert.equal(unplayedCell?.consumed, false, 'unplayed cells are not marked consumed')
}

// --- (c) stage/player boards carry point values only ------------------------
for (const [name, payload] of [['stage', stagePayload], ['player', playerPayload]] as const) {
  const board = boardOf(payload)
  assert.equal(board.cells.length, boardOf(hostPayload).cells.length, `${name}: same cell count as host`)
  for (const cell of board.cells) {
    assert.equal(
      ALL_PROMPTS.includes(cell.label), false,
      `${name}: cell "${cell.id}" must never carry a real prompt (got "${cell.label}")`,
    )
    assert.equal(
      cell.label, String(POINT_LADDER[cell.row ?? -1]),
      `${name}: cell "${cell.id}" shows its point value`,
    )
  }
  // Applies regardless of consumption — a played tile is no more revealing.
  const consumedCell = board.cells.find(c => c.questionId === 'b-100')
  assert.equal(consumedCell?.consumed, true, `${name}: consumed flag still reaches the client`)
  assert.equal(consumedCell?.label, '100', `${name}: even a consumed tile shows only its value`)
}

// --- (d) no secret reaches stage or player, anywhere in the payload --------
const REDACTED_FIELDS = ['answer', 'acceptedAnswers', 'hostNote', 'correctChoiceIndex', 'numericAnswer'] as const

for (const [name, payload] of [['stage', stagePayload], ['player', playerPayload]] as const) {
  const serialised = JSON.stringify(payload)
  for (const secret of Object.values(SECRETS)) {
    assert.equal(
      serialised.includes(secret), false,
      `${name}: the payload must not contain the ${secret.split('-')[1]?.toLowerCase()} sentinel anywhere`,
    )
  }
  assert.equal(serialised.includes('424242'), false, `${name}: numericAnswer does not leak`)

  const question = payload['currentQuestion'] as Record<string, unknown> | null
  assert.ok(question, `${name}: the selected question is present`)
  for (const field of REDACTED_FIELDS) {
    assert.equal(question[field], undefined, `${name}: currentQuestion.${field} is stripped`)
  }
  assert.equal(question['prompt'], 'SENTINEL-PROMPT-a100', `${name}: the prompt survives — the audience must read it`)

  const config = payload['config'] as GameShowConfig
  assert.deepEqual(config.content.banks, [], `${name}: the content snapshot is stripped from the config`)
}

// --- the host/stage split is deliberate, not accidental --------------------
{
  const question = hostPayload['currentQuestion'] as Record<string, unknown>
  assert.equal(question['answer'], `${SECRETS.answer}-a100`, 'the host keeps the answer key — that is the whole job')
  assert.equal(question['hostNote'], `${SECRETS.hostNote}-a100`, 'and the teleprompter note')
  const config = hostPayload['config'] as GameShowConfig
  assert.equal(config.content.banks.length, 1, 'the host keeps the content snapshot')
}

// --- payload is JSON-safe (Sets would serialise to {}) ----------------------
{
  assert.deepEqual(stagePayload['consumed'], ['b-100'], 'consumed travels as an array')
  assert.deepEqual(stagePayload['lockedOutTeamIds'], [], 'lockedOutTeamIds travels as an array')
  assert.equal(stagePayload['questionSec'], 30, 'the resolved countdown length travels with the payload')
}

// --- styleState survives the payload serialisation unchanged ---------------
// The regression guard for the `Set`-collapses-to-`{}` class of bug that T1
// already shipped once with `consumed`/`lockedOutTeamIds`. `styleState` is NOT
// a named field on `BroadcastPayload` in this tier (no style needs it
// client-side yet), so the round-trip property is proven on the `SessionState`
// value itself — which is the value a future payload field would carry.
{
  const STYLE_STATE = {
    revealedSlots: ['a', 'b'],
    ownership: { c1: 'teamA', c2: null },
    guesses: 3,
    solved: false,
  }
  const stateWithStyle: SessionState = { ...state, styleState: STYLE_STATE }

  const roundTripped = JSON.parse(JSON.stringify(stateWithStyle)) as Record<string, unknown>
  assert.deepEqual(
    roundTripped['styleState'], STYLE_STATE,
    'nested arrays and plain objects in styleState survive JSON serialisation byte-for-byte',
  )

  // Control: this is the exact shape the doc comment forbids. If this ever
  // starts passing, something began converting styleState and the JSON-safety
  // rule can be relaxed — until then it is why the rule exists.
  const withSet = JSON.parse(JSON.stringify({ styleState: { picked: new Set(['a']) } })) as {
    styleState: { picked: unknown }
  }
  assert.deepEqual(
    withSet.styleState.picked, {},
    'a Set in styleState collapses to {} — nothing converts it, unlike consumed',
  )

  // The broadcast path itself still works with a populated styleState, and
  // still leaks nothing: styleState is carried unredacted by design, so the
  // value-based sentinel scan must stay clean.
  const styleCalls: Array<{ channel: string; payload: unknown }> = []
  const styleHandle: TransportHandle = {
    broadcast: (channel, payload) => { styleCalls.push({ channel, payload }) },
    onCommand: () => { /* not used here */ },
    rtt: () => 0,
    stop: async () => { /* not used here */ },
  }
  broadcastState(styleHandle, stateWithStyle, CONFIG)
  assert.equal(styleCalls.length, 3, 'a populated styleState does not disturb the broadcast')
  for (const call of styleCalls.filter(c => c.channel !== 'host')) {
    const serialised = JSON.stringify(call.payload)
    for (const secret of Object.values(SECRETS)) {
      assert.equal(
        serialised.includes(secret), false,
        `${call.channel}: no secret leaks when styleState is populated`,
      )
    }
  }
}

console.log('✓ broadcast redaction + board delivery: all checks passed')
