/**
 * Flat scoring — PLAN Sub-Phase 3 (item 15), SPEC AC#8, invariant #3.
 *
 * Purity is proven by handing the plugin a DEEP-FROZEN state: in an ES module
 * (always strict mode) any assignment to a frozen object throws immediately.
 * A plugin that mutated state would blow up here instead of silently corrupting
 * the undo log months later.
 */

import assert from 'node:assert/strict'
import { flatScoring } from './flat'
import { resolveConfig } from '../config/resolve'
import type { ScoreDelta, ScoreInput, SessionState } from '../registry/index'
import type { GameShowConfig, Question, RuleSet } from '../config/types'

const BASE_CONFIG: GameShowConfig = resolveConfig({ meta: { id: 'flat', title: 'Flat' } })

const QUESTION: Question = {
  id: 'q1', kind: 'text', prompt: 'Red planet?', answer: 'Mars', points: 200,
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value
  const target = value as unknown as object
  if (seen.has(target)) return value
  seen.add(target)
  Object.freeze(target)
  for (const key of Object.getOwnPropertyNames(target)) {
    deepFreeze((target as Record<string, unknown>)[key], seen)
  }
  return value
}

function makeState(): SessionState {
  return {
    id: 'session', joinCode: '000000', config: BASE_CONFIG,
    phase: 'armed', roundIndex: 0, currentQuestionId: 'q1',
    consumed: new Set<string>(),
    teams: [{ id: 'a', name: 'A', color: '#f00', score: 500, streak: 2, lifelinesUsed: {}, eliminated: false }],
    players: [], buzzes: [], turnTeamId: 'a', attemptsUsed: 0,
    lockedOutTeamIds: new Set<string>(), clockStartedAt: null, styleState: {}, log: [],
  }
}

function rulesWith(patch: (rules: RuleSet) => RuleSet): RuleSet {
  return patch(structuredClone(BASE_CONFIG.rules))
}

function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    state: deepFreeze(makeState()),
    rules: BASE_CONFIG.rules,
    question: QUESTION,
    teamId: 'a',
    correct: true,
    elapsedMs: 1200,
    isSteal: false,
    ...overrides,
  }
}

// --- purity + determinism (SPEC AC#8) ---------------------------------------
{
  const input = makeInput()
  let first: ScoreDelta[] | undefined
  let second: ScoreDelta[] | undefined
  assert.doesNotThrow(() => { first = flatScoring.score(input) }, 'score() never writes to frozen state')
  assert.doesNotThrow(() => { second = flatScoring.score(input) }, 'a second call also never writes')
  assert.deepEqual(first, second, 'two calls with the same input are deep-equal')
  assert.equal(input.state.teams[0]?.score, 500, 'the input state is untouched')
}

// --- correct-answer formula --------------------------------------------------
{
  const delta = flatScoring.score(makeInput())[0]
  assert.equal(delta?.delta, 200, 'face value at multiplier 1')
  assert.equal(delta?.teamId, 'a', 'the delta names the answering team')
  assert.equal(delta?.reason, 'correct answer', 'the reason makes a score dispute readable')
}
{
  const rules = rulesWith(r => ({ ...r, scoring: { ...r.scoring, multiplier: 2 } }))
  const delta = flatScoring.score(makeInput({ rules }))[0]
  assert.equal(delta?.delta, 400, 'a double-points round doubles the face value')
}
{
  const rules = rulesWith(r => ({
    ...r,
    wrongAnswer: { ...r.wrongAnswer, stealValueMultiplier: 0.5 },
  }))
  const delta = flatScoring.score(makeInput({ rules, isSteal: true }))[0]
  assert.equal(delta?.delta, 100, 'a steal is worth its configured fraction')
}

// --- wrong-answer formula ----------------------------------------------------
{
  const delta = flatScoring.score(makeInput({ correct: false }))[0]
  assert.equal(delta?.delta, 0, 'default penalty is 0 — no loss for a wrong answer')
  assert.equal(delta?.reason, 'wrong answer', 'the reason distinguishes the outcome')
}
{
  const rules = rulesWith(r => ({ ...r, wrongAnswer: { ...r.wrongAnswer, penalty: 50 } }))
  const delta = flatScoring.score(makeInput({ correct: false, rules }))[0]
  assert.equal(delta?.delta, -50, 'a flat penalty is subtracted')
}
{
  const rules = rulesWith(r => ({
    ...r,
    wrongAnswer: { ...r.wrongAnswer, penaltyIsProportional: true, penalty: 50 },
  }))
  const delta = flatScoring.score(makeInput({ correct: false, rules }))[0]
  assert.equal(delta?.delta, -200, 'a proportional penalty costs the question face value')
}
{
  const noPoints: Question = { id: 'q2', kind: 'text', prompt: 'P', answer: 'A' }
  const delta = flatScoring.score(makeInput({ question: noPoints }))[0]
  assert.equal(delta?.delta, 0, 'a question with no points is worth nothing, not NaN')
}

// --- (d) streak/comeback warn ONCE per process and never change the score ---
{
  const plainDelta = flatScoring.score(makeInput())
  const streakRules = rulesWith(r => ({
    ...r,
    scoring: { ...r.scoring, streak: { ...r.scoring.streak, enabled: true, threshold: 2 } },
  }))

  const originalWarn = console.warn
  const captured: string[] = []
  console.warn = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
  let firstCall: ScoreDelta[]
  let secondCall: ScoreDelta[]
  try {
    firstCall = flatScoring.score(makeInput({ rules: streakRules }))
    secondCall = flatScoring.score(makeInput({ rules: streakRules }))
  } finally {
    console.warn = originalWarn
  }

  assert.equal(captured.length, 1, 'the warning fires exactly once per process, not once per call')
  assert.ok(captured[0]?.includes('streak'), 'the warning names the enabled-but-unimplemented flag')
  assert.deepEqual(firstCall, plainDelta, 'enabling streak does not change the score')
  assert.deepEqual(secondCall, plainDelta, 'and still does not on the second call')
}

console.log('✓ flat scoring: all checks passed')
