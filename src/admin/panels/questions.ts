import { blankQuizQuestions, dealQuestions, type DraftRound } from '../draft'
import {
  block, button, el, field, fields, numberInput, textArea, textInput,
} from '../ui'
import { currentRound, refresh, rerender, state } from '../store'

/** Which round is being edited, when the show has more than one. */
function roundPicker(): HTMLElement | null {
  if (state.draft.rounds.length < 2) return null

  const wrap = el('div', 'tabs round-picker')
  state.draft.rounds.forEach((round, index) => {
    const node = button(round.name || `Round ${index + 1}`, '', () => {
      state.round = index
      rerender()
    })
    node.setAttribute('aria-current', String(index === state.round))
    wrap.append(node)
  })
  return wrap
}

function feudEditor(round: DraftRound): HTMLElement {
  const wrap = block(
    `Survey questions — ${round.name}`,
    'One question, its answers highest value first. Every group answers each question; the host taps who said what.',
  )

  round.feud.questions.forEach((question, index) => {
    const item = el('div', 'item')

    const head = el('div', 'item-head')
    head.append(el('span', 'index', `Question ${index + 1}`))
    head.append(el('span', 'spacer'))
    head.append(button('↑', 'ghost', () => { moveIn(round.feud.questions, index, -1) }))
    head.append(button('↓', 'ghost', () => { moveIn(round.feud.questions, index, 1) }))
    head.append(button('Delete', 'ghost', () => {
      round.feud.questions.splice(index, 1)
      rerender()
    }))
    item.append(head)

    item.append(textArea(question.prompt, value => {
      question.prompt = value
      refresh()
    }, 'Name something…'))

    question.answers.forEach((answer, answerIndex) => {
      const row = el('div', 'answer-row')
      row.append(textInput(answer.text, value => {
        answer.text = value
        refresh()
      }, `Answer ${answerIndex + 1}`))
      row.append(numberInput(answer.count, value => {
        answer.count = Math.max(0, Math.round(value))
        refresh()
      }, { min: 0 }))
      row.append(button('✕', 'ghost', () => {
        question.answers.splice(answerIndex, 1)
        rerender()
      }))
      item.append(row)
    })

    item.append(button('Add an answer', 'ghost add', () => {
      question.answers.push({ text: '', count: 10 })
      rerender()
    }))

    wrap.append(item)
  })

  wrap.append(button('Add a question', 'primary', () => {
    round.feud.questions.push({ prompt: '', answers: [{ text: '', count: 30 }] })
    rerender()
  }))

  return wrap
}

function quizEditor(round: DraftRound): HTMLElement {
  const wrap = block(
    `Categories and questions — ${round.name}`,
    'One card per column on the board. Each row is worth what the point ladder says.',
  )

  round.quiz.categories.forEach((category, index) => {
    const item = el('div', 'item')

    const head = el('div', 'item-head')
    head.append(el('span', 'index', `Column ${index + 1}`))
    head.append(textInput(category.title, value => {
      category.title = value
      refresh()
    }, 'Category name'))
    head.append(button('←', 'ghost', () => { moveIn(round.quiz.categories, index, -1) }))
    head.append(button('→', 'ghost', () => { moveIn(round.quiz.categories, index, 1) }))
    head.append(button('Delete', 'ghost', () => {
      round.quiz.categories.splice(index, 1)
      rerender()
    }))
    item.append(head)

    category.questions.forEach((row, rowIndex) => {
      const points = round.quiz.pointLadder[rowIndex] ?? 0
      item.append(el('div', 'row-label', `${points} points`))
      item.append(textArea(row.prompt, value => {
        row.prompt = value
        refresh()
      }, 'Question'))
      item.append(fields(
        field('Answer', textInput(row.answer, value => {
          row.answer = value
          refresh()
        }, 'Answer')),
        field('Also accept', textInput(row.accept, value => {
          row.accept = value
          refresh()
        }, 'separate | with | bars'), '(optional)'),
        field('Host note', textInput(row.note, value => {
          row.note = value
          refresh()
        }, 'never shown on the projector'), '(optional)'),
      ))
    })

    wrap.append(item)
  })

  wrap.append(button('Add a column', 'primary', () => {
    round.quiz.categories.push({
      title: `Category ${round.quiz.categories.length + 1}`,
      questions: blankQuizQuestions(round.quiz.pointLadder.length),
    })
    rerender()
  }))

  return wrap
}

function moveIn<T>(list: T[], index: number, by: number): void {
  const target = index + by
  if (target < 0 || target >= list.length) return
  const [moved] = list.splice(index, 1)
  if (moved !== undefined) list.splice(target, 0, moved)
  rerender()
}

export function questionsPanel(onImport: () => void, onExport: () => void): HTMLElement[] {
  const round = currentRound()

  const source = block(
    'Bring questions in',
    'A spreadsheet export (.csv) or a packet (.json) replaces the questions in the round below. Teams, colours and timing stay as you set them.',
  )
  const row = el('div', 'row')
  row.append(button('Import into this round…', 'ghost add', onImport))
  row.append(button('Export this round (.json)', 'ghost add', onExport))

  // An imported packet lands in one round. In a heats show that is rarely where
  // it belongs, so dealing is one button rather than a guess at import time.
  const surveyRounds = state.draft.rounds.filter(round => round.format === 'feud').length
  if (surveyRounds > 1) {
    row.append(button('Deal all questions across the rounds', 'ghost add', () => {
      const pool = state.draft.rounds.flatMap(round => round.feud.questions)
      dealQuestions(state.draft, pool)
      rerender()
    }))
  }

  source.append(row)
  source.append(el('p', 'help',
    'You can also drop a file anywhere on this page. Dealing shares every survey question out '
    + 'evenly, in order, and gives the last round the remainder — sixteen questions across four '
    + 'heats and a final is 3, 3, 3, 3, 4.'))

  const picker = roundPicker()
  const editor = round.format === 'feud' ? feudEditor(round) : quizEditor(round)

  return picker ? [picker, source, editor] : [source, editor]
}
