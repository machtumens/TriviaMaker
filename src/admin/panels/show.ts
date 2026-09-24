import { block, checkbox, field, fields, numberInput, textInput } from '../ui'
import { refresh, rerender, state } from '../store'

/** Identity and the rules that apply to the whole show. */
export function showPanel(): HTMLElement[] {
  const draft = state.draft

  const identity = block('The show', 'The two corners of the projector, shown exactly as you write them. A round can override them.')
  identity.append(fields(
    field('Show title', textInput(draft.title, value => {
      draft.title = value
      refresh()
    }, 'My Game Show')),
    field('Subtitle', textInput(draft.subtitle, value => {
      draft.subtitle = value
      refresh()
    }, 'optional'), '(right corner)'),
  ))

  const clock = block('Clock', 'The default for every round. A round can set its own.')
  const noClock = draft.timerSec === null
  clock.append(fields(
    field('Seconds per question', numberInput(draft.timerSec ?? 60, value => {
      draft.timerSec = Math.max(1, Math.round(value))
      refresh()
    }, { min: 1, max: 900 })),
    field('Run without a clock', checkbox('No timer at all', noClock, value => {
      draft.timerSec = value ? null : 60
      rerender()
    })),
    field('Host controls', checkbox('Host can pause and resume', draft.hostCanPause, value => {
      draft.hostCanPause = value
      refresh()
    })),
  ))

  const scoring = block('Scoring', 'What a right answer is worth and what a wrong one costs.')
  scoring.append(fields(
    field('Points multiplier', numberInput(draft.multiplier, value => {
      draft.multiplier = Math.max(0, value)
      refresh()
    }, { min: 0, step: 0.5 }), '(×1 is face value)'),
    field('Wrong answer penalty', numberInput(draft.penalty, value => {
      draft.penalty = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, step: 10 }), '(0 = none)'),
    field('Penalty size', checkbox(
      'Charge the question’s own value',
      draft.penaltyIsProportional,
      value => {
        draft.penaltyIsProportional = value
        refresh()
      },
    ), '(instead of the flat number)'),
    field('Between rounds', checkbox('Carry scores forward', draft.carryScores, value => {
      draft.carryScores = value
      refresh()
    })),
  ))

  const safety = block('Safety net', 'How far back the host’s Undo can reach on the night.')
  safety.append(fields(
    field('Undo steps', numberInput(draft.undoDepth, value => {
      draft.undoDepth = Math.min(500, Math.max(1, Math.round(value)))
      refresh()
    }, { min: 1, max: 500, step: 10 })),
  ))

  return [identity, clock, scoring, safety]
}
