import type { GameShowConfig } from './types'

export const DEFAULT_CONFIG: GameShowConfig = {
  version: 1,
  meta: { id: 'default', title: 'Untitled Game Show' },

  content: { banks: [] },

  program: {
    rounds: [],
    scoreboardBetweenRounds: true,
    carryScores: true,
    finale: { style: 'podium', dramaticReveal: true, showStats: true },
  },

  rules: {
    turn: {
      picker: 'host',
      answerRights: 'buzz',
      maxAttempts: 1,
      allowPass: false,
      rotationOrder: 'authored',
    },
    buzz: {
      enabled: true,
      arbitration: 'compensated',
      graceWindowMs: 200,
      surfaceTopN: 3,
      photoFinishThresholdMs: 30,
      requireArming: true,
      autoArmAfterMs: null,
      falseStart: 'ignore',
      falseStartLockoutMs: 1500,
      falseStartPenalty: 0,
      reopenAfterWrong: true,
      lockoutAfterWrong: true,
      inputs: [{ kind: 'network' }],
    },
    timer: {
      questionSec: 30,
      answerSec: 10,
      stealSec: 10,
      wagerSec: 30,
      display: 'bar',
      warnAtSec: 5,
      autoAdvanceOnExpiry: false,
      hostCanPause: true,
    },
    wrongAnswer: {
      penalty: 0,
      penaltyIsProportional: false,
      allowSteal: true,
      maxSteals: 1,
      stealValueMultiplier: 1,
      revealOnExhaustion: true,
    },
    scoring: {
      engine: 'flat',
      speedFloor: 0.5,
      multiplier: 1,
      streak: {
        enabled: false, threshold: 3, bonusPerQuestion: 50,
        maxBonus: 200, resetOnWrong: true,
      },
      comeback: { enabled: false, deficitThreshold: 500, multiplier: 1.5 },
      wager: {
        enabled: false, maxRule: 'currentScore', maxFixed: 1000,
        minimumAllowance: 100, hiddenUntilReveal: true,
      },
      visibility: 'always',
      animateChanges: true,
      allowNegative: false,
      tieBreak: { order: ['suddenDeath', 'fewestWrong', 'hostDecides'] },
    },
    lifelines: { enabled: false, perRound: false, available: [] },
    specialTiles: {
      enabled: false,
      types: {},
      autoPlace: { enabled: false, count: 1, types: [] },
    },
  },

  theme: {
    color: {
      bg: '#0b1020',
      bgElevated: '#151c34',
      text: '#f5f7ff',
      textMuted: '#93a0c4',
      accent: '#ffc53d',
      accentText: '#0b1020',
      correct: '#3ddc84',
      wrong: '#ff5c5c',
      tile: '#1b2547',
      tileHover: '#26325e',
      tileConsumed: '#12182c',
      tileText: '#ffc53d',
      scrim: 'rgba(4,8,20,0.88)',
    },
    type: {
      display: '"Bebas Neue", Impact, system-ui, sans-serif',
      body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      mono: 'ui-monospace, "SF Mono", Menlo, monospace',
      baseSize: 20,
      scale: {
        tile: 3.2, question: 3.6, answer: 3.0,
        category: 1.6, score: 2.0, timer: 2.4,
      },
      weightDisplay: 700,
      weightBody: 400,
      lineHeight: 1.25,
      letterSpacingDisplay: '0.02em',
      uppercaseCategories: true,
    },
    fonts: [],
    space: { unit: 8, boardGap: 10, screenPadding: 48 },
    radius: { tile: 10, card: 16, button: 10, pill: 999 },
    shadow: {
      tile: '0 4px 0 rgba(0,0,0,0.35)',
      modal: '0 24px 80px rgba(0,0,0,0.6)',
      glow: '0 0 40px rgba(255,197,61,0.35)',
    },
  },

  motion: {
    enabled: true,
    respectReducedMotion: true,
    speed: 1,
    durationsMs: {
      tileReveal: 320, questionEnter: 420, answerReveal: 300,
      scoreCount: 700, scoreboardReorder: 500,
      phaseTransition: 260, buzzFlash: 180,
    },
    easing: {
      standard: 'cubic-bezier(0.4,0,0.2,1)',
      enter: 'cubic-bezier(0.16,1,0.3,1)',
      exit: 'cubic-bezier(0.4,0,1,1)',
      bounce: 'cubic-bezier(0.34,1.56,0.64,1)',
    },
    transitions: {
      boardToQuestion: 'zoomFromTile',
      questionToAnswer: 'crossFade',
      roundChange: 'wipe',
    },
    effects: {
      onCorrect: 'confettiBurst',
      onWrong: 'screenShake',
      onBuzz: 'teamFlash',
      onRoundEnd: null,
      onGameEnd: 'confettiCannon',
    },
  },

  sound: {
    enabled: true,
    masterVolume: 0.8,
    duckMusicOnSfx: true,
    sfx: {
      tileSelect: null, questionReveal: null, buzz: null,
      correct: null, wrong: null, timerTick: null, timerWarning: null,
      timeUp: null, scoreUp: null, roundStart: null, gameEnd: null,
    },
    music: { lobby: null, board: null, thinking: null, final: null, credits: null },
    teamBuzzStingers: {},
  },

  copy: {
    locale: 'en',
    lobby: {
      title: '{title}',
      joinInstruction: 'Join at {url} with code',
      codeLabel: 'GAME CODE',
      waitingForPlayers: 'Waiting for players…',
      playersJoined: '{n} joined',
      startButton: 'Start Game',
    },
    board: {
      roundLabel: 'Round {n}: {title}',
      pickInstruction: '{team}, pick a question',
      allConsumed: 'Round complete!',
    },
    question: {
      forPoints: 'for {points}',
      armPrompt: 'Get ready…',
      buzzNow: 'BUZZ!',
      lockedBy: '{team} buzzed in!',
      timeRemaining: '{n}s',
      noBuzz: 'No one buzzed',
    },
    answer: { label: 'Answer', correctBanner: 'Correct!', wrongBanner: 'Incorrect' },
    scoreboard: { title: 'Scores', rank: '#', team: 'Team', score: 'Score' },
    final: {
      title: 'Final Scores', winner: '{team} wins!',
      tie: "It's a tie!", thanks: 'Thanks for playing!',
    },
    player: {
      joinTitle: 'Join the game',
      namePrompt: 'Your name',
      teamPrompt: 'Pick your team',
      buzzButton: 'BUZZ',
      buzzed: 'Buzzed! You were #{rank}',
      tooLate: 'Too late!',
      falseStart: 'Too early!',
      waiting: 'Wait for the question…',
      disconnected: 'Reconnecting…',
    },
    host: {
      arm: 'Arm Buzzers', reveal: 'Reveal Answer',
      correct: 'Correct', wrong: 'Wrong', skip: 'Skip',
      undo: 'Undo', next: 'Next', endRound: 'End Round',
    },
  },

  layout: {
    aspect: '16:9',
    safeAreaPercent: 3,
    stageLayout: 'classic',
    scoreboard: {
      position: 'bottom', style: 'bars',
      maxVisible: 8, showRankChange: true,
    },
    branding: { logoPosition: 'topRight', logoOpacity: 0.9 },
    widgets: [],
  },

  accessibility: {
    fontScale: 1,
    highContrast: false,
    colorblindSafePalette: false,
    redundantEncoding: true,
    reduceMotion: false,
    captions: true,
    screenReaderAnnouncements: false,
    minTouchTargetPx: 48,
  },

  teams: {
    teams: [],
    minTeams: 2,
    maxTeams: 8,
    editableDuringGame: true,
    membership: {
      assignment: 'playerChoice',
      maxPerTeam: null,
      captainOnly: false,
    },
  },

  join: {
    method: 'both',
    codeLength: 6,
    codeCharset: 'numeric',
    allowCodeRegeneration: true,
    requireName: true,
    nameMaxLength: 16,
    allowLateJoin: true,
    reconnectGraceSec: 60,
    maxPlayers: 200,
  },

  moderation: {
    profanityFilter: true,
    blocklist: [],
    requireNameApproval: false,
    allowKick: true,
    allowRename: true,
    hideNamesOnStage: false,
  },

  runtime: {
    degradeToOfflineOnNetworkLoss: true,
    preloadAllMedia: true,
    snapshotContentAtLaunch: true,
    persistence: {
      autosave: true, intervalMs: 5000,
      driver: 'localStorage', allowResume: true,
    },
    undo: { enabled: true, depth: 50, allowArbitraryScoreEdit: true },
    transport: {
      driver: 'local',
      options: {},
      pingIntervalMs: 3000,
      pingSamples: 5,
    },
    broadcast: { obsOverlay: false, overlayRoute: '/overlay' },
  },

  integration: { hooks: [], webhooks: [] },
}
