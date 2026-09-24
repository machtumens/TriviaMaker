import type { GameShowConfigInput } from '../src/config/types'

/**
 * Family Feud for the school celebration: sixteen groups, one survey board at a
 * time.
 *
 * Every group competes on every question — they call answers out, the host taps
 * who said it and which answer it was, and that answer pays its own value. The
 * questions live in packets/family-feud.csv, one row per answer, so they can be
 * rewritten in a spreadsheet without touching this file.
 */

/** Sixteen distinguishable colours. Rename the groups to the real class names. */
const GROUPS = [
  'Group 1', 'Group 2', 'Group 3', 'Group 4',
  'Group 5', 'Group 6', 'Group 7', 'Group 8',
  'Group 9', 'Group 10', 'Group 11', 'Group 12',
  'Group 13', 'Group 14', 'Group 15', 'Group 16',
]

const COLORS = [
  '#e8453c', '#3b7ddd', '#42d392', '#f5c518',
  '#a855f7', '#f97316', '#14b8a6', '#ec4899',
  '#84cc16', '#06b6d4', '#8b5cf6', '#ef4444',
  '#22c55e', '#eab308', '#6366f1', '#f43f5e',
]

export const familyFeud: GameShowConfigInput = {
  meta: {
    id: 'family-feud',
    title: 'Family Feud',
    subtitle: 'School Celebration',
  },

  teams: {
    teams: GROUPS.map((name, index) => ({
      id: `g${index + 1}`,
      name,
      color: COLORS[index] ?? '#888888',
    })),
  },

  rules: {
    // Every group competes on every question: the host decides who called an
    // answer first, so the engine does not arbitrate turns.
    timer: { questionSec: 60, hostCanPause: true },
    wrongAnswer: { penalty: 0 },
    scoring: { engine: 'flat', multiplier: 1 },
  },
  runtime: {
    transport: { driver: 'local' },
  },

  program: {
    carryScores: true,
    rounds: [
      {
        id: 'r1',

        // The two corners of the projector, shown exactly as written here.
        title: 'GLUE',
        subtitle: 'Family Feud',
        bankId: 'family-feud',
        style: {
          kind: 'list',

          // The cap, not the count: a question with four answers shows four
          // slots. The packet mixes both.
          slots: 5,
          strikesAllowed: 3,
          showCounts: true,
        },
        intro: { enabled: true, durationMs: 2500, text: 'Family Feud' },
      },
    ],
  },
}

export default familyFeud
