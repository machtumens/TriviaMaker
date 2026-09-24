import {
  applyHeatsAndFinal, blankQuizQuestions, ladderOfLength, newRound, shuffleHeats,
  type DraftRound,
} from '../draft'
import { block, button, checkbox, el, field, fields, numberInput, segmented, select, textInput } from '../ui'
import { goTo, refresh, rerender, state } from '../store'

const MAX_LADDER_ROWS = 6

/** Every category shows one row per ladder step, so a grid board always fills. */
function syncQuizRows(round: DraftRound): void {
  const rows = round.quiz.pointLadder.length
  round.quiz.categories = round.quiz.categories.map(category => {
    const kept = category.questions.slice(0, rows)
    while (kept.length < rows) kept.push({ prompt: '', answer: '', accept: '', note: '' })
    return { ...category, questions: kept }
  })
}

function formatSettings(round: DraftRound): HTMLElement {
  const wrap = el('div')

  if (round.format === 'feud') {
    wrap.append(fields(
      field('Strikes allowed', numberInput(round.feud.strikesAllowed, value => {
        round.feud.strikesAllowed = Math.max(0, Math.round(value))
        refresh()
      }, { min: 0, max: 9 })),
      field('Answer values', checkbox('Show points on each answer', round.feud.showCounts, value => {
        round.feud.showCounts = value
        refresh()
      })),
    ))
    return wrap
  }

  const ladder = el('div', 'fields')
  round.quiz.pointLadder.forEach((points, row) => {
    ladder.append(field(`Row ${row + 1}`, numberInput(points, value => {
      round.quiz.pointLadder[row] = Math.round(value)
      refresh()
    }, { min: 0, step: 50 })))
  })
  wrap.append(ladder)

  const buttons = el('div', 'row')
  buttons.append(button('Add a point row', 'ghost add', () => {
    if (round.quiz.pointLadder.length >= MAX_LADDER_ROWS) return
    round.quiz.pointLadder = ladderOfLength(round.quiz.pointLadder.length + 1)
    syncQuizRows(round)
    rerender()
  }))
  buttons.append(button('Remove a point row', 'ghost', () => {
    if (round.quiz.pointLadder.length <= 1) return
    round.quiz.pointLadder = round.quiz.pointLadder.slice(0, -1)
    syncQuizRows(round)
    rerender()
  }))
  wrap.append(buttons)
  return wrap
}

function roundCard(round: DraftRound, index: number): HTMLElement {
  const draft = state.draft
  const item = el('div', 'item')

  const head = el('div', 'item-head')
  head.append(el('span', 'index', `${index + 1}`))
  head.append(textInput(round.name, value => {
    round.name = value
    refresh()
  }, `Round ${index + 1}`))
  head.append(button('↑', 'ghost', () => { move(index, -1) }))
  head.append(button('↓', 'ghost', () => { move(index, 1) }))
  head.append(button('Copy', 'ghost add', () => {
    const clone = structuredClone(round)
    clone.id = nextRoundId()
    clone.name = `${round.name} copy`
    draft.rounds.splice(index + 1, 0, clone)
    goTo('rounds', index + 1)
  }))
  head.append(button('Delete', 'ghost', () => {
    if (draft.rounds.length <= 1) return
    draft.rounds.splice(index, 1)
    rerender()
  }))
  item.append(head)

  item.append(segmented(
    [{ label: 'Survey board (Feud)', value: 'feud' }, { label: 'Point grid (Quiz)', value: 'quiz' }],
    round.format,
    value => {
      round.format = value === 'quiz' ? 'quiz' : 'feud'
      if (round.format === 'quiz' && round.quiz.categories.length === 0) {
        round.quiz.categories = [
          { title: 'Category 1', questions: blankQuizQuestions(round.quiz.pointLadder.length) },
        ]
      }
      rerender()
    },
  ))

  item.append(fields(
    field('Projector title', textInput(round.title, value => {
      round.title = value
      refresh()
    }, draft.title), '(left corner)'),
    field('Projector subtitle', textInput(round.subtitle, value => {
      round.subtitle = value
      refresh()
    }, 'optional'), '(right corner)'),
  ))

  item.append(formatSettings(round))

  item.append(fields(
    field('Clock', select([
      { label: 'Use the show setting', value: 'show' },
      { label: 'No clock this round', value: 'off' },
      { label: 'Custom seconds', value: 'custom' },
    ], round.clockMode, value => {
      round.clockMode = value === 'off' ? 'off' : value === 'custom' ? 'custom' : 'show'
      rerender()
    })),
    ...(round.clockMode === 'custom'
      ? [field('Seconds', numberInput(round.clockSec, value => {
        round.clockSec = Math.max(1, Math.round(value))
        refresh()
      }, { min: 1, max: 900 }))]
      : []),
  ))

  item.append(fields(
    field('Opening card', textInput(round.introText, value => {
      round.introText = value
      refresh()
    }, 'leave empty to skip'), '(before the round)'),
    field('Opening card time', numberInput(round.introMs, value => {
      round.introMs = Math.max(200, Math.round(value))
      refresh()
    }, { min: 200, max: 15000, step: 500 }), '(ms)'),
    field('Intermission after', textInput(round.intermissionText, value => {
      round.intermissionText = value
      refresh()
    }, 'leave empty to skip'), '(text on the projector)'),
  ))

  item.append(rosterPicker(round))

  item.append(fields(
    field('When this round ends', select([
      { label: 'Everyone continues', value: 'all' },
      { label: 'The lowest score is out', value: 'lowest' },
      { label: 'Only the top N continue', value: 'top' },
    ], round.advance, value => {
      round.advance = value === 'lowest' ? 'lowest' : value === 'top' ? 'top' : 'all'
      rerender()
    })),
    ...(round.advance === 'top'
      ? [field('Teams that continue', numberInput(round.advanceTop, value => {
        round.advanceTop = Math.max(1, Math.round(value))
        refresh()
      }, { min: 1, max: 64 }), '(a tie on the line advances both)')]
      : []),
    field('Skip unless', numberInput(round.minTeams, value => {
      round.minTeams = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 32 }), '(teams still in; 0 = always play)'),
  ))

  const questions = el('div', 'row')
  questions.append(button(
    `Edit this round’s questions →`,
    'ghost add',
    () => { goTo('questions', index) },
  ))
  item.append(questions)

  return item
}

/**
 * Which groups take part. Empty means everyone still in the show, which is what
 * a final wants — by then the only teams left are the ones that won their heat.
 */
function rosterPicker(round: DraftRound): HTMLElement {
  const wrap = el('div')
  wrap.append(el('div', 'row-label', 'Groups in this round'))

  const chosen = new Set(round.teamIds)
  const picker = el('div', 'team-picker')

  state.draft.teams.forEach((team, index) => {
    const id = `t${index + 1}`
    const chip = button(team.name || id, 'chip', () => {
      if (chosen.has(id)) round.teamIds = round.teamIds.filter(entry => entry !== id)
      else round.teamIds = [...round.teamIds, id]
      rerender()
    })
    chip.style.setProperty('--team-color', team.color)
    chip.dataset['selected'] = String(chosen.has(id))
    picker.append(chip)
  })
  wrap.append(picker)

  const note = el('p', 'picker-hint', chosen.size === 0
    ? 'Everyone still in the show plays this round.'
    : `${chosen.size} group(s) play. The rest sit it out — they cannot score and are off the projector.`)
  wrap.append(note)

  if (chosen.size > 0) {
    const clear = el('div', 'row')
    clear.append(button('Everyone', 'ghost add', () => {
      round.teamIds = []
      rerender()
    }))
    wrap.append(clear)
  }

  return wrap
}

function nextRoundId(): string {
  const used = new Set(state.draft.rounds.map(round => round.id))
  let index = state.draft.rounds.length
  while (used.has(`r${index + 1}`)) index++
  return `r${index + 1}`
}

function move(index: number, by: number): void {
  const rounds = state.draft.rounds
  const target = index + by
  if (target < 0 || target >= rounds.length) return
  const [moved] = rounds.splice(index, 1)
  if (moved) rounds.splice(target, 0, moved)
  goTo('rounds', target)
}

interface Progression {
  name: string
  help: string
  apply: (rounds: DraftRound[], teams: number) => void
}

/**
 * Shapes for the whole programme. Every one of these is built out of the two
 * things the engine can actually do at a round boundary — drop the lowest, or
 * keep the top N — so none of them promise a draw sheet the show cannot run.
 */
const PROGRESSIONS: Progression[] = [
  {
    name: 'Everyone plays',
    help: 'No eliminations. The highest total after the last round wins.',
    apply: rounds => {
      for (const round of rounds) round.advance = 'all'
    },
  },
  {
    name: 'Knockout ladder',
    help: 'One team out after every round but the last. Long, and brutal near the end.',
    apply: rounds => {
      rounds.forEach((round, index) => {
        round.advance = index === rounds.length - 1 ? 'all' : 'lowest'
      })
    },
  },
  {
    name: 'Survival bracket',
    help: 'The field halves each round — 16 → 8 → 4 → 2 — on score, not on pairings.',
    apply: (rounds, teams) => {
      rounds.forEach((round, index) => {
        if (index === rounds.length - 1) {
          round.advance = 'all'
          return
        }
        round.advance = 'top'
        round.advanceTop = Math.max(1, Math.ceil(teams / 2 ** (index + 1)))
      })
    },
  },
  {
    name: 'Heats and a final',
    help: 'Four heats; each heat plays its own groups and sends one winner to the final. Rebuilds the rounds and re-deals the questions.',
    apply: () => { applyHeatsAndFinal(state.draft) },
  },
  {
    name: 'Grand final',
    help: 'Everyone plays the whole show; only the top two reach the last round.',
    apply: rounds => {
      rounds.forEach((round, index) => {
        round.advance = index === rounds.length - 2 ? 'top' : 'all'
        if (index === rounds.length - 2) round.advanceTop = 2
      })
    },
  },
]

function teamName(id: string): string {
  const index = Number(id.replace('t', '')) - 1
  return state.draft.teams[index]?.name || id
}

/** What the field looks like walking down the programme, before a ball is played. */
function projection(): string[] {
  const live = new Set(state.draft.teams.map((_team, index) => `t${index + 1}`))

  return state.draft.rounds.map(round => {
    if (round.minTeams > 0 && live.size < round.minTeams) {
      return `${round.name}: skipped — needs ${round.minTeams} groups, ${live.size} left`
    }

    const roster = round.teamIds.length > 0
      ? round.teamIds.filter(id => live.has(id))
      : [...live]

    const named = round.teamIds.length > 0
      ? `: ${roster.map(id => teamName(id)).join(', ')}`
      : ''

    let out = 0
    if (round.advance === 'lowest' && roster.length > 1) out = 1
    if (round.advance === 'top') out = Math.max(0, roster.length - Math.max(1, round.advanceTop))

    // Counting only: which particular groups go is decided on the night, by score.
    for (const id of roster.slice(roster.length - out)) live.delete(id)

    if (out === 0) return `${round.name}${named || `: ${roster.length} group(s)`} — all continue`
    return `${round.name}${named || `: ${roster.length} groups`}`
      + ` → ${roster.length - out} continue (${live.size} left in the show)`
  })
}

export function roundsPanel(): HTMLElement[] {
  const shape = block(
    'How the show progresses',
    'Pick a shape and it rewrites every round below. Elimination runs on score — the engine never pairs two teams against each other, so a bracket here is survival, not a draw sheet.',
  )
  const buttons = el('div', 'palettes')
  for (const progression of PROGRESSIONS) {
    const node = button('', 'swatch wide', () => {
      progression.apply(state.draft.rounds, state.draft.teams.length)
      rerender()
    })
    node.append(el('span', 'swatch-name', progression.name))
    node.append(el('span', 'swatch-help', progression.help))
    buttons.append(node)
  }
  shape.append(buttons)

  const draw = el('div', 'row')
  const rostered = state.draft.rounds.filter(round => round.teamIds.length > 0).length
  if (rostered > 0) {
    draw.append(button('Redraw the groups at random', 'ghost add', () => {
      shuffleHeats(state.draft)
      rerender()
    }))
    draw.append(el('p', 'picker-hint',
      'Keeps each round the same size and reshuffles who is in it. The draw is saved — '
      + 'it is the same list on the laptop, the projector and the paper you read it from.'))
  }
  shape.append(draw)

  const ladder = el('div', 'projection')
  for (const line of projection()) ladder.append(el('div', 'projection-line', line))
  shape.append(ladder)
  if (state.draft.rounds.length < 2) {
    shape.append(el('p', 'help', 'A one-round show has nothing to progress to — add a second round below first.'))
  }

  const wrap = block(
    'Rounds',
    'A show runs these in order. Each one has its own board, its own questions and its own opening card.',
  )

  state.draft.rounds.forEach((round, index) => { wrap.append(roundCard(round, index)) })

  wrap.append(button('Add a round', 'primary', () => {
    const round = newRound(state.draft.rounds.length)
    round.id = nextRoundId()
    state.draft.rounds.push(round)
    goTo('rounds', state.draft.rounds.length - 1)
  }))

  return [shape, wrap]
}
