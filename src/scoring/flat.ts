import type { ScoreDelta, ScoreInput, ScoringPlugin } from '../registry/index'
import type { RuleSet } from '../config/types'

const NO_STEAL_MULTIPLIER = 1

function negate(value: number): number {
  return value === 0 ? 0 : -value
}

let bonusWarningIssued = false

function warnOnceOnUnimplementedBonuses(rules: RuleSet): void {
  if (bonusWarningIssued) return
  const enabled: string[] = []
  if (rules.scoring.streak?.enabled) enabled.push('scoring.streak')
  if (rules.scoring.comeback?.enabled) enabled.push('scoring.comeback')
  if (rules.scoring.wager?.enabled) enabled.push('scoring.wager')
  if (enabled.length === 0) return

  bonusWarningIssued = true
  console.warn(
    `[scoring:flat] ${enabled.join(' and ')} ${enabled.length === 1 ? 'is' : 'are'} enabled in this config, ` +
    'but the "flat" engine does not implement bonus scoring. ' +
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
