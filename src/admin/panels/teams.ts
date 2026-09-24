import { makeTeams, TEAM_COLORS } from '../draft'
import { block, button, colorInput, el, numberInput, textInput } from '../ui'
import { refresh, rerender, state } from '../store'

export function teamsPanel(): HTMLElement[] {
  const draft = state.draft
  const teams = block(
    'Teams',
    'Whoever is playing: classes, tables, houses, families. The colour is how they read on the projector.',
  )

  const quick = el('div', 'row')
  for (const count of [2, 4, 6, 8, 12, 16]) {
    quick.append(button(`${count} teams`, 'ghost add', () => {
      draft.teams = makeTeams(count, draft.teams)
      rerender()
    }))
  }
  teams.append(quick)

  const grid = el('div', 'team-grid')
  draft.teams.forEach((team, index) => {
    const card = el('div', 'team-card')
    card.append(colorInput(team.color, value => {
      team.color = value
      refresh()
    }))
    card.append(textInput(team.name, value => {
      team.name = value
      refresh()
    }, `Group ${index + 1}`))
    card.append(button('✕', 'ghost', () => {
      draft.teams.splice(index, 1)
      rerender()
    }))
    grid.append(card)
  })
  teams.append(grid)

  teams.append(button('Add a team', 'ghost add', () => {
    draft.teams.push({
      name: `Group ${draft.teams.length + 1}`,
      color: TEAM_COLORS[draft.teams.length % TEAM_COLORS.length]!,
      startingScore: 0,
    })
    rerender()
  }))

  const handicap = block(
    'Starting scores',
    'Everyone starts on zero unless you say otherwise — useful for a handicap, or for carrying yesterday’s total in.',
  )
  const rows = el('div', 'team-grid')
  draft.teams.forEach((team, index) => {
    const card = el('div', 'team-card')
    const swatch = el('div', 'dot')
    swatch.style.background = team.color
    card.append(swatch)
    card.append(el('span', 'team-name', team.name || `Group ${index + 1}`))
    card.append(numberInput(team.startingScore, value => {
      team.startingScore = Math.round(value)
      refresh()
    }, { step: 10 }))
    rows.append(card)
  })
  handicap.append(rows)

  return [teams, handicap]
}
