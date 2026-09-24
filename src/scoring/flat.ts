import type { ScoreDelta, ScoreInput, ScoringPlugin } from '../registry/index'

/** Face value, times the round's multiplier. Wrong answers cost the penalty. */
export const flatScoring: ScoringPlugin = {
  key: 'flat',

  score(input: ScoreInput): ScoreDelta[] {
    const faceValue = (input.question.points ?? 0) * input.rules.scoring.multiplier

    const penalty = input.rules.wrongAnswer.penaltyIsProportional
      ? faceValue
      : input.rules.wrongAnswer.penalty

    const delta = input.correct ? faceValue : (penalty === 0 ? 0 : -penalty)

    return [{
      teamId: input.teamId,
      delta,
      reason: input.correct ? 'correct answer' : 'wrong answer',
    }]
  },
}
