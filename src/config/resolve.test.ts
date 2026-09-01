import assert from 'node:assert/strict'
import { deepMerge, resolveConfig, rulesForRound, rulesForQuestion, redactQuestion } from './resolve'
import { DEFAULT_CONFIG } from './defaults'
import type { GameShowConfigInput, Round, Question } from './types'

{
  const base = { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] }
  const out = deepMerge(base, { nested: { y: 99 } } as never)
  assert.equal(out.nested.y, 99, 'patch applies')
  assert.equal(out.nested.x, 1, 'sibling keys survive a nested patch')
  assert.equal(out.a, 1, 'untouched keys survive')
}
{
  const out = deepMerge({ arr: [1, 2, 3] }, { arr: [9] } as never)
  assert.deepEqual(out.arr, [9], 'arrays replace, not concat')
}
{
  const base = { a: 1, b: 2 }
  assert.deepEqual(deepMerge(base, undefined), base, 'undefined patch is identity')
  assert.equal(deepMerge(base, { b: undefined } as never).b, 2, 'undefined values skipped')
}

{
  const cfg = resolveConfig({ meta: { id: 't', title: 'Test' } })
  assert.equal(cfg.rules.buzz.graceWindowMs, 200, 'defaults fill in')
  assert.equal(cfg.meta.title, 'Test', 'input wins over defaults')
  assert.equal(cfg.version, DEFAULT_CONFIG.version, 'version inherited')
}
{
  const parent: GameShowConfigInput = {
    meta: { id: 'parent', title: 'P' },
    rules: { timer: { questionSec: 45 }, buzz: { graceWindowMs: 300 } },
  }
  const child: GameShowConfigInput = {
    meta: { id: 'child', title: 'C' },
    extends: 'parent',
    rules: { timer: { questionSec: 15 } },
  }
  const cfg = resolveConfig(child, id => (id === 'parent' ? parent : undefined))
  assert.equal(cfg.rules.timer.questionSec, 15, 'child overrides parent')
  assert.equal(cfg.rules.buzz.graceWindowMs, 300, 'parent value survives')
  assert.equal(cfg.rules.timer.warnAtSec, 5, 'default survives both layers')
}
{
  assert.throws(
    () => resolveConfig(
      { meta: { id: 'a', title: 'A' }, extends: 'b' },
      id => (id === 'b' ? { meta: { id: 'b', title: 'B' }, extends: 'b' } : undefined),
    ),
    /circular/,
    'circular extends is caught, not hung on',
  )
  assert.throws(
    () => resolveConfig({ meta: { id: 'a', title: 'A' }, extends: 'nope' }),
    /not found/,
    'missing preset fails loudly',
  )
}

{
  const cfg = resolveConfig({
    meta: { id: 't', title: 'T' },
    rules: { timer: { questionSec: 30 }, scoring: { multiplier: 1 } },
  })
  const round = {
    id: 'r2', title: 'Double',
    style: { kind: 'grid', columns: 5, rows: 5, pointLadder: [], selection: 'freePick',
             showCategoryHeaders: true, consumedStyle: 'dim', dramaticCategoryReveal: false },
    overrides: { rules: { scoring: { multiplier: 2 }, timer: { questionSec: 20 } } },
  } as unknown as Round

  const rr = rulesForRound(cfg, round)
  assert.equal(rr.scoring.multiplier, 2, 'round override applies')
  assert.equal(rr.timer.questionSec, 20, 'round timer applies')
  assert.equal(rr.timer.warnAtSec, 5, 'unrelated defaults survive round override')

  const q = { id: 'q', kind: 'text', prompt: '', answer: '',
              overrides: { timer: { questionSec: 45 } } } as Question
  const qr = rulesForQuestion(cfg, round, q)
  assert.equal(qr.timer.questionSec, 45, 'question is the deepest layer')
  assert.equal(qr.scoring.multiplier, 2, 'round override still applies under question')
}

{
  const q: Question = {
    id: 'q1', kind: 'text', prompt: 'P', answer: 'SECRET',
    acceptedAnswers: ['SECRET'], hostNote: 'private', correctChoiceIndex: 2, points: 100,
  }
  const stage = redactQuestion(q, 'stage')
  assert.equal(stage.answer, undefined, 'answer stripped for stage')
  assert.equal(stage.acceptedAnswers, undefined, 'accepted answers stripped')
  assert.equal(stage.hostNote, undefined, 'host notes stripped')
  assert.equal(stage.correctChoiceIndex, undefined, 'correct index stripped')
  assert.equal(stage.prompt, 'P', 'prompt survives')
  assert.equal(redactQuestion(q, 'player').answer, undefined, 'answer stripped for players')
  assert.equal(redactQuestion(q, 'host').answer, 'SECRET', 'host keeps the answer')
}


{
  const q: Question = {
    id: 'q-leak', kind: 'survey', prompt: 'Name something you take to school',
    answer: 'Books',
    acceptedAnswers: ['book'],
    hostNote: 'accept plurals',
    correctChoiceIndex: 1,
    numericAnswer: 42,
    numericTolerance: 3,
    fuzzyTolerance: 0.5,
    surveyAnswers: [{ text: 'Books', count: 61 }, { text: 'Lunch', count: 24 }],
    points: 100,
  }

  for (const audience of ['stage', 'player'] as const) {
    const shown = redactQuestion(q, audience)
    const wire = JSON.stringify(shown)

    for (const secret of ['Books', 'accept plurals', 'Lunch', '42']) {
      assert.equal(
        wire.includes(secret), false,
        `${audience} payload must not contain ${JSON.stringify(secret)} — got ${wire}`,
      )
    }
    assert.equal(shown.prompt, q.prompt, `${audience} still needs the prompt`)
    assert.equal(shown.points, 100, `${audience} still needs the point value`)
  }

  assert.equal(redactQuestion(q, 'host').surveyAnswers?.length, 2, 'the host adjudicates, so it keeps everything')
}

console.log('✓ config cascade: all checks passed')
