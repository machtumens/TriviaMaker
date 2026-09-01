import { themeToCssVars } from '../config/resolve'
import type { BroadcastPayload } from '../engine/broadcast'

const STAGE_STREAM = '/events/stage'
const QUESTION_PHASES = new Set(['reading', 'armed', 'adjudicate'])
const WARN_FRACTION = 0.25
const MS_PER_SECOND = 1000

function requireRoot(): HTMLElement {
  const node = document.getElementById('root')
  if (!node) throw new Error('[stage] #root is missing from the page')
  return node
}

const root = requireRoot()

let latest: BroadcastPayload | null = null
let timerFrame = 0

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

function applyTheme(payload: BroadcastPayload): void {
  for (const [name, value] of Object.entries(themeToCssVars(payload.theme))) {
    document.documentElement.style.setProperty(name, value)
  }
  document.documentElement.style.setProperty(
    '--type-uppercase-categories',
    payload.theme.type.uppercaseCategories ? 'uppercase' : 'none',
  )
}

function renderRoundBar(payload: BroadcastPayload): HTMLElement {
  const bar = el('header', 'round-bar')
  bar.append(el('span', 'title', payload.round.title))
  if (payload.round.subtitle) bar.append(el('span', 'subtitle', payload.round.subtitle))
  return bar
}

function renderGridBoard(payload: BroadcastPayload): HTMLElement {
  const board = el('main', 'board')
  const meta = payload.board.meta ?? {}
  const categories = (meta['categories'] as Array<{ id: string; title: string }> | undefined) ?? []
  const showHeaders = meta['showCategoryHeaders'] !== false
  const columnCount = Math.max(categories.length, 1)

  board.style.gridTemplateColumns = `repeat(${columnCount}, 1fr)`

  const rows = new Set(payload.board.cells.map(cell => cell.row ?? 0))
  const rowCount = Math.max(rows.size, 1)

  for (let col = 0; col < columnCount; col++) {
    const column = el('div', 'board-column')
    column.style.gridTemplateRows = showHeaders ? `auto repeat(${rowCount}, 1fr)` : `repeat(${rowCount}, 1fr)`

    if (showHeaders) {
      column.append(el('div', 'category', categories[col]?.title ?? ''))
    }
    for (let row = 0; row < rowCount; row++) {
      const cell = payload.board.cells.find(c => c.col === col && c.row === row)

      const tile = el('div', 'tile', cell?.label ?? '')
      tile.dataset['consumed'] = String(cell?.consumed ?? false)
      tile.dataset['empty'] = String(cell === undefined)
      column.append(tile)
    }
    board.append(column)
  }
  return board
}

function renderBoardFor(payload: BroadcastPayload): HTMLElement {
  switch (payload.round.stageComponent) {
    case 'grid-board':
      return renderGridBoard(payload)
    default:
      return el('div', 'placeholder', `No stage renderer for "${payload.round.stageComponent}"`)
  }
}

function renderScoreboard(payload: BroadcastPayload): HTMLElement {
  const scoreboard = el('footer', 'scoreboard')
  for (const team of payload.teams) {
    const card = el('div', 'team')
    card.style.setProperty('--team-color', team.color)
    card.dataset['eliminated'] = String(team.eliminated)
    card.append(el('span', 'name', team.name))
    card.append(el('span', 'score', String(team.score)))
    scoreboard.append(card)
  }
  return scoreboard
}

function renderQuestionOverlay(payload: BroadcastPayload): HTMLElement | null {
  if (!QUESTION_PHASES.has(payload.phase)) return null
  const question = payload.currentQuestion
  if (!question) return null

  const overlay = el('section', 'question-overlay')
  const selectedCell = payload.board.cells.find(cell => cell.questionId === payload.currentQuestionId)
  const value = selectedCell?.label ?? ''
  overlay.append(el('div', 'question-value', value ? `${payload.copy.question.forPoints.replace('{points}', value)}` : ''))
  overlay.append(el('div', 'question-prompt', question.prompt ?? ''))

  const timer = el('div', 'timer')
  timer.id = 'timer'
  timer.hidden = payload.clockStartedAt === null || payload.questionSec === null
  const fill = el('div', 'timer-fill')
  fill.id = 'timer-fill'
  timer.append(fill)
  overlay.append(timer)

  return overlay
}

function tickTimer(): void {
  timerFrame = requestAnimationFrame(tickTimer)
  const payload = latest
  const fill = document.getElementById('timer-fill')
  const timer = document.getElementById('timer')
  if (!payload || !fill || !timer) return

  if (payload.clockStartedAt === null || payload.questionSec === null) {
    timer.hidden = true
    return
  }
  const totalMs = payload.questionSec * MS_PER_SECOND
  const remainingMs = Math.max(0, totalMs - (Date.now() - payload.clockStartedAt))
  const fraction = totalMs === 0 ? 0 : remainingMs / totalMs
  timer.hidden = false
  fill.style.width = `${(fraction * 100).toFixed(2)}%`
  fill.dataset['warn'] = String(fraction <= WARN_FRACTION)
}

function render(payload: BroadcastPayload): void {
  applyTheme(payload)

  const next = document.createDocumentFragment()
  next.append(renderRoundBar(payload))

  if (payload.phase === 'final') {
    next.append(el('h1', 'title', 'Show Complete'))
  } else {
    next.append(renderBoardFor(payload))
  }
  next.append(renderScoreboard(payload))

  const overlay = renderQuestionOverlay(payload)
  root.replaceChildren(next)

  document.querySelector('.question-overlay')?.remove()
  if (overlay) document.body.append(overlay)
}

function connect(): void {
  const source = new EventSource(STAGE_STREAM)

  source.addEventListener('message', event => {
    try {
      latest = JSON.parse(event.data) as BroadcastPayload
      render(latest)
    } catch (error) {
      console.error('[stage] could not render a state frame', error)
    }
  })

}

connect()
timerFrame = requestAnimationFrame(tickTimer)

window.addEventListener('beforeunload', () => cancelAnimationFrame(timerFrame))
