import { el } from './ui'
import { currentRound, state } from './store'

const PREVIEW_SLOTS = 5
const PREVIEW_COLUMNS = 6
const PREVIEW_ROWS = 4

/**
 * A miniature of the projector for the round being edited. It is a drawing, not
 * the real stage: it reads the same values but renders its own markup, so it can
 * show a revealed answer next to hidden ones without running a session.
 */
export function renderPreview(into: HTMLElement): void {
  const draft = state.draft
  const look = draft.look
  const round = currentRound()

  const screen = el('div', 'screen')
  screen.style.background = look.bg
  screen.style.color = look.text
  screen.style.setProperty('--pv-display', look.display)
  screen.style.padding = `${Math.max(8, Math.round(look.screenPadding / 4))}px`
  screen.style.gap = `${Math.max(4, Math.round(look.boardGap / 2))}px`

  const corners = el('div', 'corners')
  corners.style.color = look.textMuted
  corners.append(el('span', undefined, round.title.trim() || draft.title || 'Untitled'))
  corners.append(el('span', undefined, round.subtitle.trim() || draft.subtitle))
  screen.append(corners)

  if (round.format === 'feud') {
    const first = round.feud.questions[0]
    screen.append(el('div', 'pv-question', first?.prompt || 'Your first question appears here.'))

    const slots = el('div', 'slots')
    slots.style.gap = `${Math.max(2, Math.round(look.boardGap / 3))}px`
    const answers = (first?.answers ?? []).filter(answer => answer.text.trim() !== '')
    const total = Math.max(1, Math.min(PREVIEW_SLOTS, answers.length || 3))

    for (let index = 0; index < total; index++) {
      const slot = el('div', 'slot')
      slot.style.background = look.bgElevated
      slot.style.borderRadius = `${Math.min(14, look.radiusTile)}px`
      slot.style.color = index === 0 ? look.text : look.tileText
      const answer = answers[index]
      // The first slot shows what a revealed answer looks like; the rest are hidden.
      slot.append(el('span', undefined, index === 0 && answer ? answer.text : String(index + 1)))
      if (index === 0 && answer && round.feud.showCounts) {
        const count = el('span', undefined, String(answer.count))
        count.style.color = look.accent
        slot.append(count)
      }
      slots.append(slot)
    }
    screen.append(slots)
  } else {
    const columns = Math.min(PREVIEW_COLUMNS, Math.max(1, round.quiz.categories.length))
    const grid = el('div', 'pv-grid')
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`
    grid.style.gap = `${Math.max(2, Math.round(look.boardGap / 2))}px`

    for (let column = 0; column < columns; column++) {
      const head = el('div', 'pv-head', round.quiz.categories[column]?.title ?? '')
      head.style.color = look.textMuted
      if (look.uppercaseCategories) head.style.textTransform = 'uppercase'
      grid.append(head)
    }

    const rows = round.quiz.pointLadder.slice(0, PREVIEW_ROWS)
    rows.forEach((points, rowIndex) => {
      for (let column = 0; column < columns; column++) {
        // One played tile, so the "played" colour is visible while choosing it.
        const played = rowIndex === 0 && column === 0
        const tile = el('div', 'pv-tile', String(points))
        tile.style.background = played ? look.tileConsumed : look.tile
        tile.style.color = played ? look.textMuted : look.tileText
        tile.style.borderRadius = `${Math.min(14, look.radiusTile)}px`
        grid.append(tile)
      }
    })
    screen.append(grid)
  }

  const teams = el('div', 'teams')
  for (const team of draft.teams.slice(0, 16)) {
    const bar = el('i')
    bar.style.background = team.color
    teams.append(bar)
  }
  screen.append(teams)

  const caption = el('div', 'caption', state.draft.rounds.length > 1
    ? `Projector preview — ${round.name} (${state.round + 1} of ${state.draft.rounds.length})`
    : 'Projector preview')

  into.replaceChildren(screen, caption)
}
