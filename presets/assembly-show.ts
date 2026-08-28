/**
 * ASSEMBLY SHOW — a full-length, ready-to-run student council game show.
 *
 *   npm run build && npm run show presets/assembly-show.ts
 *
 * Two rounds of 16 questions each, an intermission, and a podium finale.
 * Runs roughly 35-45 minutes with four teams and a host who keeps it moving.
 *
 * Everything here works today: `grid` rounds, `flat` scoring, host-manual
 * adjudication, no player devices. Round 2 doubles the points and shortens
 * the clock via a per-round override — pure config, no engine code.
 *
 * TUNING FOR YOUR ROOM
 *   theme.type.baseSize  — the single most useful knob. Every font size is a
 *                          multiple of it. Bump to 28-30 for a big hall.
 *   timer.questionSec    — 30s is generous; drop to 20 if the room is restless.
 *   teams                — rename to your actual classes/houses.
 *
 * Questions are ordered EASIEST FIRST within each category, matching the point
 * ladder's row order.
 */

import type { GameShowConfigInput } from '../src/config/types'

export const assemblyShow: GameShowConfigInput = {
  meta: {
    id: 'assembly-show',
    title: 'Student Council Quiz Bowl',
    subtitle: 'Inter-Class Championship',
  },

  // Stage-only: teams at the front, host adjudicates, no phones to manage.
  join: { method: 'none' },

  theme: {
    color: {
      bg: '#0d1220',
      accent: '#f5c518',
      tileText: '#f5c518',
      correct: '#42d392',
    },
    // Bump to 28-30 if the back row squints. This scales EVERYTHING.
    type: { baseSize: 24, uppercaseCategories: true },
  },

  layout: {
    scoreboard: { position: 'bottom', style: 'bars' },
  },

  teams: {
    teams: [
      { id: 'red', name: 'Class Red', color: '#e8453c' },
      { id: 'blue', name: 'Class Blue', color: '#3b7ddd' },
      { id: 'green', name: 'Class Green', color: '#42d392' },
      { id: 'gold', name: 'Class Gold', color: '#f5c518' },
    ],
    membership: { assignment: 'preassigned' },
  },

  rules: {
    turn: { picker: 'host', answerRights: 'turnOwner', maxAttempts: 1 },
    buzz: { enabled: false, requireArming: true },
    timer: { questionSec: 30, warnAtSec: 5, hostCanPause: true },
    // No penalty for a wrong answer — kinder for a school audience, and it
    // keeps a losing team engaged. Set penalty > 0 if you want it harsher.
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
        subtitle: 'Warm-Up',
        bankId: 'assembly',
        categoryIds: ['world', 'science', 'screen', 'words'],
        style: {
          kind: 'grid',
          columns: 4,
          rows: 4,
          pointLadder: [100, 200, 300, 400],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: false,
        },
        intro: { enabled: true, durationMs: 3000, text: 'Round 1' },
        intermissionAfter: { enabled: true, text: 'Intermission — back in five' },
      },
      {
        id: 'r2',
        title: 'Round 2',
        subtitle: 'Double Points',
        bankId: 'assembly',
        categoryIds: ['music', 'history', 'sports', 'oddments'],
        style: {
          kind: 'grid',
          columns: 4,
          rows: 4,
          pointLadder: [200, 400, 600, 800],
          selection: 'freePick',
          showCategoryHeaders: true,
          consumedStyle: 'dim',
          dramaticCategoryReveal: false,
        },
        // Pure config — the engine has no idea what "double points" means.
        overrides: {
          rules: { scoring: { multiplier: 2 }, timer: { questionSec: 20 } },
          theme: { color: { accent: '#ff6b35' } },
        },
        intro: { enabled: true, durationMs: 3000, text: 'Round 2 — Double Points' },
      },
    ],
    finale: { style: 'podium', dramaticReveal: true, showStats: true },
  },

  content: {
    banks: [{
      id: 'assembly',
      title: 'Assembly Questions',
      categories: [
        // ---------------------------------------------------------- ROUND 1
        {
          id: 'world', title: 'Around the World',
          questions: [
            { id: 'w1', kind: 'text', points: 100, prompt: 'What is the capital city of Japan?', answer: 'Tokyo' },
            { id: 'w2', kind: 'text', points: 200, prompt: 'Which is the largest ocean on Earth?', answer: 'The Pacific Ocean', acceptedAnswers: ['Pacific'], trivia: 'It covers about a third of the planet.' },
            { id: 'w3', kind: 'text', points: 300, prompt: 'Which is the longest river in Africa?', answer: 'The Nile', acceptedAnswers: ['Nile'] },
            { id: 'w4', kind: 'text', points: 400, prompt: 'Mount Everest sits on the border between Nepal and which other country?', answer: 'China', acceptedAnswers: ['Tibet', 'China (Tibet)'], hostNote: 'Accept "Tibet" — it is the Tibet Autonomous Region of China.' },
          ],
        },
        {
          id: 'science', title: 'Science-ish',
          questions: [
            { id: 's1', kind: 'text', points: 100, prompt: 'How many bones are there in an adult human body?', answer: '206' },
            { id: 's2', kind: 'text', points: 200, prompt: 'What is the chemical symbol for gold?', answer: 'Au', hostNote: 'They may say the letters aloud: "A-U".' },
            { id: 's3', kind: 'text', points: 300, prompt: 'Which part of the cell is nicknamed the "powerhouse"?', answer: 'The mitochondria', acceptedAnswers: ['mitochondria', 'mitochondrion'] },
            { id: 's4', kind: 'text', points: 400, prompt: 'Roughly how fast does light travel, in kilometres per second?', answer: 'About 300,000 km/s', acceptedAnswers: ['300000', '300,000', 'three hundred thousand'], hostNote: 'Anything close to 300,000 counts.' },
          ],
        },
        {
          id: 'screen', title: 'Screen Time',
          questions: [
            { id: 'sc1', kind: 'text', points: 100, prompt: 'In The Lion King, what is the name of Simba’s father?', answer: 'Mufasa' },
            { id: 'sc2', kind: 'text', points: 200, prompt: 'Which animated film features a rat who dreams of becoming a chef?', answer: 'Ratatouille' },
            { id: 'sc3', kind: 'text', points: 300, prompt: 'In Star Wars, what is the name of Han Solo’s ship?', answer: 'The Millennium Falcon', acceptedAnswers: ['Millennium Falcon'] },
            { id: 'sc4', kind: 'text', points: 400, prompt: 'In The Matrix, which colour pill does Neo take to learn the truth?', answer: 'The red pill', acceptedAnswers: ['red'] },
          ],
        },
        {
          id: 'words', title: 'Word Play',
          questions: [
            { id: 'wp1', kind: 'text', points: 100, prompt: 'What do you call a word that reads the same forwards and backwards?', answer: 'A palindrome', acceptedAnswers: ['palindrome'] },
            { id: 'wp2', kind: 'text', points: 200, prompt: 'Rearrange the letters of LISTEN to make another common English word.', answer: 'SILENT', acceptedAnswers: ['silent', 'enlist', 'tinsel'], hostNote: 'SILENT is the intended answer, but ENLIST and TINSEL also work — accept any.' },
            { id: 'wp3', kind: 'text', points: 300, prompt: 'What is the word for a term that imitates a sound, like "buzz" or "splash"?', answer: 'Onomatopoeia' },
            { id: 'wp4', kind: 'text', points: 400, prompt: 'What is the only common English word ending in the letters M-T?', answer: 'Dreamt', trivia: 'Along with its compounds, like "undreamt".' },
          ],
        },
        // ---------------------------------------------------------- ROUND 2
        {
          id: 'music', title: 'Music',
          questions: [
            { id: 'm1', kind: 'text', points: 200, prompt: 'How many strings does a standard violin have?', answer: 'Four' },
            { id: 'm2', kind: 'text', points: 400, prompt: 'What does a conductor hold to keep an orchestra in time?', answer: 'A baton', acceptedAnswers: ['baton'] },
            { id: 'm3', kind: 'text', points: 600, prompt: 'How many lines make up a musical staff?', answer: 'Five' },
            { id: 'm4', kind: 'text', points: 800, prompt: 'Which Italian musical term means "very loud"?', answer: 'Fortissimo', hostNote: 'Accept "forte" only if they correct themselves — forte is just "loud".' },
          ],
        },
        {
          id: 'history', title: 'History',
          questions: [
            { id: 'h1', kind: 'text', points: 200, prompt: 'In which year did the Second World War end?', answer: '1945' },
            { id: 'h2', kind: 'text', points: 400, prompt: 'Which of the Seven Wonders of the Ancient World is still standing today?', answer: 'The Great Pyramid of Giza', acceptedAnswers: ['Great Pyramid', 'pyramids of Giza'] },
            { id: 'h3', kind: 'text', points: 600, prompt: 'Who was the first woman to win a Nobel Prize?', answer: 'Marie Curie', trivia: 'She later won a second, in a different science.' },
            { id: 'h4', kind: 'text', points: 800, prompt: 'In which year did the Berlin Wall fall?', answer: '1989' },
          ],
        },
        {
          id: 'sports', title: 'Sports',
          questions: [
            { id: 'sp1', kind: 'text', points: 200, prompt: 'How many players from one team are on the pitch in a football match?', answer: 'Eleven' },
            { id: 'sp2', kind: 'text', points: 400, prompt: 'How many years apart are the Summer Olympic Games held?', answer: 'Four years', acceptedAnswers: ['four', '4'] },
            { id: 'sp3', kind: 'text', points: 600, prompt: 'In basketball, how many points is a free throw worth?', answer: 'One' },
            { id: 'sp4', kind: 'text', points: 800, prompt: 'Which country has won the most FIFA World Cups?', answer: 'Brazil', trivia: 'Five titles.' },
          ],
        },
        {
          id: 'oddments', title: 'Odds & Ends',
          questions: [
            { id: 'o1', kind: 'text', points: 200, prompt: 'How many colours are traditionally counted in a rainbow?', answer: 'Seven' },
            { id: 'o2', kind: 'text', points: 400, prompt: 'What is the tallest animal in the world?', answer: 'The giraffe', acceptedAnswers: ['giraffe'] },
            { id: 'o3', kind: 'text', points: 600, prompt: 'How many minutes are there in a full day?', answer: '1440', acceptedAnswers: ['1,440'] },
            { id: 'o4', kind: 'text', points: 800, prompt: 'Which is the only mammal capable of true, sustained flight?', answer: 'The bat', acceptedAnswers: ['bat', 'bats'], hostNote: 'Flying squirrels glide, they do not fly — do not accept.' },
          ],
        },
      ],
    }],
  },
}

export default assemblyShow
