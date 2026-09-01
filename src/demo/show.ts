import type { GameShowConfigInput } from '../config/types'

export const demoShow: GameShowConfigInput = {
  meta: { id: 'demo', title: 'TriviaMaker', subtitle: 'Live demo' },
  join: { method: 'none' },
  runtime: { transport: { driver: 'memory' } },
  theme: {
    color: { bg: '#0d1220', accent: '#f5c518', tileText: '#f5c518' },
    type: { baseSize: 15, uppercaseCategories: true },
  },
  teams: {
    teams: [
      { id: 'red', name: 'Red', color: '#e8453c' },
      { id: 'blue', name: 'Blue', color: '#3b7ddd' },
      { id: 'green', name: 'Green', color: '#42d392' },
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
  program: {
    carryScores: true,
    rounds: [
      {
        id: 'r1', title: 'Round 1', subtitle: 'Warm-Up',
        bankId: 'demo', categoryIds: ['world', 'screen', 'words'],
        style: {
          kind: 'grid', columns: 3, rows: 3, pointLadder: [100, 200, 300],
          selection: 'freePick', showCategoryHeaders: true,
          consumedStyle: 'dim', dramaticCategoryReveal: false,
        },
      },
      {
        id: 'r2', title: 'Round 2', subtitle: 'Double Points',
        bankId: 'demo', categoryIds: ['science', 'music', 'oddments'],
        style: {
          kind: 'grid', columns: 3, rows: 3, pointLadder: [200, 400, 600],
          selection: 'freePick', showCategoryHeaders: true,
          consumedStyle: 'dim', dramaticCategoryReveal: false,
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
      id: 'demo', title: 'Demo Questions',
      categories: [
        { id: 'world', title: 'World', questions: [
          { id: 'w1', kind: 'text', points: 100, prompt: 'What is the capital of Japan?', answer: 'Tokyo' },
          { id: 'w2', kind: 'text', points: 200, prompt: 'Which is the largest ocean on Earth?', answer: 'The Pacific' },
          { id: 'w3', kind: 'text', points: 300, prompt: 'Which is the longest river in Africa?', answer: 'The Nile' },
        ] },
        { id: 'screen', title: 'Screen', questions: [
          { id: 's1', kind: 'text', points: 100, prompt: 'In The Lion King, what is Simba’s father called?', answer: 'Mufasa' },
          { id: 's2', kind: 'text', points: 200, prompt: 'Which animated film features a rat who wants to be a chef?', answer: 'Ratatouille' },
          { id: 's3', kind: 'text', points: 300, prompt: 'What is the name of Han Solo’s ship?', answer: 'The Millennium Falcon' },
        ] },
        { id: 'words', title: 'Words', questions: [
          { id: 'p1', kind: 'text', points: 100, prompt: 'What do you call a word that reads the same backwards?', answer: 'A palindrome' },
          { id: 'p2', kind: 'text', points: 200, prompt: 'Rearrange LISTEN to make another common word.', answer: 'SILENT' },
          { id: 'p3', kind: 'text', points: 300, prompt: 'What word describes a term that imitates a sound?', answer: 'Onomatopoeia' },
        ] },
        { id: 'science', title: 'Science', questions: [
          { id: 'c1', kind: 'text', points: 200, prompt: 'How many bones are in an adult human body?', answer: '206' },
          { id: 'c2', kind: 'text', points: 400, prompt: 'What is the chemical symbol for gold?', answer: 'Au' },
          { id: 'c3', kind: 'text', points: 600, prompt: 'Which part of the cell is called the powerhouse?', answer: 'The mitochondria' },
        ] },
        { id: 'music', title: 'Music', questions: [
          { id: 'm1', kind: 'text', points: 200, prompt: 'How many strings does a standard violin have?', answer: 'Four' },
          { id: 'm2', kind: 'text', points: 400, prompt: 'What does a conductor hold to keep time?', answer: 'A baton' },
          { id: 'm3', kind: 'text', points: 600, prompt: 'Which Italian term means “very loud”?', answer: 'Fortissimo' },
        ] },
        { id: 'oddments', title: 'Oddments', questions: [
          { id: 'o1', kind: 'text', points: 200, prompt: 'How many colours are traditionally in a rainbow?', answer: 'Seven' },
          { id: 'o2', kind: 'text', points: 400, prompt: 'What is the tallest animal in the world?', answer: 'The giraffe' },
          { id: 'o3', kind: 'text', points: 600, prompt: 'Which is the only mammal capable of true flight?', answer: 'The bat' },
        ] },
      ],
    }],
  },
}
