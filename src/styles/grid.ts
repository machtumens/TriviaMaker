import type { BoardModel, Intent, SessionState, StylePlugin } from '../registry/index'
import type { Category, GridStyle, Round } from '../config/types'

export type GridBuildOptions = GridStyle & { categories: Category[] }

function cellId(round: Round, category: Category, row: number): string {
  return `${round.id}:${category.id}:${row}`
}

export const gridStyle: StylePlugin<GridBuildOptions> = {
  key: 'grid',
  stageComponent: 'grid-board',
  hostComponent: 'grid-host-board',

  buildBoard(round: Round, options: GridBuildOptions, _state: SessionState): BoardModel {
    const cells: BoardModel['cells'] = []

    for (let row = 0; row < options.pointLadder.length; row++) {
      for (let col = 0; col < options.categories.length; col++) {
        const category = options.categories[col]
        if (!category) continue
        const question = category.questions[row]

        if (!question) continue

        cells.push({
          id: cellId(round, category, row),
          questionId: question.id,

          label: question.prompt,
          row,
          col,

          consumed: false,
          special: question.special ?? null,
          meta: {
            points: options.pointLadder[row] ?? question.points ?? null,
            categoryId: category.id,
            categoryTitle: category.title,
          },
        })
      }
    }

    return {
      kind: 'grid',
      cells,
      meta: {
        columns: options.columns,
        rows: options.rows,
        pointLadder: options.pointLadder,
        showCategoryHeaders: options.showCategoryHeaders,
        consumedStyle: options.consumedStyle,
        selection: options.selection,

        categories: options.categories.map(category => ({
          id: category.id,
          title: category.title,
          accent: category.accent ?? null,
          icon: category.icon ?? null,
        })),
      },
    }
  },

  availableQuestions(state: SessionState, board: BoardModel): string[] {
    return board.cells
      .map(cell => cell.questionId)
      .filter(questionId => !state.consumed.has(questionId))
  },

  onSelect(_state: SessionState, questionId: string): Intent[] {

    return [
      { type: 'selectQuestion', questionId },
      { type: 'setPhase', phase: 'reading' },
    ]
  },

  onResolved(_state: SessionState, _correct: boolean): Intent[] {

    return []
  },

  isRoundComplete(state: SessionState, board: BoardModel): boolean {
    return board.cells.every(cell => state.consumed.has(cell.questionId))
  },
}
