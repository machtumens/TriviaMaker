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
  advanceToNextRound, createSession, currentRound, dispatchHostAction, resolveAnswer,
  resolveRoundContent, styleKeyFor,
} from './session'
import { undo } from './log'
import { resolveConfig } from '../config/resolve'
import type { Intent, SessionState, TeamState } from '../registry/index'
import type { Category, GameShowConfig, ProgramConfig, Round, StyleConfig } from '../config/types'

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

// ---------------------------------------------------------------------------
// T2.2 round-boundary fixtures
// ---------------------------------------------------------------------------

/** `n` rounds, each optionally overridden. Ids are r1..rN. */
function makeRounds(overrides: Array<Partial<Round>>): Round[] {
  return overrides.map((override, index) => ({
    id: `r${index + 1}`,
    title: `Round ${index + 1}`,
    bankId: 'bank',
    style: GRID,
    ...override,
  }))
}

function makeMultiRoundConfig(
  rounds: Round[],
  program: Partial<ProgramConfig> = {},
): GameShowConfig {
  const base = resolveConfig({ meta: { id: 'session-multi', title: 'Session Multi' } })
  return {
    ...base,
    program: { ...base.program, ...program, rounds },
    content: { banks: [{ id: 'bank', title: 'Bank', categories: categories() }] },
  }
}

function team(id: string, score: number, eliminated = false): TeamState {
  return {
    id, name: id.toUpperCase(), color: '#fff',
    score, streak: 0, lifelinesUsed: {}, eliminated,
  }
}

/** A session parked in `reveal` — the only phase a round boundary starts from. */
function revealState(config: GameShowConfig, teams: TeamState[], roundIndex = 0): SessionState {
  return { ...createSession(config), phase: 'reveal', roundIndex, teams }
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

// ===========================================================================
// advanceToNextRound — the full branch matrix (T2.2-L1 .. L6)
// ===========================================================================

// --- normal advance: one advance, straight to the board --------------------
{
  const config = makeMultiRoundConfig(makeRounds([{}, {}]))
  const state = revealState(config, [team('a', 10), team('b', 20)])
  assert.deepEqual(
    advanceToNextRound(state),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'board' }],
    'a plain round boundary is exactly one advance and one setPhase',
  )
}

// --- intermissionAfter wins over the entered round's intro -----------------
{
  const config = makeMultiRoundConfig(makeRounds([
    { intermissionAfter: { enabled: true, text: 'Back in 5' } },
    { intro: { enabled: true, durationMs: 1, text: 'Round 2' } },
  ]))
  const state = revealState(config, [team('a', 10)])
  assert.deepEqual(
    advanceToNextRound(state),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'intermission' }],
    "the finished round's intermission is entered first, even though the next round has an intro",
  )
}

// --- no intermission + the entered round has an intro -> roundIntro --------
{
  const config = makeMultiRoundConfig(makeRounds([
    {},
    { intro: { enabled: true, durationMs: 1, text: 'Round 2' } },
  ]))
  const state = revealState(config, [team('a', 10)])
  assert.deepEqual(
    advanceToNextRound(state),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'roundIntro' }],
    'reveal -> roundIntro is the no-intermission boundary (needs the T2.2-L7 edge)',
  )
}
{
  // intro present but DISABLED is not an intro.
  const config = makeMultiRoundConfig(makeRounds([
    {},
    { intro: { enabled: false, durationMs: 1, text: 'Round 2' } },
  ]))
  const state = revealState(config, [team('a', 10)])
  assert.deepEqual(
    advanceToNextRound(state).at(-1), { type: 'setPhase', phase: 'board' },
    'intro.enabled false lands on the board, not a title card',
  )
}

// --- carryScores: false resets every non-zero score IN THE SAME BATCH ------
{
  const config = makeMultiRoundConfig(makeRounds([{}, {}]), { carryScores: false })
  const state = revealState(config, [team('a', 300), team('b', 0), team('c', -50)])
  const intents = advanceToNextRound(state)
  assert.deepEqual(
    intents,
    [
      { type: 'awardPoints', teamId: 'a', delta: -300, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'awardPoints', teamId: 'c', delta: 50, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'advanceRound' },
      { type: 'setPhase', phase: 'board' },
    ],
    'the reset rides in the SAME batch as the advance, so one undo restores both',
  )
  assert.equal(
    intents.filter(i => i.type === 'awardPoints' && i.teamId === 'b').length, 0,
    'a team already on 0 gets no no-op awardPoints intent',
  )
}
{
  const config = makeMultiRoundConfig(makeRounds([{}, {}]), { carryScores: true })
  const state = revealState(config, [team('a', 300)])
  assert.equal(
    advanceToNextRound(state).some(i => i.type === 'awardPoints'), false,
    'carryScores true resets nothing',
  )
}

// --- eliminateLowest: one clear loser --------------------------------------
{
  const config = makeMultiRoundConfig(makeRounds([{ eliminateLowest: true }, {}]))
  const state = revealState(config, [team('a', 30), team('b', 5), team('c', 20)])
  assert.deepEqual(
    advanceToNextRound(state),
    [
      { type: 'eliminate', teamId: 'b' },
      { type: 'advanceRound' },
      { type: 'setPhase', phase: 'board' },
    ],
    'the elimination is the FIRST element of the same batch as the advance (T2.2-L2)',
  )
}
{
  // Already-eliminated teams are not candidates, however low their score.
  const config = makeMultiRoundConfig(makeRounds([{ eliminateLowest: true }, {}]))
  const state = revealState(config, [team('a', 30), team('b', -999, true), team('c', 20)])
  assert.deepEqual(
    advanceToNextRound(state)[0], { type: 'eliminate', teamId: 'c' },
    'the lowest LIVE team goes, not the lowest score overall',
  )
}

// --- eliminateLowest: a tie is never auto-resolved (T2.2-L3) ---------------
{
  const config = makeMultiRoundConfig(makeRounds([{ eliminateLowest: true }, {}]))
  const state = revealState(config, [team('a', 30), team('b', 5), team('c', 5)])
  assert.throws(
    () => advanceToNextRound(state),
    /eliminateLowest tie between 2 teams — B \(b\), C \(c\)\. Resend "advanceRound" with eliminateTeamId/,
    'a tie throws, naming every tied team and how to resolve it',
  )
  assert.deepEqual(
    advanceToNextRound(state, { eliminateTeamId: 'c' })[0], { type: 'eliminate', teamId: 'c' },
    "the host's choice among the tied teams is honoured",
  )
  assert.throws(
    () => advanceToNextRound(state, { eliminateTeamId: 'a' }),
    /eliminateLowest tie between 2 teams/,
    'an id OUTSIDE the tied set is rejected exactly like no id at all — never silently obeyed',
  )
  assert.throws(
    () => advanceToNextRound(state, { eliminateTeamId: 'nobody' }),
    /eliminateLowest tie between 2 teams/,
    'an unknown id is rejected too',
  )
}

// --- eliminateLowest with nothing to contest -------------------------------
{
  const config = makeMultiRoundConfig(makeRounds([{ eliminateLowest: true }, {}]))
  const oneLeft = revealState(config, [team('a', 30), team('b', 5, true)])
  assert.deepEqual(
    advanceToNextRound(oneLeft),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'board' }],
    'with one team left there is nobody to eliminate',
  )
  const noneLeft = revealState(config, [team('a', 30, true), team('b', 5, true)])
  assert.deepEqual(
    advanceToNextRound(noneLeft),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'board' }],
    'with zero teams left it still does not throw or emit Math.min(...[]) nonsense',
  )
}

// --- minTeams skips rounds, in the same batch (T2.2-L5) --------------------
{
  const config = makeMultiRoundConfig(makeRounds([
    {},
    { minTeams: 4 },
    { minTeams: 2 },
  ]))
  const state = revealState(config, [team('a', 10), team('b', 20)])
  assert.deepEqual(
    advanceToNextRound(state),
    [
      { type: 'advanceRound' },
      { type: 'advanceRound' },
      { type: 'setPhase', phase: 'board' },
    ],
    'a skipped round is one extra advanceRound in the SAME batch, not a second host action',
  )
}
{
  // The skip check runs against the POST-elimination count.
  const config = makeMultiRoundConfig(makeRounds([
    { eliminateLowest: true },
    { minTeams: 3 },
    { minTeams: 2 },
  ]))
  const state = revealState(config, [team('a', 10), team('b', 20), team('c', 30)])
  assert.deepEqual(
    advanceToNextRound(state),
    [
      { type: 'eliminate', teamId: 'a' },
      { type: 'advanceRound' },
      { type: 'advanceRound' },
      { type: 'setPhase', phase: 'board' },
    ],
    'round 2 needs 3 teams and only 2 survive this batch, so it is skipped',
  )
}
{
  // minTeams undefined / 0 never skips.
  const config = makeMultiRoundConfig(makeRounds([{}, { minTeams: 0 }, {}]))
  const state = revealState(config, [])
  assert.deepEqual(
    advanceToNextRound(state),
    [{ type: 'advanceRound' }, { type: 'setPhase', phase: 'board' }],
    'minTeams 0 means always playable',
  )
}

// --- every remaining round fails minTeams: the show ends, index unmoved ----
{
  const config = makeMultiRoundConfig(makeRounds([
    { eliminateLowest: true },
    { minTeams: 5 },
    { minTeams: 5 },
  ]), { carryScores: false })
  const state = revealState(config, [team('a', 10), team('b', 20)])
  const intents = advanceToNextRound(state)
  assert.deepEqual(
    intents,
    [
      { type: 'eliminate', teamId: 'a' },
      { type: 'awardPoints', teamId: 'a', delta: -10, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'awardPoints', teamId: 'b', delta: -20, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'setPhase', phase: 'final' },
    ],
    'a full cascade ends the show; the elimination and reset computed earlier still ride along',
  )
  assert.equal(
    intents.filter(i => i.type === 'advanceRound').length, 0,
    'ZERO advanceRound intents — roundIndex must stay valid, broadcastState reads it in every phase including final',
  )
}

// --- T2.2-L1 layer A: the last round rejects the command outright ----------
{
  const config = makeMultiRoundConfig(makeRounds([{}, {}]))
  const state = revealState(config, [team('a', 10)], 1)
  assert.throws(
    () => advanceToNextRound(state),
    /round "r2" is the last round; call "endRound"/,
    'the last round names itself and points at the right command, instead of crashing the next broadcast',
  )
}
{
  const config = makeMultiRoundConfig(makeRounds([{}]))
  const state = revealState(config, [team('a', 10)])
  assert.throws(
    () => advanceToNextRound(state),
    /round "r1" is the last round/,
    'a one-round show can never advance at all',
  )
}

// --- the phase guard (T2.2-L10's defensive floor) --------------------------
{
  const config = makeMultiRoundConfig(makeRounds([{}, {}]))
  for (const phase of ['board', 'lobby', 'armed', 'final'] as const) {
    const state: SessionState = { ...revealState(config, [team('a', 10)]), phase }
    assert.throws(
      () => advanceToNextRound(state),
      new RegExp(`phase must be "reveal", got "${phase}"`),
      `advancing from "${phase}" is refused`,
    )
  }
}

// --- the batch really is ONE undoable host action --------------------------
{
  const config = makeMultiRoundConfig(makeRounds([
    { eliminateLowest: true },
    { intro: { enabled: true, durationMs: 1, text: 'Round 2' } },
  ]), { carryScores: false })
  const before = revealState(config, [team('a', 10), team('b', 20)])
  const applied = dispatchHostAction(before, advanceToNextRound(before), 1, 1000)

  assert.equal(applied.state.log.length, 1, 'the whole round boundary is ONE event')
  assert.equal(applied.state.roundIndex, 1, 'the round advanced')
  assert.equal(applied.state.phase, 'roundIntro', 'and landed on the entered round\'s intro')
  assert.equal(applied.state.teams[0]?.eliminated, true, 'the lowest team was eliminated')
  assert.equal(applied.state.teams[0]?.score, 0, 'and scores were reset')
  assert.equal(applied.state.teams[1]?.score, 0, 'for every team')

  const reverted = undo(applied.state, applied.state.config.runtime.undo.depth)
  assert.equal(reverted.undone, true, 'one press takes the whole boundary back')
  assert.equal(reverted.state.roundIndex, 0, 'roundIndex rewound')
  assert.equal(reverted.state.phase, 'reveal', 'phase rewound')
  assert.equal(reverted.state.teams[0]?.eliminated, false, 'the elimination rewound')
  assert.equal(reverted.state.teams[0]?.score, 10, 'and both scores')
  assert.equal(reverted.state.teams[1]?.score, 20, 'by the SAME single undo')
  assert.equal(reverted.state.log.length, 2, 'log is 2 (action + reversal), never 3')
}

console.log('✓ session: all checks passed')
