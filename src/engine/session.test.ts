/**
 * Session — PLAN Sub-Phase 2 (item 11a), SPEC AC#11 / AC#18, invariant #2.
 *
 * The headline assertion is the `structuredClone` one. "Content is snapshotted
 * at launch" is the invariant that stops an editor tweak from silently changing
 * a question the host has already read out; a shallow copy would pass every
 * other test in this suite and fail exactly once, live.
 *
 * The rest covers `resolveRoundContent`'s failure paths. Every one of them is a
 * show-authoring mistake, and every one throws with the round id and the known
 * alternatives — a silently-empty board is the outcome being designed out.
 */

import assert from 'node:assert/strict'
import '../registry/bootstrap'
import {
  createSession, currentRound, dispatchHostAction, resolveAnswer,
  resolveRoundContent, styleKeyFor,
} from './session'
import { undo } from './log'
import { resolveConfig } from '../config/resolve'
import type { Intent } from '../registry/index'
import type { Category, GameShowConfig, Round, StyleConfig } from '../config/types'

const GRID: StyleConfig = {
  kind: 'grid', columns: 2, rows: 2, pointLadder: [100, 200],
  selection: 'freePick', showCategoryHeaders: true,
  consumedStyle: 'dim', dramaticCategoryReveal: false,
}

function categories(): Category[] {
  return [
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
}

function makeConfig(round: Partial<Round> = {}): GameShowConfig {
  const base = resolveConfig({ meta: { id: 'session', title: 'Session' } })
  const fullRound: Round = { id: 'r1', title: 'Round 1', bankId: 'bank', style: GRID, ...round }
  return {
    ...base,
    program: { ...base.program, rounds: [fullRound] },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: categories() }] },
    teams: {
      ...base.teams,
      teams: [
        { id: 'a', name: 'Team A', color: '#f00' },
        { id: 'b', name: 'Team B', color: '#00f', startingScore: 250 },
      ],
    },
  }
}

// --- invariant #2: content is snapshotted at launch -------------------------
{
  const config = makeConfig()
  const session = createSession(config)

  const sourceQuestion = config.content.banks[0]?.categories[0]?.questions[0]
  assert.ok(sourceQuestion, 'fixture question exists')
  sourceQuestion.prompt = 'EDITED AFTER LAUNCH'
  sourceQuestion.answer = 'EDITED ANSWER'
  const sourceRound = config.program.rounds[0]
  assert.ok(sourceRound, 'fixture round exists')
  sourceRound.title = 'EDITED TITLE'
  config.content.banks.push({ id: 'late', title: 'Late', categories: [] })

  const snapshot = session.config.content.banks[0]?.categories[0]?.questions[0]
  assert.equal(snapshot?.prompt, 'A100?', 'the session keeps the launch-time prompt')
  assert.equal(snapshot?.answer, 'a100', 'and the launch-time answer')
  assert.equal(session.config.program.rounds[0]?.title, 'Round 1', 'and the launch-time round title')
  assert.equal(session.config.content.banks.length, 1, 'a bank added after launch does not appear')
  assert.notEqual(session.config, config, 'the session config is a distinct object')
}

// --- initial session shape ---------------------------------------------------
{
  const session = createSession(makeConfig())
  assert.equal(session.phase, 'lobby', 'a session starts in the lobby')
  assert.equal(session.roundIndex, 0, 'on the first round')
  assert.equal(session.currentQuestionId, null, 'with nothing selected')
  assert.equal(session.consumed.size, 0, 'and nothing consumed')
  assert.deepEqual(session.styleState, {}, 'and an empty style-state bag')
  assert.deepEqual(session.log, [], 'and an empty log')
  assert.equal(session.teams.length, 2, 'pre-authored teams are seeded')
  assert.equal(session.teams[0]?.score, 0, 'default starting score is 0')
  assert.equal(session.teams[1]?.score, 250, 'an authored handicap is honoured')
  assert.equal(session.joinCode.length, 6, 'a join code of the configured length is generated')
  assert.ok(session.id.length > 0, 'the session has an id')
}
{
  const session = createSession(makeConfig(), { id: 'fixed-id', joinCode: 'ABC123' })
  assert.equal(session.id, 'fixed-id', 'an explicit id is used verbatim')
  assert.equal(session.joinCode, 'ABC123', 'an explicit join code is used verbatim')
}

// --- resolveRoundContent: happy paths ---------------------------------------
{
  const config = makeConfig()
  const round = currentRound(config, 0)
  assert.equal(styleKeyFor(round), 'grid', 'a built-in kind is its own registry key')

  const all = resolveRoundContent(config, round)
  assert.equal(all.length, 2, 'no categoryIds means the whole bank, in bank order')
  assert.equal(all[0]?.id, 'cat-a', 'bank order preserved')
}
{
  const config = makeConfig({ categoryIds: ['cat-b', 'cat-a'] })
  const resolved = resolveRoundContent(config, currentRound(config, 0))
  assert.deepEqual(
    resolved.map(c => c.id), ['cat-b', 'cat-a'],
    "the author's explicit ordering wins over bank order",
  )
}

// --- resolveRoundContent: every failure path is loud (AC#18) ---------------
{
  const config = makeConfig()
  const round: Round = { id: 'r-nobank', title: 'No bank', style: GRID }
  assert.throws(
    () => resolveRoundContent(config, round),
    /round "r-nobank": no bankId set/,
    'a round with no bankId fails by name',
  )
}
{
  const config = makeConfig({ bankId: 'missing-bank' })
  assert.throws(
    () => resolveRoundContent(config, currentRound(config, 0)),
    /bankId "missing-bank" not found in content\.banks\. Known banks: bank/,
    'an unknown bank lists the known ones',
  )
}
{
  const config = makeConfig({ categoryIds: ['cat-a', 'nope'] })
  assert.throws(
    () => resolveRoundContent(config, currentRound(config, 0)),
    /unknown category "nope" in bank "bank"\. Known categories: cat-a, cat-b/,
    'an unknown category fails on the first bad id rather than dropping it',
  )
}
{
  const config = makeConfig({ categoryIds: [] })
  assert.throws(
    () => resolveRoundContent(config, currentRound(config, 0)),
    /categoryIds is an empty array/,
    'a present-but-empty categoryIds is an error, not a zero-column board',
  )
}
{
  const base = makeConfig()
  const config: GameShowConfig = {
    ...base,
    content: { banks: [{ id: 'bank', title: 'Bank', categories: [] }] },
  }
  assert.throws(
    () => resolveRoundContent(config, currentRound(config, 0)),
    /bank "bank" has zero categories/,
    'a bank with no categories is an error, not a zero-column board',
  )
}

// --- currentRound fails loudly rather than rendering a blank show ----------
{
  const config = makeConfig()
  assert.throws(
    () => currentRound(config, 5),
    /no round at index 5; program\.rounds has 1/,
    'an out-of-range round index names the range',
  )
}

// --- dispatchHostAction: one host action, one event ------------------------
{
  const state = createSession(makeConfig())
  const intents: Intent[] = [{ type: 'setPhase', phase: 'board' }]
  const result = dispatchHostAction(state, intents, 1, 1000)
  assert.equal(result.state.log.length, 1, 'one event was appended')
  assert.equal(result.event.seq, 1, 'the caller-supplied seq is used')
  assert.equal(result.state.phase, 'board', 'the intent was applied')

  const reverted = undo(result.state, result.state.config.runtime.undo.depth)
  assert.equal(reverted.undone, true, 'the action is undoable through the same path')
  assert.equal(reverted.state.phase, 'lobby', 'and lands back in the lobby')
}

// --- resolveAnswer: the generic 3-intent adjudication shape (L6) -----------
{
  let state = createSession(makeConfig())
  state = dispatchHostAction(state, [{ type: 'setPhase', phase: 'board' }], 1, 1000).state
  state = dispatchHostAction(state, [
    { type: 'selectQuestion', questionId: 'a-200' },
    { type: 'setPhase', phase: 'reading' },
  ], 2, 2000).state
  state = dispatchHostAction(state, [{ type: 'setPhase', phase: 'armed' }], 3, 3000).state

  const intents = resolveAnswer(state, { teamId: 'a', correct: true, elapsedMs: 1500 })
  assert.deepEqual(
    intents,
    [
      { type: 'awardPoints', teamId: 'a', delta: 200, reason: 'correct answer' },
      { type: 'consumeQuestion', questionId: 'a-200' },
      { type: 'setPhase', phase: 'reveal' },
    ],
    'award, consume, then a TRAILING setPhase — grid contributes no extra intents',
  )

  const applied = dispatchHostAction(state, intents, 4, 4000)
  assert.equal(applied.state.log.length, 4, 'the whole adjudication is ONE more event')
  assert.equal(applied.state.teams[0]?.score, 200, 'the team was awarded')

  const reverted = undo(applied.state, applied.state.config.runtime.undo.depth)
  assert.equal(reverted.state.teams[0]?.score, 0, 'one undo reverses the award')
  assert.equal(reverted.state.consumed.has('a-200'), false, 'and the consumption')
  assert.equal(reverted.state.phase, 'armed', 'and the phase')
}
{
  let state = createSession(makeConfig())
  state = dispatchHostAction(state, [{ type: 'setPhase', phase: 'board' }], 1, 1000).state
  assert.throws(
    () => resolveAnswer(state, { teamId: 'a', correct: true }),
    /no question is selected/,
    'adjudicating with nothing selected fails by name',
  )
}

console.log('✓ session: all checks passed')
