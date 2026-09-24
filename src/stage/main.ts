import './stage.css'
import { themeToCssVars } from '../config/resolve'
import type { BroadcastPayload } from '../engine/broadcast'

const STAGE_STREAM = '/events/stage'
const QUESTION_PHASES = new Set(['reading', 'armed'])
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

/**
 * Something only animates while it is new. The stage rebuilds its whole DOM on
 * every broadcast, so a CSS animation would otherwise replay on every unrelated
 * update — and a broadcast arriving mid-animation would snap it to the end.
 * Marking by "happened within the last N ms" survives both.
 */
const enteredAt = { question: 0, strikes: 0, view: 0 }
let lastQuestionId: string | null = null
let lastStrikes = 0
let lastView = ''

/** questionId:index of every slot already seen open, so only new ones flip. */
const seenRevealed = new Set<string>()
let seenAnything = false

/** What each score currently READS as, which trails the real score while it counts. */
const displayedScores = new Map<string, number>()
let scoreFrame = 0

function motionMs(payload: BroadcastPayload, key: keyof BroadcastPayload['motion']['durationsMs']): number {
  if (!motionAllowed(payload)) return 0
  const speed = payload.motion.speed > 0 ? payload.motion.speed : 1
  return payload.motion.durationsMs[key] / speed
}

function motionAllowed(payload: BroadcastPayload): boolean {
  if (!payload.motion.enabled) return false
  if (!payload.motion.respectReducedMotion) return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function applyMotion(payload: BroadcastPayload): void {
  const root = document.documentElement
  root.dataset['motion'] = motionAllowed(payload) ? 'on' : 'off'
  root.style.setProperty('--motion-question-enter', `${motionMs(payload, 'questionEnter')}ms`)
  root.style.setProperty('--motion-answer-reveal', `${motionMs(payload, 'answerReveal')}ms`)
  root.style.setProperty('--motion-buzz-flash', `${motionMs(payload, 'buzzFlash')}ms`)
  root.style.setProperty('--motion-phase', `${motionMs(payload, 'phaseTransition')}ms`)
  root.style.setProperty('--motion-ease-enter', payload.motion.easing.enter)
  root.style.setProperty('--motion-ease-bounce', payload.motion.easing.bounce)
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
      tile.dataset['questionId'] = cell?.questionId ?? ''
      tile.dataset['consumed'] = String(cell?.consumed ?? false)
      tile.dataset['empty'] = String(cell === undefined)
      column.append(tile)
    }
    board.append(column)
  }
  return board
}

interface FeudSlot {
  index: number
  revealed: boolean
  text?: string
  points?: number
}

function feudMeta(payload: BroadcastPayload) {
  const meta = payload.board.meta ?? {}
  return {
    slots: (meta['slots'] as FeudSlot[] | undefined) ?? [],
    strikes: typeof meta['strikes'] === 'number' ? meta['strikes'] : 0,
    strikesAllowed: typeof meta['strikesAllowed'] === 'number' ? meta['strikesAllowed'] : 3,
    showCounts: meta['showCounts'] !== false,
    questionCount: typeof meta['questionCount'] === 'number' ? meta['questionCount'] : 0,
    answeredCount: typeof meta['answeredCount'] === 'number' ? meta['answeredCount'] : 0,
  }
}

/**
 * Two lines at a size people can read beat one line they cannot, so an answer
 * that will not fit shrinks only this far and then wraps.
 */
const MIN_ANSWER_SCALE = 0.8

/** Team names have nowhere to wrap to, so they may shrink further than an answer. */
const MIN_TEAM_SCALE = 0.55

/** Distinct colours in the slot ramp; past this the last one repeats. */
const SLOT_RAMP_STEPS = 8

/** The answer board: numbered slots that fill in as groups call them out. */
function renderFeudSlots(payload: BroadcastPayload): HTMLElement {
  const { slots, showCounts } = feudMeta(payload)
  const board = el('div', 'feud-slots')
  board.style.setProperty('--slot-rows', String(Math.ceil(Math.max(slots.length, 1) / 2)))

  for (const slot of slots) {
    const cell = el('div', 'slot')
    cell.dataset['revealed'] = String(slot.revealed)

    // Slot 1 is worth the most and reads warmest; the ramp cools as the answers
    // get cheaper, so the colours rank the board rather than just decorate it.
    cell.dataset['rank'] = String(Math.min(slot.index, SLOT_RAMP_STEPS - 1))

    if (slot.revealed) {
      const key = `${payload.currentQuestionId ?? ''}:${slot.index}`
      // The first payload after a projector reload is the whole show so far, not
      // a reveal — those slots are recorded, not flipped.
      if (!seenRevealed.has(key)) {
        seenRevealed.add(key)
        if (seenAnything) cell.dataset['new'] = 'true'
      }
      cell.append(el('span', 'slot-text', slot.text ?? ''))
      if (showCounts) cell.append(el('span', 'slot-points', String(slot.points ?? '')))
    } else {
      cell.append(el('span', 'slot-number', String(slot.index + 1)))
    }
    board.append(cell)
  }
  return board
}

function renderStrikes(payload: BroadcastPayload): HTMLElement | null {
  const { strikes, strikesAllowed } = feudMeta(payload)
  if (strikes <= 0) return null

  const row = el('div', 'strikes')
  const fresh = Date.now() - enteredAt.strikes < motionMs(payload, 'buzzFlash') * 3
  for (let index = 0; index < Math.max(strikes, strikesAllowed); index++) {
    const mark = el('span', 'strike', '✕')
    mark.dataset['lit'] = String(index < strikes)
    if (fresh && index === strikes - 1) mark.dataset['new'] = 'true'
    row.append(mark)
  }
  return row
}

/** Between questions a Feud round shows how far through the set the show is. */
function renderListBoard(payload: BroadcastPayload): HTMLElement {
  const board = el('main', 'board feud-board')
  const { questionCount, answeredCount } = feudMeta(payload)

  board.append(el('div', 'feud-progress', `Question ${Math.min(answeredCount + 1, questionCount)} of ${questionCount}`))

  const pips = el('div', 'feud-pips')
  for (const cell of payload.board.cells) {
    const pip = el('span', 'pip', String(cell.meta?.['number'] ?? ''))
    pip.dataset['consumed'] = String(cell.consumed)
    pips.append(pip)
  }
  board.append(pips)
  return board
}

function renderBoardFor(payload: BroadcastPayload): HTMLElement {
  switch (payload.round.stageComponent) {
    case 'grid-board':
      return renderGridBoard(payload)
    case 'list-board':
      return renderListBoard(payload)
    default:
      return el('div', 'placeholder', `No stage renderer for "${payload.round.stageComponent}"`)
  }
}

/**
 * Past this many teams in a row, a name stops being readable from the back of a
 * hall, so the scoreboard wraps onto further rows instead of getting narrower.
 * The stage is a three-row grid, so the board above simply gives up the height.
 */
const MAX_SCOREBOARD_COLUMNS = 8

/** Two rows of names need less size each than one row of four. */
const CROWDED_SCOREBOARD_SCALE = 0.8

/**
 * The projector shows the groups this round is for. In a heat that is four bars
 * the size of the screen instead of sixteen nobody can read; in an ordinary
 * round it is everybody still in.
 */
function shownTeams(payload: BroadcastPayload): BroadcastPayload['teams'] {
  const allowed = new Set(payload.playingTeamIds)
  const playing = payload.teams.filter(team => allowed.has(team.id))
  return playing.length > 0 ? playing : payload.teams
}

function renderScoreboard(payload: BroadcastPayload): HTMLElement {
  const scoreboard = el('footer', 'scoreboard')
  if (Date.now() - enteredAt.view < motionMs(payload, 'phaseTransition')) {
    scoreboard.dataset['entering'] = 'true'
  }

  const teams = shownTeams(payload)
  const columns = Math.min(Math.max(teams.length, 1), MAX_SCOREBOARD_COLUMNS)
  scoreboard.style.setProperty('--scoreboard-columns', String(columns))
  if (teams.length > MAX_SCOREBOARD_COLUMNS) {
    scoreboard.style.setProperty('--scoreboard-scale', String(CROWDED_SCOREBOARD_SCALE))
    scoreboard.dataset['crowded'] = 'true'
  }

  // Each team is a bar as well as a label: the fill is its score against the
  // leader's, so who is ahead reads from the back of the hall without anyone
  // having to compare sixteen numbers. Order stays as authored — groups need to
  // find themselves on the screen more than they need a ranking.
  // Drawn from the displayed score, not the real one: a score that is still
  // counting up must not flash its final value first.
  for (const team of teams) {
    const card = el('div', 'team')
    card.dataset['teamId'] = team.id
    card.style.setProperty('--team-color', team.color)
    card.dataset['eliminated'] = String(team.eliminated)
    card.append(el('span', 'name', team.name))
    card.append(el('span', 'score', ''))
    scoreboard.append(card)
  }
  return scoreboard
}

function renderQuestionOverlay(payload: BroadcastPayload): HTMLElement | null {
  if (!QUESTION_PHASES.has(payload.phase)) return null
  const question = payload.currentQuestion
  if (!question) return null

  const overlay = el('section', 'question-overlay')
  const isFeud = payload.round.stageComponent === 'list-board'
  if (isFeud) overlay.classList.add('feud')

  if (Date.now() - enteredAt.question < motionMs(payload, 'questionEnter')) {
    overlay.dataset['enter'] = 'true'
  }

  if (!isFeud) {
    const selectedCell = payload.board.cells.find(cell => cell.questionId === payload.currentQuestionId)
    const value = selectedCell?.label ?? ''
    overlay.append(el('div', 'question-value', value ? `${payload.copy.question.forPoints.replace('{points}', value)}` : ''))
  }
  overlay.append(el('div', 'question-prompt', question.prompt ?? ''))

  // On a Feud round the answer board is the game, so it lives in the overlay
  // rather than behind it.
  if (isFeud) {
    overlay.append(renderFeudSlots(payload))
    const strikes = renderStrikes(payload)
    if (strikes) overlay.append(strikes)
  }

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
  // The projector is either asking a question or showing where everyone stands.
  // Naming that here lets the layout hand the screen from one to the other.
  const asking = QUESTION_PHASES.has(payload.phase) && payload.currentQuestion !== null
  const view = asking ? 'question' : 'standings'
  if (view !== lastView) {
    lastView = view
    if (seenAnything) enteredAt.view = Date.now()
  }
  document.documentElement.dataset['view'] = view

  // Which board is behind the view matters: a Feud round between questions has
  // only a progress line back there, so the scores can have the screen. A grid
  // round's board IS the content and keeps its space.
  document.documentElement.dataset['board'] = payload.round.stageComponent

  // A projector reopened mid-show restores silently: what is already on the
  // board is history, and replaying a strike that landed a minute ago is a lie.
  if (payload.currentQuestionId !== lastQuestionId) {
    lastQuestionId = payload.currentQuestionId
    if (payload.currentQuestionId !== null && seenAnything) enteredAt.question = Date.now()
  }

  const strikes = typeof payload.board.meta?.['strikes'] === 'number'
    ? (payload.board.meta['strikes'] as number)
    : 0
  if (strikes > lastStrikes && seenAnything) enteredAt.strikes = Date.now()
  lastStrikes = strikes

  applyMotion(payload)
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

  fitEverything()

  // And again once things have settled. The projector's first paint renders
  // twice in quick succession — the retained frame, then the reply to its hello
  // — so a fit measured during that can be thrown away by the render behind it,
  // which is how "Class Green" kept its ellipsis on a freshly opened window.
  requestAnimationFrame(fitEverything)
  if (!settleScheduled) {
    settleScheduled = true
    setTimeout(fitEverything, SETTLE_MS)
  }

  paintScores()
  countScoresTo(payload)

  seenAnything = true
}

/**
 * Writes the displayed scores into the board. The bar is repainted with the
 * number so the points land as one movement rather than a digit changing next
 * to a bar that has already jumped.
 */
function paintScores(): void {
  const best = Math.max(0, ...displayedScores.values())

  for (const card of document.querySelectorAll<HTMLElement>('.team[data-team-id]')) {
    const id = card.dataset['teamId']
    const value = id === undefined ? undefined : displayedScores.get(id)
    if (value === undefined) continue

    const score = card.querySelector('.score')
    if (score) score.textContent = String(value)
    card.style.setProperty('--fill', `${best > 0 ? ((Math.max(0, value) / best) * 100).toFixed(1) : '0'}%`)
    if (best > 0 && value === best) card.dataset['leader'] = 'true'
    else delete card.dataset['leader']
  }
}

/**
 * Runs the displayed scores up (or down) to the real ones over the show's
 * scoreCount duration. The lead can change mid-count, which is the point.
 */
function countScoresTo(payload: BroadcastPayload): void {
  const targets = new Map(shownTeams(payload).map(team => [team.id, team.score]))
  const duration = motionMs(payload, 'scoreCount')

  for (const id of [...displayedScores.keys()]) {
    if (!targets.has(id)) displayedScores.delete(id)
  }

  const snap = (): void => {
    for (const [id, target] of targets) displayedScores.set(id, target)
    paintScores()
  }

  // Nothing counts on the first paint — a projector opening mid-show would
  // otherwise run every score up from zero.
  if (!seenAnything || duration <= 0) {
    cancelAnimationFrame(scoreFrame)
    snap()
    return
  }

  const from = new Map<string, number>()
  let moving = false
  for (const [id, target] of targets) {
    const current = displayedScores.get(id) ?? target
    from.set(id, current)
    if (current !== target) moving = true
  }
  if (!moving) return

  cancelAnimationFrame(scoreFrame)
  const startedAt = performance.now()

  const step = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / duration)
    const eased = 1 - (1 - progress) ** 3

    for (const [id, target] of targets) {
      const start = from.get(id) ?? target
      displayedScores.set(id, Math.round(start + (target - start) * eased))
    }
    paintScores()

    if (progress < 1) scoreFrame = requestAnimationFrame(step)
    else snap()
  }
  scoreFrame = requestAnimationFrame(step)
}

/**
 * Shrinks text too wide for the box it sits in, measured rather than guessed: a
 * character count cannot know the font or the width, and "CANDI BOROBUDUR"
 * reached the projector as "CANDI BOROBU…" under one. Past `floor` the element
 * stops shrinking; a slot then wraps to a second line instead.
 */
/** How long to let the first paint settle before measuring text one last time. */
const SETTLE_MS = 400
let settleScheduled = false

/** Both fit passes, run together. */
function fitEverything(): void {
  fitText('.slot-text', '.slot', '--slot-scale', MIN_ANSWER_SCALE, 'long')
  fitText('.team .name', '.team', '--team-scale', MIN_TEAM_SCALE)
}

function fitText(
  selector: string,
  boxSelector: string,
  property: string,
  floor: number,
  wrapFlag?: string,
): void {
  for (const text of document.querySelectorAll<HTMLElement>(selector)) {
    const box = text.closest<HTMLElement>(boxSelector)
    if (!box) continue

    const needed = text.scrollWidth
    const available = text.clientWidth
    if (needed <= available || available === 0) continue

    box.style.setProperty(property, String(Math.max(floor, available / needed)))
    if (wrapFlag) box.dataset[wrapFlag] = 'true'
  }
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
