/**
 * HOST CONTROLLER — the only client that sees answers.
 *
 * Receives the unredacted state over SSE and POSTs commands back, each carrying
 * the session token from the URL. Without a valid token the server refuses the
 * command, which is what stops anyone else on the venue wifi from awarding
 * themselves points.
 *
 * Two live-event rules shape the UI:
 *   - UNDO is always visible and always one tap away. Mid-show, the host does
 *     not have time to find it.
 *   - The board arrives pre-built from the server. This file never calls
 *     `buildBoard`, exactly like the stage view.
 */

import type { BroadcastPayload } from '../engine/broadcast'

// Derived from the payload rather than imported from the engine: this file only
// ever sees what actually came over the wire.
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
/** Remaining time captured at the moment of pausing — the clock anchor is cleared server-side. */
let pausedRemainingMs: number | null = null
let lastError: string | null = null

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

/** Renderer for `hostComponent: 'grid-host-board'`. */
function renderBoard(payload: BroadcastPayload): HTMLElement {
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
      // The host board carries real prompts — that is the host preview.
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

/**
 * Who is tied for lowest, if `eliminateLowest` is about to fire.
 *
 * Computed client-side from data the payload already carries so the host is
 * offered the choice up front, instead of clicking blind and being rejected by
 * the server (T2.2-L3). `null` means elimination does not apply at all.
 */
function eliminationTieCandidates(
  round: HostRoundConfig | undefined,
  teams: readonly HostTeam[],
): HostTeam[] | null {
  if (!round?.eliminateLowest) return null
  const remaining = teams.filter(t => !t.eliminated)
  if (remaining.length <= 1) return null
  const lowestScore = Math.min(...remaining.map(t => t.score))
  return remaining.filter(t => t.score === lowestScore)
}

function renderControls(payload: BroadcastPayload): HTMLElement {
  const row = el('div', 'row')

  if (payload.phase === 'lobby') {
    row.append(button('Start round', 'primary', () => { void send('start') }))
    return row
  }

  // Title-card phases. `copy.host.skip` is reused here — there is no dedicated
  // "Continue" string in `CopyStrings` (T2.2-L8, disclosed compromise).
  if (payload.phase === 'roundIntro' || payload.phase === 'intermission') {
    row.append(button(payload.copy.host.skip, 'primary', () => { void send('continue') }))
    return row
  }

  if (payload.phase === 'reading') {
    row.append(button(payload.copy.host.arm, 'primary', () => { void send('arm') }))
  }

  if (payload.phase === 'armed' || payload.phase === 'adjudicate') {
    for (const team of payload.teams) {
      if (team.eliminated) continue
      row.append(button(
        `${payload.copy.host.correct}: ${team.name}`, 'correct',
        () => { void send('markCorrect', { teamId: team.id }) },
      ))
    }
    for (const team of payload.teams) {
      if (team.eliminated) continue
      row.append(button(
        `${payload.copy.host.wrong}: ${team.name}`, 'wrong',
        () => { void send('markWrong', { teamId: team.id }) },
      ))
    }
  }

  if (payload.phase === 'reveal') {
    // The host already knows whether the round is finished (the server sent
    // `isComplete` with the board), so the decision is made here rather than
    // making the server rebuild a board just to answer the same question.
    if (!payload.round.isComplete) {
      row.append(button(payload.copy.host.next, 'primary', () => { void send('next') }))
    } else {
      // Advancing and ending are DIFFERENT actions. "End Show" never advances
      // `roundIndex` (T2.2-L6), so it is the only offer on the last round.
      const isLastRound = payload.roundIndex >= payload.config.program.rounds.length - 1
      if (isLastRound) {
        row.append(button(payload.copy.host.endRound, 'primary', () => { void send('endRound') }))
      } else {
        const round = payload.config.program.rounds[payload.roundIndex]
        const candidates = eliminationTieCandidates(round, payload.teams)
        if (candidates && candidates.length > 1) {
          // One button per tied team. The server validates the id against the
          // same tie set, so a stale payload is rejected rather than obeyed.
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
    // Capture what is left BEFORE the server clears the anchor.
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
  for (const team of payload.teams) {
    const row = el('div', 'score-row')
    row.style.setProperty('--team', team.color)
    row.append(el('span', 'name', team.name))
    row.append(el('span', 'value', String(team.score)))
    list.append(row)
  }
  return list
}

function renderUndoDock(): HTMLElement {
  const dock = el('div', 'undo-dock')
  // Always present, in every phase, one tap. Non-negotiable mid-show.
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

  // In `final` the board belongs to a round that is over; showing it frozen
  // reads as a stuck screen (T2.2-L11). Scores below are already unconditional.
  if (payload.phase === 'final') {
    next.append(el('div', 'banner', 'Show complete — final scores below.'))
  } else {
    next.append(el('h2', undefined, 'Board'))
    if (payload.round.hostComponent === 'grid-host-board') {
      next.append(renderBoard(payload))
    } else {
      next.append(el('div', 'banner', `No host renderer for "${payload.round.hostComponent}"`))
    }
  }

  next.append(el('h2', undefined, 'Scores'))
  next.append(renderScores(payload))
  next.append(renderUndoDock())

  root.replaceChildren(next)
}

const source = new EventSource(HOST_STREAM)

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

// Tick ONLY the clock text between state pushes. Re-rendering the whole tree
// once a second would reset the host's scroll position mid-tap.
setInterval(() => {
  const pill = document.getElementById('phase-pill')
  if (latest && pill) pill.textContent = phaseLabel(latest)
}, MS_PER_SECOND)
