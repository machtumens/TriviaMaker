import type { GameShowConfig } from './types'

export const DEFAULT_CONFIG: GameShowConfig = {
  version: 1,
  meta: { id: 'default', title: 'Untitled Game Show' },

  content: { banks: [] },

  program: { rounds: [], carryScores: true },

  rules: {
    timer: { questionSec: 30, hostCanPause: true },
    wrongAnswer: { penalty: 0, penaltyIsProportional: false },
    scoring: { engine: 'flat', multiplier: 1 },
  },

  theme: {
    color: {
      bg: '#0b1020',
      bgElevated: '#151c34',
      text: '#f5f7ff',
      textMuted: '#93a0c4',
      accent: '#ffc53d',
      correct: '#3ddc84',
      wrong: '#ff5c5c',
      tile: '#1b2547',
      tileConsumed: '#12182c',
      tileText: '#ffc53d',
      scrim: 'rgba(4,8,20,0.88)',
    },
    type: {
      display: '"Bebas Neue", Impact, system-ui, sans-serif',
      body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      baseSize: 20,
      scale: { tile: 3.2, question: 3.6, category: 1.6, score: 2.0 },
      uppercaseCategories: true,
    },
    space: { boardGap: 10, screenPadding: 48 },
    radius: { tile: 10, card: 16, pill: 999 },
    shadow: { tile: '0 4px 0 rgba(0,0,0,0.35)' },
  },

  motion: {
    enabled: true,
    respectReducedMotion: true,
    speed: 1,
    durationsMs: {
      questionEnter: 420, answerReveal: 300,
      scoreCount: 700, phaseTransition: 260, buzzFlash: 180,
    },
    easing: {
      enter: 'cubic-bezier(0.16,1,0.3,1)',
      bounce: 'cubic-bezier(0.34,1.56,0.64,1)',
    },
  },

  copy: {
    question: { forPoints: 'for {points}' },
    host: {
      arm: 'Arm Buzzers', correct: 'Correct', wrong: 'Wrong', noAnswer: 'No Answer',
      skip: 'Skip', next: 'Next', endRound: 'End Round',
    },
  },

  layout: { stageLayout: 'classic' },

  teams: { teams: [] },

  runtime: {
    undoDepth: 50,
    transport: { driver: 'local', options: {} },
  },
}
