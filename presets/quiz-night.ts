import type { GameShowConfigInput } from '../src/config/types'

/**
 * Three rounds, no questions of its own — every round names a packet from
 * `packets/` with `bankId`, so the show is the format and the packets are the
 * content. Swap a bankId to run the same night on a different subject.
 *
 * Server only: `npm run show` reads packets/ from disk. The browser build has no
 * filesystem, so one-laptop mode loads packets through the host window instead.
 */
export const quizNight: GameShowConfigInput = {
  meta: {
    id: 'quiz-night',
    title: 'Quiz Night',
    subtitle: 'Three rounds, rising stakes',
  },

  teams: {
    teams: [
      { id: 'red', name: 'Red', color: '#e8453c' },
      { id: 'blue', name: 'Blue', color: '#3b7ddd' },
      { id: 'green', name: 'Green', color: '#42d392' },
      { id: 'gold', name: 'Gold', color: '#f5c518' },
    ],
  },

  rules: {
    timer: { questionSec: 30, hostCanPause: true },
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
        title: 'Round 1',
        subtitle: 'General Knowledge',
        bankId: 'general-knowledge',
        style: {
          kind: 'grid',
          columns: 3,
          rows: 3,
          pointLadder: [100, 200, 300],
          showCategoryHeaders: true,
        },
        intro: { enabled: true, durationMs: 2500, text: 'Round 1 — General Knowledge' },
      },
      {
        id: 'r2',
        title: 'Round 2',
        subtitle: 'Science',
        bankId: 'science',

        // Naming categories is optional — a round plays the whole packet without
        // it. Listed here because the order sets the order of the columns.
        categoryIds: ['body', 'chemistry', 'animals'],
        style: {
          kind: 'grid',
          columns: 3,
          rows: 3,
          pointLadder: [200, 400, 600],
          showCategoryHeaders: true,
        },
        overrides: {
          // Tile values read theme.color.tileText, not accent — override both or
          // the board keeps the colour of round one while the header changes.
          rules: { timer: { questionSec: 25 } },
          theme: { color: { accent: '#42d392', tileText: '#42d392' } },
        },
        intro: { enabled: true, durationMs: 2500, text: 'Round 2 — Science' },
      },
      {
        id: 'r3',
        title: 'Round 3',
        subtitle: 'Around the World',
        bankId: 'world',
        style: {
          kind: 'grid',
          columns: 3,
          rows: 3,
          pointLadder: [300, 600, 900],
          showCategoryHeaders: true,
        },
        overrides: {
          rules: { timer: { questionSec: 20 } },
          theme: { color: { accent: '#ff6b35', tileText: '#ff6b35' } },
        },
        intro: { enabled: true, durationMs: 2500, text: 'Round 3 — Around the World' },
      },
    ],
  },
}

export default quizNight
