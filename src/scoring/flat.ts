/**
 * FLAT SCORING — face value, no speed weighting. Registry key: `'flat'`.
 *
 * `score()` MUST be pure (invariant #3). Purity is not a style preference here:
 * undo replays deltas, so a scoring engine that reached into state and mutated
 * something would make the log a lie and score disputes unresolvable.
 *
 * T1 scope note (Design Lock L5): `rules.scoring.streak` and
 * `rules.scoring.comeback` are NOT implemented. They are T2 per the SPEC
 * capability inventory. Rather than fail silently — which on stage looks like
 * "the software is cheating" — a config that enables either gets one loud
 * warning per process.
 */

import type { ScoreDelta, ScoreInput, ScoringPlugin } from '../registry/index'
import type { RuleSet } from '../config/types'

const NO_STEAL_MULTIPLIER = 1

/** `-(0)` is `-0` in JS. A zero penalty must read as 0, not -0. */
function negate(value: number): number {
  return value === 0 ? 0 : -value
}

/** Module-level: warn ONCE per process, not once per question. */
let bonusWarningIssued = false

function warnOnceOnUnimplementedBonuses(rules: RuleSet): void {
  if (bonusWarningIssued) return
  const enabled: string[] = []
  if (rules.scoring.streak?.enabled) enabled.push('scoring.streak')
  if (rules.scoring.comeback?.enabled) enabled.push('scoring.comeback')
  if (enabled.length === 0) return

  bonusWarningIssued = true
  console.warn(
    `[scoring:flat] ${enabled.join(' and ')} ${enabled.length === 1 ? 'is' : 'are'} enabled in this config, ` +
    'but the "flat" engine does not implement bonus scoring (Design Lock L5 — T2 scope). ' +
    'Scores will be face value only.',
  )
}

export const flatScoring: ScoringPlugin = {
  key: 'flat',

  score(input: ScoreInput): ScoreDelta[] {
    warnOnceOnUnimplementedBonuses(input.rules)

    const faceValue = (input.question.points ?? 0) * input.rules.scoring.multiplier

    const delta = input.correct
      ? faceValue * (input.isSteal ? input.rules.wrongAnswer.stealValueMultiplier : NO_STEAL_MULTIPLIER)
      : negate(input.rules.wrongAnswer.penaltyIsProportional
        ? faceValue
        : input.rules.wrongAnswer.penalty)

    return [{
      teamId: input.teamId,
      delta,
      reason: input.correct ? 'correct answer' : 'wrong answer',
    }]
  },
}
