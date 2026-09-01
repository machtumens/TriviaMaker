import type { GameShowConfigInput } from '../src/config/types'

export const schoolAssembly: GameShowConfigInput = {
  meta: {
    id: 'school-assembly',
    title: 'Student Council Quiz Bowl',
    subtitle: 'Inter-Class Championship',
  },

  theme: {
    color: {
      bg: '#101426',
      accent: '#f5c518',
      tileText: '#f5c518',
      correct: '#42d392',
    },
    type: { baseSize: 24, uppercaseCategories: true },
  },

  layout: {
    branding: { logo: '/media/school-logo.png', logoPosition: 'topRight' },
    scoreboard: { position: 'bottom', style: 'bars' },
  },

  teams: {
    teams: [
      { id: 'x', name: 'Class X', color: '#e8453c' },
      { id: 'y', name: 'Class Y', color: '#3b7ddd' },
      { id: 'z', name: 'Class Z', color: '#42d392' },
      { id: 'w', name: 'Class W', color: '#f5c518' },
    ],
    membership: { assignment: 'preassigned' },
  },

  join: { method: 'none' },
  rules: {
    buzz: {
      inputs: [{
        kind: 'keyboard',

        keyMap: { '1': 'x', '2': 'y', '3': 'z', '4': 'w' },
      }],
      arbitration: 'arrival',
      graceWindowMs: 0,
      requireArming: true,
      falseStart: 'lockoutMs',
    },
    wrongAnswer: { penalty: 0, allowSteal: true, maxSteals: 1 },
  },

  runtime: {
    transport: { driver: 'local' },
    degradeToOfflineOnNetworkLoss: true,
  },

  program: {
    carryScores: true,
    rounds: [

      {
        id: 'r1',
        title: 'General Knowledge',
        style: {
          kind: 'grid',
          columns: 5,
          rows: 5,
          pointLadder: [100, 200, 300, 400, 500],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: true,
        },
        intro: { enabled: true, durationMs: 3000, text: 'Round 1' },
      },

      {
        id: 'r2',
        title: 'Double Trouble',
        style: {
          kind: 'grid',
          columns: 5,
          rows: 5,
          pointLadder: [200, 400, 600, 800, 1000],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: false,
        },
        overrides: {
          rules: {
            scoring: { multiplier: 2, streak: { enabled: true, threshold: 2 } },
            timer: { questionSec: 20, warnAtSec: 5 },
            wrongAnswer: { allowSteal: false },
          },
          theme: { color: { accent: '#ff6b35' } },
        },
        intro: { enabled: true, durationMs: 3000, text: 'Round 2 — Double Points' },
        intermissionAfter: { enabled: true, text: 'Short break' },
      },

      {
        id: 'final',
        title: 'Final Question',
        style: {
          kind: 'trivia',
          questionOrder: 'authored',
          showChoicesOnPlayerDevice: false,
          revealDistribution: false,
        },
        overrides: {
          rules: {
            scoring: {
              wager: {
                enabled: true,
                maxRule: 'currentScore',
                minimumAllowance: 500,
                hiddenUntilReveal: true,
              },
              allowNegative: true,
            },
            turn: { answerRights: 'allSimultaneous' },
            timer: { questionSec: 60, wagerSec: 45 },
            buzz: { enabled: false },
          },
          theme: { color: { bg: '#05070f', accent: '#ffffff' } },
          motion: { effects: { onCorrect: 'confettiCannon' } },
        },
        intro: { enabled: true, durationMs: 4000, text: 'Final Question' },
      },
    ],
    scoreboardBetweenRounds: true,
    finale: { style: 'podium', dramaticReveal: true, showStats: true },
  },

  content: {
    banks: [{
      id: 'main',
      title: 'Assembly Questions',
      categories: [{
        id: 'sci',
        title: 'Science',
        questions: [
          {
            id: 'sci-100',
            kind: 'text',
            prompt: 'What planet is known as the Red Planet?',
            answer: 'Mars',
            points: 100,
          },
          {
            id: 'sci-200',
            kind: 'text',
            prompt: 'What gas do plants absorb from the atmosphere?',
            answer: 'Carbon dioxide',
            acceptedAnswers: ['CO2', 'carbon dioxide'],
            points: 200,

            overrides: { timer: { questionSec: 45 } },
            trivia: 'Roughly 0.04% of the atmosphere is CO2.',
          },
        ],
      }],
    }],
  },
}
