import type { BroadcastPayload } from '../engine/broadcast'

type HostTeam = BroadcastPayload['teams'][number]
type HostRoundConfig = BroadcastPayload['config']['program']['rounds'][number]

const HOST_STREAM = '/events/host'
const COMMAND_ENDPOINT = '/command'
const MS_PER_SECOND = 1000

const token = new URLSearchParams(location.search).get('token') ?? ''

function requireRoot(): HTMLElement {
  const node = document.getElementById('root')
  if (!node) throw new Error('[host] #root is missing from the page')
  return node
}

const root = requireRoot()

let latest: BroadcastPayload | null = null

let pausedRemainingMs: number | null = null
let lastError: string | null = null

/**
 * Up to this many teams, every team gets its own Correct and Wrong button and
 * adjudication is one tap. Beyond it that is two buttons per team on a phone —
 * sixteen groups means thirty-two — so the host picks the team first instead.
 */
const TEAM_PICKER_THRESHOLD = 6

let selectedTeamId: string | null = null
let selectionFor: string | null = null

/** Who the host has picked to go through, and which round that pick belongs to. */
let advanceSelection = new Set<string>()
let advanceSelectionFor = -1

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const node = el('button', className, label)
  node.disabled = disabled
  node.addEventListener('click', onClick)
  return node
}

async function send(type: string, payload?: unknown): Promise<void> {
  try {
    const response = await fetch(COMMAND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, token }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      lastError = body?.error ?? `command "${type}" failed (${response.status})`
    } else {
      lastError = null
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }
  if (latest) render(latest)
}

function remainingMs(payload: BroadcastPayload): number | null {
  if (payload.clockStartedAt === null || payload.questionSec === null) return null
  return Math.max(0, payload.questionSec * MS_PER_SECOND - (Date.now() - payload.clockStartedAt))
}

function phaseLabel(payload: BroadcastPayload): string {
  const left = remainingMs(payload)
  return left === null ? payload.phase : `${payload.phase} · ${Math.ceil(left / MS_PER_SECOND)}s`
}

function renderTopBar(payload: BroadcastPayload): HTMLElement {
  const bar = el('header', 'topbar')
  bar.append(el('h1', undefined, payload.round.title))
  const pill = el('span', 'phase', phaseLabel(payload))
  pill.id = 'phase-pill'
  bar.append(pill)
  return bar
}

interface FeudSlot {
  index: number
  revealed: boolean
}

function revealedSlots(payload: BroadcastPayload): Set<number> {
  const slots = (payload.board.meta?.['slots'] as FeudSlot[] | undefined) ?? []
  return new Set(slots.filter(slot => slot.revealed).map(slot => slot.index))
}

/**
 * The groups this round is for. A heat names its four; every other round is
 * whoever is left. Points can only be awarded to these, because the buttons for
 * anyone else are never drawn.
 */
function playingTeams(payload: BroadcastPayload): HostTeam[] {
  const allowed = new Set(payload.playingTeamIds)
  return payload.teams.filter(team => allowed.has(team.id))
}

function isFeud(payload: BroadcastPayload): boolean {
  return payload.round.hostComponent === 'list-host-board'
}

/** A Feud round has no grid to pick from — just the questions, in order. */
function renderQuestionList(payload: BroadcastPayload): HTMLElement {
  const list = el('div', 'question-list')
  const available = new Set(payload.availableQuestionIds)

  for (const cell of payload.board.cells) {
    const item = el('button', 'question-item')
    item.append(el('span', 'value', String(cell.meta?.['number'] ?? '')))
    item.append(el('span', 'prompt', cell.label))
    item.disabled = !available.has(cell.questionId) || payload.phase !== 'board'
    item.addEventListener('click', () => { void send('select', { questionId: cell.questionId }) })
    list.append(item)
  }
  return list
}

function renderBoardFor(payload: BroadcastPayload): HTMLElement {
  switch (payload.round.hostComponent) {
    case 'grid-host-board':
      return renderGridBoard(payload)
    case 'list-host-board':
      return renderQuestionList(payload)
    default:
      return el('div', 'banner', `No host renderer for "${payload.round.hostComponent}"`)
  }
}

function renderGridBoard(payload: BroadcastPayload): HTMLElement {
  const board = el('div', 'board')
  const meta = payload.board.meta ?? {}
  const categories = (meta['categories'] as Array<{ id: string; title: string }> | undefined) ?? []
  const columnCount = Math.max(categories.length, 1)
  const rowCount = Math.max(new Set(payload.board.cells.map(c => c.row ?? 0)).size, 1)
  const available = new Set(payload.availableQuestionIds)
  const pointLadder = (meta['pointLadder'] as number[] | undefined) ?? []

  board.style.gridTemplateColumns = `repeat(${columnCount}, 1fr)`

  for (let col = 0; col < columnCount; col++) {
    const column = el('div', 'board-column')
    column.append(el('div', 'head', categories[col]?.title ?? ''))
    for (let row = 0; row < rowCount; row++) {
      const cell = payload.board.cells.find(c => c.col === col && c.row === row)
      if (!cell) {
        column.append(el('div'))
        continue
      }
      const tile = el('button')
      tile.append(el('span', 'value', String(pointLadder[row] ?? '')))

      tile.append(el('span', 'prompt', cell.label))
      tile.disabled = !available.has(cell.questionId) || payload.phase !== 'board'
      tile.addEventListener('click', () => { void send('select', { questionId: cell.questionId }) })
      column.append(tile)
    }
    board.append(column)
  }
  return board
}

function renderQuestionCard(payload: BroadcastPayload): HTMLElement | null {
  const question = payload.currentQuestion
  if (!question || payload.phase === 'board' || payload.phase === 'lobby') return null

  const card = el('section', 'card')
  card.append(el('div', 'label', 'Question'))
  card.append(el('div', 'prompt', question.prompt ?? ''))
  card.append(el('div', 'label', 'Answer'))
  card.append(el('div', 'answer', question.answer ?? '—'))
  if (question.acceptedAnswers?.length) {
    card.append(el('div', 'note', `Also accept: ${question.acceptedAnswers.join(', ')}`))
  }
  if (question.hostNote) card.append(el('div', 'note', question.hostNote))
  return card
}

function eliminationTieCandidates(
  round: HostRoundConfig | undefined,
  teams: readonly HostTeam[],
): HostTeam[] | null {
  if (!round?.eliminateLowest) return null
  const roster = round.teamIds && round.teamIds.length > 0 ? new Set(round.teamIds) : null
  const remaining = teams.filter(t => !t.eliminated && (!roster || roster.has(t.id)))
  if (remaining.length <= 1) return null
  const lowestScore = Math.min(...remaining.map(t => t.score))
  return remaining.filter(t => t.score === lowestScore)
}


/**
 * Feud adjudication is two taps: which group said it, then which answer it was.
 * The group stays selected between answers, because one group on a roll usually
 * calls several in a row.
 */
function renderFeudControls(payload: BroadcastPayload, row: HTMLElement): HTMLElement {
  const playing = playingTeams(payload)
  const answers = payload.currentQuestion?.surveyAnswers ?? []
  const revealed = revealedSlots(payload)

  if (selectionFor !== payload.currentQuestionId) {
    selectedTeamId = null
    selectionFor = payload.currentQuestionId
  }

  const picker = el('div', 'team-picker')
  for (const team of playing) {
    const chip = button(team.name, 'chip', () => {
      selectedTeamId = selectedTeamId === team.id ? null : team.id
      if (latest) render(latest)
    })
    chip.style.setProperty('--team-color', team.color)
    chip.dataset['selected'] = String(selectedTeamId === team.id)
    chip.append(el('span', 'chip-score', String(team.score)))
    picker.append(chip)
  }
  row.append(picker)

  row.append(el('p', 'picker-hint', selectedTeamId === null
    ? 'Pick the group that answered, then tap what they said.'
    : 'Tap the answer they said. The group stays picked for their next one.'))

  const list = el('div', 'answer-list')
  answers.forEach((answer, index) => {
    const isOut = revealed.has(index)
    const node = button(`${index + 1}. ${answer.text}`, 'answer', () => {
      const teamId = selectedTeamId
      if (teamId === null) return
      void send('revealAnswer', { answerIndex: index, teamId })
    })
    node.append(el('span', 'answer-points', String(answer.count)))
    node.dataset['revealed'] = String(isOut)
    node.disabled = isOut || selectedTeamId === null
    list.append(node)
  })
  row.append(list)

  const extras = el('div', 'row verdict')
  extras.append(button('Strike', 'wrong', () => { void send('strike') }))
  row.append(extras)

  return row
}

/**
 * The end of a heat: the host says who goes through, the software does not.
 *
 * The leader is pre-picked so the ordinary case is one tap, but it is a pick and
 * not an announcement — a tie, a disputed answer or a group that has gone home
 * are all settled here, in the room, and the engine records the decision.
 */
function renderAdvancePicker(
  payload: BroadcastPayload,
  row: HTMLElement,
  advanceTop: number,
): HTMLElement {
  const playing = playingTeams(payload)

  if (playing.length <= advanceTop) {
    row.append(button(payload.copy.host.next, 'primary', () => { void send('advanceRound') }))
    return row
  }

  if (advanceSelectionFor !== payload.roundIndex) {
    // Pre-pick the leaders: every team level with the Nth score, so a tie opens
    // with both selected rather than one of them quietly missing.
    const ranked = [...playing].sort((a, b) => b.score - a.score)
    const cutoff = ranked[advanceTop - 1]?.score ?? 0
    advanceSelection = new Set(ranked.filter(team => team.score >= cutoff).map(team => team.id))
    advanceSelectionFor = payload.roundIndex
  }

  row.append(el('h2', undefined, 'Who goes through?'))

  const picker = el('div', 'team-picker')
  for (const team of playing) {
    const chip = button(team.name, 'chip', () => {
      if (advanceSelection.has(team.id)) advanceSelection.delete(team.id)
      else advanceSelection.add(team.id)
      if (latest) render(latest)
    })
    chip.style.setProperty('--team-color', team.color)
    chip.dataset['selected'] = String(advanceSelection.has(team.id))
    chip.append(el('span', 'chip-score', String(team.score)))
    picker.append(chip)
  }
  row.append(picker)

  const going = playing.filter(team => advanceSelection.has(team.id))
  const out = playing.length - going.length
  const outPhrase = out === 1 ? 'The other one is out of the show.' : `The other ${out} are out of the show.`
  row.append(el('p', 'picker-hint', going.length === 0
    ? 'Pick the group (or groups) that carry on.'
    : `${going.map(team => team.name).join(', ')} carry on. ${outPhrase}`))

  const confirm = el('div', 'row verdict')
  const label = going.length === 1
    ? `Send ${going[0]!.name} through →`
    : `Send ${going.length} groups through →`

  const go = button(label, 'primary', () => {
    void send('advanceRound', { advanceTeamIds: [...advanceSelection] })
  })
  go.disabled = going.length === 0
  confirm.append(go)
  row.append(confirm)

  return row
}

function renderControls(payload: BroadcastPayload): HTMLElement {
  const row = el('div', 'row')

  if (payload.phase === 'lobby') {
    row.append(button('Start round', 'primary', () => { void send('start') }))
    return row
  }

  if (payload.phase === 'roundIntro' || payload.phase === 'intermission') {
    row.append(button(payload.copy.host.skip, 'primary', () => { void send('continue') }))
    return row
  }

  if (payload.phase === 'reading') {
    row.append(button(payload.copy.host.arm, 'primary', () => { void send('arm') }))
  }

  if (isFeud(payload) && (payload.phase === 'reading' || payload.phase === 'armed')) {
    return renderFeudControls(payload, row)
  }

  if (payload.phase === 'armed') {
    const playing = playingTeams(payload)

    if (playing.length <= TEAM_PICKER_THRESHOLD) {
      for (const team of playing) {
        row.append(button(
          `${payload.copy.host.correct}: ${team.name}`, 'correct',
          () => { void send('markCorrect', { teamId: team.id }) },
        ))
      }
      for (const team of playing) {
        row.append(button(
          `${payload.copy.host.wrong}: ${team.name}`, 'wrong',
          () => { void send('markWrong', { teamId: team.id }) },
        ))
      }
      return row
    }

    // The selection belongs to one question; a new question starts clean so a
    // stale highlight can never send points to the previous group.
    if (selectionFor !== payload.currentQuestionId) {
      selectedTeamId = null
      selectionFor = payload.currentQuestionId
    }

    const picker = el('div', 'team-picker')
    for (const team of playing) {
      const chip = button(team.name, 'chip', () => {
        selectedTeamId = selectedTeamId === team.id ? null : team.id
        if (latest) render(latest)
      })
      chip.style.setProperty('--team-color', team.color)
      chip.dataset['selected'] = String(selectedTeamId === team.id)
      chip.append(el('span', 'chip-score', String(team.score)))
      picker.append(chip)
    }
    row.append(picker)

    const verdict = el('div', 'row verdict')
    const judge = (command: 'markCorrect' | 'markWrong', label: string, style: string) => {
      const node = button(label, style, () => {
        const teamId = selectedTeamId
        if (teamId === null) return
        selectedTeamId = null
        void send(command, { teamId })
      })
      node.disabled = selectedTeamId === null
      return node
    }
    verdict.append(judge('markCorrect', payload.copy.host.correct, 'correct'))
    verdict.append(judge('markWrong', payload.copy.host.wrong, 'wrong'))
    row.append(verdict)
  }

  if (payload.phase === 'reveal') {
    if (!payload.round.isComplete) {
      row.append(button(payload.copy.host.next, 'primary', () => { void send('next') }))
    } else {
      const isLastRound = payload.roundIndex >= payload.config.program.rounds.length - 1
      if (isLastRound) {
        row.append(button(payload.copy.host.endRound, 'primary', () => { void send('endRound') }))
      } else {
        const round = payload.config.program.rounds[payload.roundIndex]
        if (round?.advanceTop !== undefined) {
          return renderAdvancePicker(payload, row, round.advanceTop)
        }
        const candidates = eliminationTieCandidates(round, payload.teams)
        if (candidates && candidates.length > 1) {
          for (const team of candidates) {
            row.append(button(
              `Eliminate ${team.name} & continue`, 'wrong',
              () => { void send('advanceRound', { eliminateTeamId: team.id }) },
            ))
          }
        } else {
          row.append(button(payload.copy.host.next, 'primary', () => { void send('advanceRound') }))
        }
      }
    }
  }

  return row
}

function renderClockControls(payload: BroadcastPayload): HTMLElement {
  const row = el('div', 'row')
  if (!payload.config.rules.timer.hostCanPause) return row

  const running = payload.clockStartedAt !== null
  row.append(button('Pause clock', '', () => {
    pausedRemainingMs = remainingMs(payload)
    void send('pause')
  }, !running))
  row.append(button('Resume clock', '', () => {
    void send('resume', { ms: pausedRemainingMs ?? (payload.questionSec ?? 0) * MS_PER_SECOND })
  }, running || payload.questionSec === null))
  return row
}

function renderScores(payload: BroadcastPayload): HTMLElement {
  const list = el('div', 'scores')
  const playing = new Set(payload.playingTeamIds)
  for (const team of payload.teams) {
    const row = el('div', 'score-row')
    row.style.setProperty('--team', team.color)
    row.dataset['sittingOut'] = String(!playing.has(team.id))
    row.append(el('span', 'name', team.name))
    if (team.eliminated) row.append(el('span', 'tag', 'out'))
    else if (!playing.has(team.id)) row.append(el('span', 'tag', 'not this round'))
    row.append(el('span', 'value', String(team.score)))
    list.append(row)
  }
  return list
}

function renderUndoDock(): HTMLElement {
  const dock = el('div', 'undo-dock')

  dock.append(button('Undo last action', 'primary', () => { void send('undo') }))
  return dock
}

function render(payload: BroadcastPayload): void {
  const next = document.createDocumentFragment()
  next.append(renderTopBar(payload))

  if (!token) {
    const warning = el('div', 'banner', 'No host token in the URL. Commands will be refused. Open the Host link printed by the server.')
    next.append(warning)
  }
  if (lastError) next.append(el('div', 'banner', lastError))

  const controls = renderControls(payload)
  if (controls.childElementCount > 0) {
    next.append(el('h2', undefined, 'Now'))
    next.append(controls)
  }

  const card = renderQuestionCard(payload)
  if (card) next.append(card)

  const clock = renderClockControls(payload)
  if (clock.childElementCount > 0) {
    next.append(el('h2', undefined, 'Clock'))
    next.append(clock)
  }

  if (payload.phase === 'final') {
    next.append(el('div', 'banner', 'Show complete — final scores below.'))
  } else {
    next.append(el('h2', undefined, 'Board'))
    next.append(renderBoardFor(payload))
  }

  next.append(el('h2', undefined, 'Scores'))
  next.append(renderScores(payload))
  next.append(renderUndoDock())

  root.replaceChildren(next)
}

const source = new EventSource(`${HOST_STREAM}?token=${encodeURIComponent(token)}`)

source.addEventListener('message', event => {
  try {
    latest = JSON.parse(event.data) as BroadcastPayload
    if (latest.clockStartedAt !== null) pausedRemainingMs = null
    render(latest)
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }
})

source.addEventListener('error', () => {
  lastError = 'Lost connection to the server — retrying.'
  if (latest) render(latest)
})

setInterval(() => {
  const pill = document.getElementById('phase-pill')
  if (latest && pill) pill.textContent = phaseLabel(latest)
}, MS_PER_SECOND)
