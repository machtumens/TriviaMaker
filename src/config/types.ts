export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type RegistryKey = string

export interface ThemeTokens {

  color: {
    bg: string
    bgElevated: string

    backdrop?: string
    text: string
    textMuted: string
    accent: string
    accentText: string
    correct: string
    wrong: string

    tile: string
    tileHover: string
    tileConsumed: string
    tileText: string

    scrim: string
  }

  type: {

    display: string
    body: string
    mono: string

    baseSize: number

    scale: {
      tile: number
      question: number
      answer: number
      category: number
      score: number
      timer: number
    }
    weightDisplay: number
    weightBody: number
    lineHeight: number
    letterSpacingDisplay: string

    uppercaseCategories: boolean
  }

  fonts: Array<{
    family: string

    src: string
    weight?: number
    style?: 'normal' | 'italic'
  }>

  space: { unit: number; boardGap: number; screenPadding: number }
  radius: { tile: number; card: number; button: number; pill: number }
  shadow: { tile: string; modal: string; glow: string }

  custom?: Record<string, string>
}

export interface MotionConfig {

  enabled: boolean
  respectReducedMotion: boolean

  speed: number

  durationsMs: {
    tileReveal: number
    questionEnter: number
    answerReveal: number
    scoreCount: number
    scoreboardReorder: number
    phaseTransition: number
    buzzFlash: number
  }

  easing: { standard: string; enter: string; exit: string; bounce: string }

  transitions: {
    boardToQuestion: RegistryKey
    questionToAnswer: RegistryKey
    roundChange: RegistryKey
  }

  effects: {
    onCorrect: RegistryKey | null
    onWrong: RegistryKey | null
    onBuzz: RegistryKey | null
    onRoundEnd: RegistryKey | null
    onGameEnd: RegistryKey | null
  }
}

export interface SoundConfig {
  enabled: boolean
  masterVolume: number

  duckMusicOnSfx: boolean

  sfx: {
    tileSelect: SoundRef | null
    questionReveal: SoundRef | null
    buzz: SoundRef | null
    correct: SoundRef | null
    wrong: SoundRef | null
    timerTick: SoundRef | null
    timerWarning: SoundRef | null
    timeUp: SoundRef | null
    scoreUp: SoundRef | null
    roundStart: SoundRef | null
    gameEnd: SoundRef | null
  }

  music: {
    lobby: SoundRef | null
    board: SoundRef | null
    thinking: SoundRef | null
    final: SoundRef | null
    credits: SoundRef | null
  }

  teamBuzzStingers: Record<string, SoundRef>
}

export interface SoundRef {
  src: string
  volume?: number
  loop?: boolean

  preload?: boolean
}

export interface CopyStrings {
  locale: string

  lobby: {
    title: string
    joinInstruction: string
    codeLabel: string
    waitingForPlayers: string
    playersJoined: string
    startButton: string
  }
  board: { roundLabel: string; pickInstruction: string; allConsumed: string }
  question: {
    forPoints: string
    armPrompt: string
    buzzNow: string
    lockedBy: string
    timeRemaining: string
    noBuzz: string
  }
  answer: { label: string; correctBanner: string; wrongBanner: string }
  scoreboard: { title: string; rank: string; team: string; score: string }
  final: { title: string; winner: string; tie: string; thanks: string }
  player: {
    joinTitle: string
    namePrompt: string
    teamPrompt: string
    buzzButton: string
    buzzed: string
    tooLate: string
    falseStart: string
    waiting: string
    disconnected: string
  }
  host: {
    arm: string; reveal: string; correct: string; wrong: string
    skip: string; undo: string; next: string; endRound: string
  }

  custom?: Record<string, string>
}

export type QuestionKind =
  | 'text'
  | 'multipleChoice'
  | 'trueFalse'
  | 'numeric'
  | 'ordering'
  | 'matching'
  | 'image'
  | 'audio'
  | 'video'
  | 'survey'
  | RegistryKey

export interface MediaRef {
  kind: 'image' | 'audio' | 'video'
  src: string

  timing?: 'withPrompt' | 'afterPrompt' | 'onAnswer'

  startSec?: number
  endSec?: number
  alt?: string
}

export interface Question {
  id: string
  kind: QuestionKind
  prompt: string

  answer: string

  acceptedAnswers?: string[]

  fuzzyTolerance?: number
  choices?: string[]
  correctChoiceIndex?: number

  numericAnswer?: number
  numericTolerance?: number

  surveyAnswers?: Array<{ text: string; count: number }>

  media?: MediaRef[]
  points?: number
  timeLimitSec?: number

  hostNote?: string

  trivia?: string

  difficulty?: 1 | 2 | 3 | 4 | 5
  tags?: string[]

  special?: RegistryKey | null

  overrides?: DeepPartial<RuleSet>
}

export interface Category {
  id: string
  title: string

  accent?: string
  icon?: string
  description?: string
  questions: Question[]
}

export interface QuestionBank {
  id: string
  title: string
  categories: Category[]
}

export type StyleConfig =
  | GridStyle | WheelStyle | ListStyle | TicTacStyle
  | HangmanStyle | TriviaStyle | CustomStyle

export interface GridStyle {
  kind: 'grid'
  columns: number
  rows: number

  pointLadder: number[]

  selection: 'freePick' | 'sequential' | 'random'
  showCategoryHeaders: boolean

  consumedStyle: 'dim' | 'blank' | 'checkmark' | 'remove'

  dramaticCategoryReveal: boolean
}

export interface WheelStyle {
  kind: 'wheel'
  segments: Array<{ label: string; weight: number; color?: string; categoryId?: string }>
  spinDurationMs: number

  consumeSegments: boolean

  allowHostRig: boolean
}

export interface ListStyle {
  kind: 'list'
  slots: number

  strikesAllowed: number
  revealOrder: 'byRank' | 'asAnswered'
  showCounts: boolean
}

export interface TicTacStyle {
  kind: 'tictac'
  size: number
  winLength: number

  stealSquareOnWrong: boolean
}

export interface HangmanStyle {
  kind: 'hangman'
  maxWrongLetters: number
  showCategoryHint: boolean
  allowWholeWordGuess: boolean
}

export interface TriviaStyle {
  kind: 'trivia'
  questionOrder: 'authored' | 'random' | 'byDifficulty'
  showChoicesOnPlayerDevice: boolean
  revealDistribution: boolean
}

export interface CustomStyle {
  kind: 'custom'

  plugin: RegistryKey
  options: Record<string, unknown>
}

export interface RuleSet {
  turn: TurnRules
  buzz: BuzzRules
  timer: TimerRules
  wrongAnswer: WrongAnswerRules
  scoring: ScoringRules
  lifelines: LifelineRules
  specialTiles: SpecialTileRules
}

export interface TurnRules {

  picker: 'host' | 'winnerOfLast' | 'rotation' | 'trailingTeam' | 'random'

  answerRights: 'buzz' | 'turnOwner' | 'allSimultaneous'

  maxAttempts: number
  allowPass: boolean

  rotationOrder: 'authored' | 'random' | 'byScoreAsc' | 'byScoreDesc'
}

export interface BuzzRules {
  enabled: boolean

  arbitration: 'arrival' | 'compensated' | 'clientStamp'

  graceWindowMs: number

  surfaceTopN: number

  photoFinishThresholdMs: number

  requireArming: boolean

  autoArmAfterMs: number | null

  falseStart: 'ignore' | 'lockoutQuestion' | 'lockoutMs' | 'penalty'
  falseStartLockoutMs: number
  falseStartPenalty: number

  reopenAfterWrong: boolean

  lockoutAfterWrong: boolean

  inputs: InputConfig[]
}

export type InputConfig =
  | { kind: 'keyboard'; keyMap: Record<string, string> }
  | { kind: 'gamepad'; buttonMap: Record<number, string> }
  | { kind: 'network' }
  | { kind: 'serial'; port?: string; baudRate?: number }
  | { kind: 'custom'; plugin: RegistryKey; options: Record<string, unknown> }

export interface TimerRules {

  questionSec: number | null

  answerSec: number | null

  stealSec: number | null

  wagerSec: number | null

  display: 'bar' | 'ring' | 'digits' | 'none' | RegistryKey
  warnAtSec: number

  autoAdvanceOnExpiry: boolean

  hostCanPause: boolean
}

export interface WrongAnswerRules {

  penalty: number

  penaltyIsProportional: boolean

  allowSteal: boolean
  maxSteals: number

  stealValueMultiplier: number

  revealOnExhaustion: boolean
}

export interface ScoringRules {

  engine: 'flat' | 'speedWeighted' | 'multiplier' | RegistryKey

  speedFloor: number

  multiplier: number

  streak: {
    enabled: boolean

    threshold: number

    bonusPerQuestion: number

    maxBonus: number
    resetOnWrong: boolean
  }

  comeback: {

    enabled: boolean

    deficitThreshold: number
    multiplier: number
  }

  wager: {
    enabled: boolean

    maxRule: 'currentScore' | 'fixed' | 'roundMax'
    maxFixed: number

    minimumAllowance: number
    hiddenUntilReveal: boolean
  }

  visibility: 'always' | 'betweenQuestions' | 'betweenRounds' | 'finalOnly'

  animateChanges: boolean

  allowNegative: boolean

  tieBreak: {

    order: Array<'suddenDeath' | 'fewestWrong' | 'fastestAvgBuzz' | 'hostDecides' | 'shared'>
  }
}

export interface LifelineRules {
  enabled: boolean

  perRound: boolean
  available: Array<{

    plugin: RegistryKey
    uses: number
    label?: string
    icon?: string
    options?: Record<string, unknown>
  }>
}

export interface SpecialTileRules {
  enabled: boolean

  types: Record<RegistryKey, {
    label: string
    color?: string
    icon?: string

    hiddenUntilSelected: boolean
    options?: Record<string, unknown>
  }>

  autoPlace: { enabled: boolean; count: number; types: RegistryKey[] }
}

export interface TeamConfig {

  teams: Array<{
    id: string
    name: string
    color: string
    logo?: string
    avatar?: string

    startingScore?: number
  }>
  minTeams: number
  maxTeams: number

  editableDuringGame: boolean

  membership: {

    assignment: 'preassigned' | 'playerChoice' | 'autoBalance' | 'none'
    maxPerTeam: number | null

    captainOnly: boolean
  }
}

export interface JoinConfig {

  method: 'none' | 'code' | 'qr' | 'both' | 'preassigned'
  codeLength: number
  codeCharset: 'numeric' | 'alpha' | 'alphanumeric'

  allowCodeRegeneration: boolean
  requireName: boolean
  nameMaxLength: number

  allowLateJoin: boolean

  reconnectGraceSec: number
  maxPlayers: number
}

export interface ModerationConfig {
  profanityFilter: boolean

  blocklist: string[]

  requireNameApproval: boolean
  allowKick: boolean
  allowRename: boolean

  hideNamesOnStage: boolean
}

export interface Round {
  id: string
  title: string
  subtitle?: string

  bankId?: string
  categoryIds?: string[]

  style: StyleConfig

  overrides?: DeepPartial<{
    rules: RuleSet
    theme: ThemeTokens
    motion: MotionConfig
    sound: SoundConfig
    copy: CopyStrings
  }>

  intro?: { enabled: boolean; durationMs: number; media?: MediaRef; text?: string }

  intermissionAfter?: { enabled: boolean; text?: string; media?: MediaRef }

  minTeams?: number

  eliminateLowest?: boolean
}

export interface ProgramConfig {
  rounds: Round[]

  scoreboardBetweenRounds: boolean

  carryScores: boolean
  finale: {
    style: 'podium' | 'scoreboard' | 'reveal' | RegistryKey

    dramaticReveal: boolean
    showStats: boolean
  }
}

export interface LayoutConfig {

  aspect: '16:9' | '16:10' | '4:3' | 'fill'

  safeAreaPercent: number

  stageLayout: RegistryKey
  scoreboard: {
    position: 'bottom' | 'right' | 'overlay' | 'hidden'
    style: 'bars' | 'table' | 'cards' | 'podium' | RegistryKey
    maxVisible: number
    showRankChange: boolean
  }
  branding: {
    logo?: string
    logoPosition: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'none'
    logoOpacity: number
    watermark?: string

    lowerThird?: { enabled: boolean; text: string; media?: MediaRef }
  }

  widgets: Array<{ plugin: RegistryKey; slot: string; options?: Record<string, unknown> }>
}

export interface AccessibilityConfig {

  fontScale: number
  highContrast: boolean

  colorblindSafePalette: boolean

  redundantEncoding: boolean
  reduceMotion: boolean

  captions: boolean

  screenReaderAnnouncements: boolean
  minTouchTargetPx: number
}

export interface RuntimeConfig {

  degradeToOfflineOnNetworkLoss: boolean

  preloadAllMedia: boolean

  snapshotContentAtLaunch: boolean

  persistence: {

    autosave: boolean
    intervalMs: number

    driver: string

    allowResume: boolean
  }

  undo: {
    enabled: boolean
    depth: number

    allowArbitraryScoreEdit: boolean
  }

  transport: {

    driver: RegistryKey
    options: Record<string, unknown>

    pingIntervalMs: number
    pingSamples: number
  }

  broadcast: {

    obsOverlay: boolean
    overlayRoute: string
  }
}

export type GameEventName =
  | 'session.created' | 'session.started' | 'session.ended'
  | 'player.joined' | 'player.left' | 'player.kicked'
  | 'round.started' | 'round.ended'
  | 'question.selected' | 'question.armed' | 'question.revealed'
  | 'buzz.received' | 'buzz.locked'
  | 'answer.correct' | 'answer.wrong' | 'answer.timeout'
  | 'score.changed' | 'lifeline.used'
  | 'phase.changed'

export interface IntegrationConfig {

  hooks: Array<{
    on: GameEventName | GameEventName[]
    plugin: RegistryKey
    options?: Record<string, unknown>
  }>

  webhooks: Array<{ on: GameEventName[]; url: string; headers?: Record<string, string> }>
}

export interface GameShowConfig {

  version: number
  meta: {
    id: string
    title: string
    subtitle?: string
    author?: string
    createdAt?: string
    notes?: string
  }

  extends?: string

  content: { banks: QuestionBank[] }
  program: ProgramConfig

  rules: RuleSet
  theme: ThemeTokens
  motion: MotionConfig
  sound: SoundConfig
  copy: CopyStrings
  layout: LayoutConfig
  accessibility: AccessibilityConfig

  teams: TeamConfig
  join: JoinConfig
  moderation: ModerationConfig

  runtime: RuntimeConfig
  integration: IntegrationConfig

  plugins?: Record<string, Record<string, unknown>>
}

export type GameShowConfigInput = DeepPartial<GameShowConfig> & {
  meta: { id: string; title: string }
}
