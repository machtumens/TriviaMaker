/**
 * GRID STYLE — the Jeopardy-shaped board. Registry key: `'grid'`.
 *
 * Column = category, row = point ladder rung. The plugin is deliberately
 * content-dumb: it never reads `round.bankId`/`round.categoryIds` itself.
 * The caller resolves those into real categories (`session.resolveRoundContent`)
 * and hands them in via `GridBuildOptions`, which keeps content resolution in
 * one place instead of once per style.
 *
 * `StylePlugin<O>`'s `O` is a free generic in the settled T0 contract, so
 * carrying resolved content in the options object needs no interface change.
 */

import type { BoardModel, Intent, SessionState, StylePlugin } from '../registry/index'
import type { Category, GridStyle, Round } from '../config/types'

/**
 * A grid round's style config PLUS the content the caller already resolved.
 * Design Lock L16 — `buildBoard`'s only channel to real question data.
 */
export type GridBuildOptions = GridStyle & { categories: Category[] }

function cellId(round: Round, category: Category, row: number): string {
  return `${round.id}:${category.id}:${row}`
}

export const gridStyle: StylePlugin<GridBuildOptions> = {
  key: 'grid',
  stageComponent: 'grid-board',
  hostComponent: 'grid-host-board',

  buildBoard(round: Round, options: GridBuildOptions): BoardModel {
    const cells: BoardModel['cells'] = []

    for (let row = 0; row < options.pointLadder.length; row++) {
      for (let col = 0; col < options.categories.length; col++) {
        const category = options.categories[col]
        if (!category) continue
        const question = category.questions[row]
        // Authors are expected to order each category's questions to match the
        // point ladder. A short category simply contributes fewer tiles rather
        // than crashing the show or inventing a placeholder question.
        if (!question) continue

        cells.push({
          id: cellId(round, category, row),
          questionId: question.id,
          // Real prompt text. `broadcastState` replaces it with the point value
          // before this board reaches the stage or a player device (L17).
          label: question.prompt,
          row,
          col,
          // Consumption lives in `state.consumed`, never on the board itself.
          // `buildBoard` has no access to state, so the one call site that does
          // (`broadcastState`) derives this per cell.
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
        // Category titles are stage-safe: the audience is meant to see them.
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
    // Two intents, ONE host action. `session.dispatchHostAction` logs them as a
    // single event so one undo press puts the board back (L2a).
    return [
      { type: 'selectQuestion', questionId },
      { type: 'setPhase', phase: 'reading' },
    ]
  },

  onResolved(_state: SessionState, _correct: boolean): Intent[] {
    // Award/consume/advance are handled generically in `session.resolveAnswer`
    // (L6). A grid board has no style-specific consequence on top of that.
    return []
  },

  isRoundComplete(state: SessionState, board: BoardModel): boolean {
    return board.cells.every(cell => state.consumed.has(cell.questionId))
  },
}
