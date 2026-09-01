import type { BroadcastPayload } from '../engine/broadcast'

interface ControlOptions {
  send: (type: string, payload?: unknown) => void
  onHostFrame: (listener: (payload: BroadcastPayload) => void) => void
  roundCount: number
}

const PICKABLE_PHASES = new Set(['board'])

function button(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const node = document.createElement('button')
  node.className = `demo-button ${variant}`.trim()
  node.textContent = label
  node.addEventListener('click', onClick)
  return node
}

export function mountControls(options: ControlOptions): void {
  const bar = document.createElement('div')
  bar.className = 'demo-controls'
  document.body.append(bar)

  const status = document.createElement('span')
  status.className = 'demo-status'

  const answer = document.createElement('span')
  answer.className = 'demo-answer'

  const actions = document.createElement('div')
  actions.className = 'demo-actions'

  bar.append(status, answer, actions)

  options.onHostFrame(payload => {
    status.textContent = `${payload.round.title} · ${payload.phase}`

    const secret = payload.currentQuestion?.answer
    answer.textContent = secret ? `answer: ${secret}` : ''

    actions.replaceChildren()

    if (payload.phase === 'lobby') {
      actions.append(button('Start', () => options.send('start'), 'primary'))
      return
    }

    if (payload.phase === 'roundIntro' || payload.phase === 'intermission') {
      actions.append(button('Continue', () => options.send('continue'), 'primary'))
      return
    }

    if (payload.phase === 'final') {
      actions.append(button('Reload to play again', () => location.reload()))
      return
    }

    if (PICKABLE_PHASES.has(payload.phase)) {
      const remaining = payload.availableQuestionIds.length
      if (remaining === 0) {
        const last = payload.roundIndex >= options.roundCount - 1
        actions.append(
          button(last ? 'End show' : 'Next round',
            () => options.send(last ? 'endRound' : 'advanceRound'), 'primary'),
        )
      } else {
        actions.append(button(`Pick a tile above · ${remaining} left`, () => {}, 'hint'))
      }
    }

    if (payload.phase === 'reading') {
      actions.append(button('Arm', () => options.send('arm'), 'primary'))
    }

    if (payload.phase === 'armed' || payload.phase === 'adjudicate') {
      for (const team of payload.teams) {
        actions.append(button(`✓ ${team.name}`,
          () => options.send('markCorrect', { teamId: team.id })))
      }
      actions.append(button('✗ Nobody',
        () => options.send('markWrong', { teamId: payload.teams[0]?.id ?? '' })))
    }

    if (payload.phase === 'reveal') {
      actions.append(button('Next', () => options.send('next'), 'primary'))
    }

    actions.append(button('Undo', () => options.send('undo'), 'ghost'))
  })
}

export function mountTilePicker(send: (type: string, payload?: unknown) => void): void {
  document.addEventListener('click', event => {
    const target = (event.target as HTMLElement | null)?.closest('.tile')
    if (!(target instanceof HTMLElement)) return
    const questionId = target.dataset['questionId']
    if (questionId && target.dataset['consumed'] !== 'true') {
      send('select', { questionId })
    }
  })
}
