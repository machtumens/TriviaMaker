import type { BoardModel, Intent, JsonValue, SessionState, StylePlugin } from '../registry/index'
import type { Category, ListStyle, Question, Round } from '../config/types'

export type ListBuildOptions = ListStyle & { categories: Category[] }

/**
 * The Family Feud board: one survey question at a time, its answers hidden in
 * numbered slots, revealed as groups call them out.
 *
 * The audience board is derived from the host board (engine/broadcast.ts), so an
 * unrevealed answer must never be put in the board at all — not merely flagged
 * hidden. Slots carry text and points only once revealed; the host reads the
 * full list from its own unredacted copy of the question.
 */

interface FeudState {
  /** questionId → the answer positions already on the board. */
  revealed: Record<string, number[]>
  strikes: number
}

const EMPTY: FeudState = { revealed: {}, strikes: 0 }

export function feudState(state: SessionState): FeudState {
  const raw = state.styleState as Partial<FeudState> | undefined
  return {
    revealed: raw?.revealed ?? EMPTY.revealed,
    strikes: typeof raw?.strikes === 'number' ? raw.strikes : 0,
  }
}

function asStyleState(next: FeudState): Record<string, JsonValue> {
  return { revealed: next.revealed, strikes: next.strikes }
}

function questionsOf(options: ListBuildOptions): Question[] {
  return options.categories.flatMap(category => category.questions)
}

function findQuestion(options: ListBuildOptions, questionId: string | null): Question | null {
  if (questionId === null) return null
  return questionsOf(options).find(question => question.id === questionId) ?? null
}

export function answersOf(question: Question): Array<{ text: string; count: number }> {
  return question.surveyAnswers ?? []
}

export const listStyle: StylePlugin<ListBuildOptions> = {
  key: 'list',
  stageComponent: 'list-board',
  hostComponent: 'list-host-board',

  buildBoard(round: Round, options: ListBuildOptions, state: SessionState): BoardModel {
    const questions = questionsOf(options)
    const current = findQuestion(options, state.currentQuestionId)
    const feud = feudState(state)
    const revealed = current ? feud.revealed[current.id] ?? [] : []

    const slots = current
      ? answersOf(current).slice(0, options.slots).map((answer, index) =>
          revealed.includes(index)
            ? { index, revealed: true, text: answer.text, points: answer.count }
            : { index, revealed: false })
      : []

    return {
      kind: 'list',

      // Cell labels are blanked for the audience by the point-ladder pass, which
      // a list round has none of — so the number the stage draws lives in meta.
      cells: questions.map((question, index) => ({
        id: `${round.id}:${question.id}`,
        questionId: question.id,
        label: question.prompt,
        consumed: false,
        meta: { number: index + 1 },
      })),

      meta: {
        slots,
        strikes: feud.strikes,
        strikesAllowed: options.strikesAllowed,
        showCounts: options.showCounts,
        questionCount: questions.length,
        answeredCount: questions.filter(question => state.consumed.has(question.id)).length,
      },
    }
  },

  availableQuestions(state: SessionState, board: BoardModel): string[] {
    return board.cells
      .map(cell => cell.questionId)
      .filter(questionId => !state.consumed.has(questionId))
  },

  onSelect(state: SessionState, questionId: string): Intent[] {
    // Strikes belong to the question being played, not the show.
    const feud = feudState(state)
    return [
      { type: 'selectQuestion', questionId },
      { type: 'setStyleState', nextStyleState: asStyleState({ ...feud, strikes: 0 }) },
      { type: 'setPhase', phase: 'reading' },
    ]
  },

  onResolved(_state: SessionState, _correct: boolean): Intent[] {
    return []
  },

  isRoundComplete(state: SessionState, board: BoardModel): boolean {
    return board.cells.every(cell => state.consumed.has(cell.questionId))
  },

  onCommand(state: SessionState, type: string, fields: Record<string, unknown>): Intent[] | null {
    if (type === 'strike') {
      const feud = feudState(state)
      return [{ type: 'setStyleState', nextStyleState: asStyleState({ ...feud, strikes: feud.strikes + 1 }) }]
    }

    if (type !== 'revealAnswer') return null

    const questionId = state.currentQuestionId
    if (questionId === null) throw new Error('[list] no question is in play')

    const index = fields['answerIndex']
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      throw new Error('[list] revealAnswer.answerIndex must be a whole number')
    }
    const teamId = fields['teamId']
    if (typeof teamId !== 'string' || teamId.length === 0) {
      throw new Error('[list] revealAnswer.teamId must name the team that said it')
    }

    const question = findQuestionInConfig(state, questionId)
    const answer = answersOf(question)[index]
    if (!answer) throw new Error(`[list] question "${questionId}" has no answer at position ${index + 1}`)

    const feud = feudState(state)
    const already = feud.revealed[questionId] ?? []
    if (already.includes(index)) return []

    const revealed = { ...feud.revealed, [questionId]: [...already, index] }
    const intents: Intent[] = []

    // Revealing an answer is itself the floor opening, so a host who starts
    // calling answers without pressing Arm first is not punished for it.
    if (state.phase === 'reading') intents.push({ type: 'setPhase', phase: 'armed' })

    intents.push(
      { type: 'setStyleState', nextStyleState: asStyleState({ ...feud, revealed }) },
      { type: 'awardPoints', teamId, delta: answer.count, reason: `revealed "${answer.text}"` },
    )

    // The last slot ends the question; the host still chooses when to move on.
    if (revealed[questionId]?.length === answersOf(question).length) {
      intents.push({ type: 'consumeQuestion', questionId })
      intents.push({ type: 'setPhase', phase: 'reveal' })
    }

    return intents
  },
}

function findQuestionInConfig(state: SessionState, questionId: string): Question {
  for (const bank of state.config.content.banks) {
    for (const category of bank.categories) {
      for (const question of category.questions) {
        if (question.id === questionId) return question
      }
    }
  }
  throw new Error(`[list] question "${questionId}" is not in any loaded bank`)
}
