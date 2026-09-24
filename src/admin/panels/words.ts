import { defaultCopy } from '../draft'
import { block, button, el, field, fields, textInput } from '../ui'
import { refresh, rerender, state } from '../store'

/** Every string the host and projector render from config rather than markup. */
export function wordsPanel(): HTMLElement[] {
  const copy = state.draft.copy

  const projector = block('On the projector', 'The only line the board takes from here.')
  projector.append(fields(
    field('Question value', textInput(copy.forPoints, value => {
      copy.forPoints = value
      refresh()
    }, 'for {points}'), '({points} is replaced with the number)'),
  ))

  const host = block(
    'On the host controls',
    'Rename the buttons to whatever you say out loud — "Benar" and "Salah" if the show runs in Indonesian.',
  )
  const entries: Array<{ label: string; key: 'arm' | 'correct' | 'wrong' | 'skip' | 'next' | 'endRound' }> = [
    { label: 'Arm buzzers', key: 'arm' },
    { label: 'Correct', key: 'correct' },
    { label: 'Wrong', key: 'wrong' },
    { label: 'Skip', key: 'skip' },
    { label: 'Next', key: 'next' },
    { label: 'End round', key: 'endRound' },
  ]
  host.append(fields(...entries.map(entry => {
    return field(entry.label, textInput(copy[entry.key], value => {
      copy[entry.key] = value
      refresh()
    }))
  })))

  const reset = el('div', 'row')
  reset.append(button('Back to the defaults', 'ghost add', () => {
    state.draft.copy = defaultCopy()
    rerender()
  }))
  host.append(reset)

  return [projector, host]
}
