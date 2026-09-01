import type { GameShowConfigInput } from '../src/config/types'

export const demoT1: GameShowConfigInput = {
  meta: {
    id: 'demo-t1',
    title: 'TriviaMaker Demo',
    subtitle: 'Two rounds, host-manual, no player devices',
  },

  join: { method: 'none' },

  teams: {
    teams: [
      { id: 'red', name: 'Red', color: '#ff5c5c' },
      { id: 'blue', name: 'Blue', color: '#3b7ddd' },
      { id: 'green', name: 'Green', color: '#3ddc84' },
    ],
    membership: { assignment: 'preassigned' },
  },

  rules: {
    turn: { picker: 'host', answerRights: 'turnOwner', maxAttempts: 1 },
    buzz: { enabled: false, requireArming: true },
    timer: { questionSec: 30, warnAtSec: 5, hostCanPause: true },
    wrongAnswer: { penalty: 0, allowSteal: false },

    scoring: { engine: 'flat', multiplier: 1 },
  },

  runtime: {
    transport: { driver: 'local' },
    degradeToOfflineOnNetworkLoss: true,
  },

  program: {
    carryScores: true,
    scoreboardBetweenRounds: true,
    rounds: [
      {
        id: 'r1',
        title: 'Round 1',
        subtitle: 'General Knowledge',
        bankId: 'demo',
        categoryIds: ['space', 'words', 'music'],
        style: {
          kind: 'grid',
          columns: 3,
          rows: 3,
          pointLadder: [100, 200, 300],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: false,
        },
        intro: { enabled: true, durationMs: 2500, text: 'Round 1' },
      },
      {
        id: 'r2',
        title: 'Round 2',
        subtitle: 'Double Points',
        bankId: 'demo',
        categoryIds: ['history', 'nature', 'numbers'],
        style: {
          kind: 'grid',
          columns: 3,
          rows: 3,
          pointLadder: [200, 400, 600],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: false,
        },

        overrides: {
          rules: { scoring: { multiplier: 2 }, timer: { questionSec: 20 } },
          theme: { color: { accent: '#ff6b35' } },
        },
        intro: { enabled: true, durationMs: 2500, text: 'Round 2 — Double Points' },
      },
    ],
    finale: { style: 'podium', dramaticReveal: true, showStats: true },
  },

  content: {
    banks: [{
      id: 'demo',
      title: 'Demo Questions',

      categories: [
        {
          id: 'space', title: 'Space',
          questions: [
            { id: 'space-1', kind: 'text', points: 100, prompt: 'Which planet is known as the Red Planet?', answer: 'Mars' },
            { id: 'space-2', kind: 'text', points: 200, prompt: 'What force keeps the planets in orbit around the Sun?', answer: 'Gravity' },
            { id: 'space-3', kind: 'text', points: 300, prompt: 'What is the name of the galaxy we live in?', answer: 'The Milky Way', acceptedAnswers: ['Milky Way'] },
          ],
        },
        {
          id: 'words', title: 'Words',
          questions: [
            { id: 'words-1', kind: 'text', points: 100, prompt: 'What do you call a word that means the opposite of another?', answer: 'An antonym', acceptedAnswers: ['antonym'] },
            { id: 'words-2', kind: 'text', points: 200, prompt: 'How many letters are in the English alphabet?', answer: '26' },
            { id: 'words-3', kind: 'text', points: 300, prompt: 'What is the longest word in this sentence: "Extraordinary claims require evidence"?', answer: 'Extraordinary', hostNote: 'Accept the spelling read aloud; do not require it in writing.' },
          ],
        },
        {
          id: 'music', title: 'Music',
          questions: [
            { id: 'music-1', kind: 'text', points: 100, prompt: 'How many strings does a standard guitar have?', answer: 'Six' },
            { id: 'music-2', kind: 'text', points: 200, prompt: 'What instrument has 88 keys?', answer: 'The piano', acceptedAnswers: ['piano'] },
            { id: 'music-3', kind: 'text', points: 300, prompt: 'What Italian word means "gradually getting louder"?', answer: 'Crescendo' },
          ],
        },
        {
          id: 'history', title: 'History',
          questions: [
            { id: 'history-1', kind: 'text', points: 200, prompt: 'In which year did the Second World War end?', answer: '1945' },
            { id: 'history-2', kind: 'text', points: 400, prompt: 'Which ancient civilisation built Machu Picchu?', answer: 'The Inca', acceptedAnswers: ['Inca', 'Incas'] },
            { id: 'history-3', kind: 'text', points: 600, prompt: 'Who was the first person to walk on the Moon?', answer: 'Neil Armstrong' },
          ],
        },
        {
          id: 'nature', title: 'Nature',
          questions: [
            { id: 'nature-1', kind: 'text', points: 200, prompt: 'What gas do plants absorb from the air?', answer: 'Carbon dioxide', acceptedAnswers: ['CO2'] },
            { id: 'nature-2', kind: 'text', points: 400, prompt: 'What is the largest living animal on Earth?', answer: 'The blue whale', acceptedAnswers: ['blue whale'] },
            { id: 'nature-3', kind: 'text', points: 600, prompt: 'What is the process by which plants make their own food?', answer: 'Photosynthesis' },
          ],
        },
        {
          id: 'numbers', title: 'Numbers',
          questions: [
            { id: 'numbers-1', kind: 'text', points: 200, prompt: 'What is 12 multiplied by 12?', answer: '144' },
            { id: 'numbers-2', kind: 'text', points: 400, prompt: 'How many sides does a hexagon have?', answer: 'Six' },
            { id: 'numbers-3', kind: 'text', points: 600, prompt: 'What is the value of pi to two decimal places?', answer: '3.14' },
          ],
        },
      ],
    }],
  },
}

export default demoT1
