import { defaultMotion, type EasingKey } from '../draft'
import { block, button, checkbox, el, field, fields, numberInput, select } from '../ui'
import { refresh, rerender, state } from '../store'

const EASING_LABELS: Array<{ label: string; value: EasingKey }> = [
  { label: 'Smooth — settles, no overshoot', value: 'smooth' },
  { label: 'Bouncy — overshoots and springs back', value: 'bouncy' },
  { label: 'Even — same speed throughout', value: 'even' },
]

export function motionPanel(): HTMLElement[] {
  const motion = state.draft.motion

  const master = block('Movement', 'Turn it all off for a slow projector, or slow it down so the room can follow.')
  master.append(fields(
    field('Animation', checkbox('Animate the show', motion.enabled, value => {
      motion.enabled = value
      rerender()
    })),
    field('Accessibility', checkbox(
      'Respect the viewer’s reduced-motion setting',
      motion.respectReducedMotion,
      value => {
        motion.respectReducedMotion = value
        refresh()
      },
    )),
    field('Speed', numberInput(motion.speed, value => {
      motion.speed = Math.min(4, Math.max(0.1, value))
      refresh()
    }, { min: 0.1, max: 4, step: 0.1 }), '(below 1 is slower)'),
    field('Curve', select(EASING_LABELS, motion.easing, value => {
      motion.easing = value === 'bouncy' ? 'bouncy' : value === 'even' ? 'even' : 'smooth'
      refresh()
    })),
  ))

  const timings = block('Timings', 'Milliseconds, before the speed dial above is applied.')
  const entries: Array<{ label: string; key: 'questionEnter' | 'answerReveal' | 'scoreCount' | 'phaseTransition' | 'buzzFlash'; note: string }> = [
    { label: 'Question opens', key: 'questionEnter', note: '(the card flying in)' },
    { label: 'Answer flips', key: 'answerReveal', note: '(a slot turning over)' },
    { label: 'Score counts up', key: 'scoreCount', note: '(the number rolling)' },
    { label: 'Screen change', key: 'phaseTransition', note: '(board ↔ question)' },
    { label: 'Buzz flash', key: 'buzzFlash', note: '' },
  ]
  timings.append(fields(...entries.map(entry => {
    return field(entry.label, numberInput(motion[entry.key], value => {
      motion[entry.key] = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 5000, step: 20 }), entry.note)
  })))

  const reset = el('div', 'row')
  reset.append(button('Back to the defaults', 'ghost add', () => {
    state.draft.motion = defaultMotion()
    rerender()
  }))
  timings.append(reset)

  return [master, timings]
}
