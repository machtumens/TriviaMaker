import { resolveConfig } from '../config/resolve'
import { fitReport, formatProblems, stampLadderPoints } from '../config/packet'
import { validateConfigPlugins } from '../registry/index'
import type { GameShowConfig } from '../config/types'
import { draftToConfig, roundCategories } from './draft'
import { el } from './ui'
import { state } from './store'

/** How many questions a round will actually put on the board. */
export function questionCount(roundIndex?: number): number {
  const rounds = roundIndex === undefined
    ? state.draft.rounds
    : [state.draft.rounds[roundIndex]].filter(round => round !== undefined)

  return rounds.reduce((total, round) => {
    return total + roundCategories(round).reduce(
      (sum, category) => sum + category.questions.length,
      0,
    )
  }, 0)
}

function line(level: 'ok' | 'warn' | 'error', title: string, detail: string): HTMLElement {
  const node = el('div', `check-line ${level}`)
  node.append(el('b', undefined, title))
  node.append(el('span', undefined, detail))
  return node
}

/**
 * Everything that would otherwise go wrong once the projector is already on.
 * It runs the engine's own validators against the config the browser will
 * actually play — the transport swapped for the one the local show resolves.
 */
export function renderChecks(into: HTMLElement): boolean {
  const draft = state.draft
  const lines: HTMLElement[] = []
  let config: GameShowConfig | null = null

  try {
    config = stampLadderPoints(resolveConfig({
      ...draftToConfig(draft),
      runtime: { transport: { driver: 'channel' } },
    }))
  } catch (error) {
    lines.push(line('error', 'Cannot build', error instanceof Error ? error.message : String(error)))
  }

  if (config) {
    for (const message of validateConfigPlugins(config)) {
      lines.push(line('error', 'Cannot run', message))
    }
    for (const text of formatProblems(fitReport(config))) {
      lines.push(line('warn', 'Check', text.trim()))
    }
  }

  draft.rounds.forEach((round, index) => {
    if (questionCount(index) === 0) {
      lines.push(line('error', `${round.name} is empty`, 'Add a question, or delete the round.'))
    }
  })

  if (draft.teams.length === 0) lines.push(line('error', 'No teams', 'Add at least one team.'))

  // Rosters are positional, so deleting a team can leave a round pointing at a
  // group that is no longer there. Silently dropping it would change who plays.
  const known = new Set(draft.teams.map((_team, index) => `t${index + 1}`))
  for (const round of draft.rounds) {
    const missing = round.teamIds.filter(id => !known.has(id))
    if (missing.length > 0) {
      lines.push(line(
        'warn',
        `${round.name} roster`,
        `${missing.length} group(s) on this round's list no longer exist and will be dropped.`,
      ))
    }
  }

  const playing = draft.rounds.filter(round => round.minTeams <= draft.teams.length).length
  if (playing < draft.rounds.length) {
    lines.push(line('warn', 'Round skipped', 'A round needs more teams than the show has and will be passed over.'))
  }

  const startable = !lines.some(node => node.classList.contains('error'))
  if (startable) {
    const rounds = draft.rounds.length
    lines.unshift(line(
      'ok',
      'Ready',
      `${rounds} round${rounds === 1 ? '' : 's'}, ${questionCount()} question(s), ${draft.teams.length} team(s).`,
    ))
  }

  into.replaceChildren(...lines)
  return startable
}
