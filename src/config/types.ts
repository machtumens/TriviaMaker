/**
 * ============================================================================
 * GAME SHOW ENGINE — COMPLETE CONFIGURATION SCHEMA
 * ============================================================================
 *
 * GOVERNING PRINCIPLE
 * -------------------
 *   Anything a host might want to CHANGE  ->  is DATA (lives in this schema).
 *   Anything that changes how the machine STEPS  ->  is a PLUGIN (see registry/).
 *
 * If you ever feel the urge to add `if (config.someSpecialCase)` to the core
 * engine, you have found a plugin seam, not a config flag. Add it to a registry.
 *
 * RESOLUTION ORDER (later wins, deep-merged):
 *   defaults -> preset -> event config -> round override -> live host override
 *
 * Every field below is optional at authoring time; `resolveConfig()` fills from
 * defaults. `GameShowConfig` is the *resolved* shape. Authors write `DeepPartial`.
 */

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** Anything referencing a registered plugin uses a string key, not an import. */
export type RegistryKey = string

// ============================================================================
// 1. DESIGN TOKENS — all visual customisation, no CSS editing required
// ============================================================================

export interface ThemeTokens {
  /** Emitted as CSS custom properties: --color-bg, --color-accent, ... */
  color: {
    bg: string
    bgElevated: string
    /** Optional full-bleed backdrop: image url, gradient, or video url. */
    backdrop?: string
    text: string
    textMuted: string
    accent: string
    accentText: string
    correct: string
    wrong: string
    /** Board tile states */
    tile: string
    tileHover: string
    tileConsumed: string
    tileText: string
    /** Overlay scrim for question modals */
    scrim: string
  }

  type: {
    /** Font family stacks. Load via `fonts` below. */
    display: string
    body: string
    mono: string
    /**
     * Base px at 1080p. The stage view scales everything off this.
     * Bump for large rooms — this is the single most important a11y knob.
     */
    baseSize: number
    /** Multipliers off baseSize. */
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
    /** Force uppercase on categories/tiles — classic game show look. */
    uppercaseCategories: boolean
  }

  /** Web fonts to inject. Self-host for offline events. */
  fonts: Array<{
    family: string
    /** Local path (offline-safe) or remote URL. */
    src: string
    weight?: number
    style?: 'normal' | 'italic'
  }>

  space: { unit: number; boardGap: number; screenPadding: number }
  radius: { tile: number; card: number; button: number; pill: number }
  shadow: { tile: string; modal: string; glow: string }

  /** Arbitrary extra CSS custom properties for plugin themes. */
  custom?: Record<string, string>
}

// ============================================================================
// 2. MOTION — every animation, individually tunable or globally off
// ============================================================================

export interface MotionConfig {
  /** Master switch. Also auto-disabled by prefers-reduced-motion unless forced. */
  enabled: boolean
  respectReducedMotion: boolean
  /** Global multiplier on every duration. 0.5 = twice as fast. */
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

  /** Named transition plugins. Registry: 'transition'. */
  transitions: {
    boardToQuestion: RegistryKey
    questionToAnswer: RegistryKey
    roundChange: RegistryKey
  }

  /** Celebratory effects. Registry: 'effect'. */
  effects: {
    onCorrect: RegistryKey | null
    onWrong: RegistryKey | null
    onBuzz: RegistryKey | null
    onRoundEnd: RegistryKey | null
    onGameEnd: RegistryKey | null
  }
}

// ============================================================================
// 3. SOUND — a game show is half audio
// ============================================================================

export interface SoundConfig {
  enabled: boolean
  masterVolume: number
  /** Duck music while these SFX play. */
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

  /**
   * Per-team buzz stingers, keyed by team id. Each team gets its own sound —
   * the audience learns who buzzed before they read the screen.
   */
  teamBuzzStingers: Record<string, SoundRef>
}

export interface SoundRef {
  src: string
  volume?: number
  loop?: boolean
  /** Preload before show start. Always true for anything used mid-show. */
  preload?: boolean
}

// ============================================================================
// 4. COPY — every user-visible string. Enables i18n and tone changes.
// ============================================================================

export interface CopyStrings {
  locale: string
  /** Template vars in {braces}: {team}, {points}, {code}, {n}. */
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
  /** Extra strings for plugins. */
  custom?: Record<string, string>
}

// ============================================================================
// 5. CONTENT
// ============================================================================

export type QuestionKind =
  | 'text'          // spoken answer, host judges
  | 'multipleChoice'
  | 'trueFalse'
  | 'numeric'       // closest wins, optional tolerance
  | 'ordering'      // arrange items
  | 'matching'
  | 'image'
  | 'audio'
  | 'video'
  | 'survey'        // Family Feud list
  | RegistryKey     // custom question type plugin

export interface MediaRef {
  kind: 'image' | 'audio' | 'video'
  src: string
  /** Reveal media before, with, or after the prompt text. */
  timing?: 'withPrompt' | 'afterPrompt' | 'onAnswer'
  /** Clip bounds for audio/video. */
  startSec?: number
  endSec?: number
  alt?: string
}

export interface Question {
  id: string
  kind: QuestionKind
  prompt: string
  /** Host-only. NEVER serialised to stage or player clients. */
  answer: string
  /** Alternates accepted by auto-grading. */
  acceptedAnswers?: string[]
  /** 0 = exact match, 1 = very loose. Used by auto-graded kinds only. */
  fuzzyTolerance?: number
  choices?: string[]
  correctChoiceIndex?: number
  /** For numeric kind. */
  numericAnswer?: number
  numericTolerance?: number
  /** For survey kind: ranked answers with counts. */
  surveyAnswers?: Array<{ text: string; count: number }>

  media?: MediaRef[]
  points?: number
  timeLimitSec?: number

  /** Host teleprompter note. Never displayed on stage. */
  hostNote?: string
  /** Shown on stage after the answer — the "fun fact" beat. */
  trivia?: string

  difficulty?: 1 | 2 | 3 | 4 | 5
  tags?: string[]
  /** Marks this tile as special. See SpecialTileRules. */
  special?: RegistryKey | null
  /** Per-question rule overrides — the deepest customisation layer. */
  overrides?: DeepPartial<RuleSet>
}

export interface Category {
  id: string
  title: string
  /** Optional per-category theming — coloured columns. */
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

// ============================================================================
// 6. GAME STYLES — board formats. Each is a plugin; config is discriminated.
// ============================================================================

export type StyleConfig =
  | GridStyle | WheelStyle | ListStyle | TicTacStyle
  | HangmanStyle | TriviaStyle | CustomStyle

export interface GridStyle {
  kind: 'grid'
  columns: number
  rows: number
  /** Point value per row. Length should equal rows. */
  pointLadder: number[]
  /** How the next question is chosen. */
  selection: 'freePick' | 'sequential' | 'random'
  showCategoryHeaders: boolean
  /** What a played tile looks like. */
  consumedStyle: 'dim' | 'blank' | 'checkmark' | 'remove'
  /** Reveal categories one at a time at round start for drama. */
  dramaticCategoryReveal: boolean
}

export interface WheelStyle {
  kind: 'wheel'
  segments: Array<{ label: string; weight: number; color?: string; categoryId?: string }>
  spinDurationMs: number
  /** Remove a segment once played. */
  consumeSegments: boolean
  /** Host can override where it lands. Useful; slightly evil. */
  allowHostRig: boolean
}

export interface ListStyle {
  kind: 'list'
  slots: number
  /** Strikes before the round passes to the other team. */
  strikesAllowed: number
  revealOrder: 'byRank' | 'asAnswered'
  showCounts: boolean
}

export interface TicTacStyle {
  kind: 'tictac'
  size: number
  winLength: number
  /** Wrong answer gives the square to the opponent. */
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
  /** Registry: 'style'. */
  plugin: RegistryKey
  options: Record<string, unknown>
}

// ============================================================================
// 7. RULES — the behavioural core. Every round can override any of this.
// ============================================================================

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
  /** Who picks the next question. */
  picker: 'host' | 'winnerOfLast' | 'rotation' | 'trailingTeam' | 'random'
  /** Who may attempt. 'buzz' = race; 'turnOwner' = only whoever's turn it is. */
  answerRights: 'buzz' | 'turnOwner' | 'allSimultaneous'
  /** Attempts per question before it dies. */
  maxAttempts: number
  allowPass: boolean
  /** Order teams play in turn-based modes. */
  rotationOrder: 'authored' | 'random' | 'byScoreAsc' | 'byScoreDesc'
}

export interface BuzzRules {
  enabled: boolean
  /**
   * 'arrival'      — rank by server receipt. Fair only on a shared LAN.
   * 'compensated'  — subtract measured half-RTT. Fair over mixed networks.
   * 'clientStamp'  — trust client clock. Fastest, spoofable.
   */
  arbitration: 'arrival' | 'compensated' | 'clientStamp'
  /**
   * Collect buzzes for this long after the FIRST one, then rank the whole set.
   * Without this you rank packets, not people. 150-250ms is imperceptible.
   */
  graceWindowMs: number
  /** How many ranked buzzers the host sees. Set >1 so humans resolve photo finishes. */
  surfaceTopN: number
  /** Below this gap, show "too close to call" and let the host decide. */
  photoFinishThresholdMs: number

  /** Buzzers only go live when the host arms them. Prevents pre-emptive mashing. */
  requireArming: boolean
  /** Auto-arm this long after the question appears. null = host must arm manually. */
  autoArmAfterMs: number | null

  falseStart: 'ignore' | 'lockoutQuestion' | 'lockoutMs' | 'penalty'
  falseStartLockoutMs: number
  falseStartPenalty: number

  /** After a wrong answer, can others buzz on the same question? */
  reopenAfterWrong: boolean
  /** Locked-out players can't buzz again on this question. */
  lockoutAfterWrong: boolean

  /** Input sources accepted. Multiple may be active at once. */
  inputs: InputConfig[]
}

export type InputConfig =
  | { kind: 'keyboard'; keyMap: Record<string, string> }   // key -> teamId
  | { kind: 'gamepad'; buttonMap: Record<number, string> }
  | { kind: 'network' }                                     // phones
  | { kind: 'serial'; port?: string; baudRate?: number }    // arduino buzzers
  | { kind: 'custom'; plugin: RegistryKey; options: Record<string, unknown> }

export interface TimerRules {
  /** Default per-question limit. Questions may override. null = untimed. */
  questionSec: number | null
  /** Time to answer AFTER buzzing in. */
  answerSec: number | null
  /** Time for a steal attempt. */
  stealSec: number | null
  /** Wager submission window. */
  wagerSec: number | null

  /** Visual style. Registry: 'timer'. */
  display: 'bar' | 'ring' | 'digits' | 'none' | RegistryKey
  warnAtSec: number
  /** Advance automatically when time expires, or wait for host. */
  autoAdvanceOnExpiry: boolean
  /** Host can pause. Essential — someone will need the bathroom mid-show. */
  hostCanPause: boolean
}

export interface WrongAnswerRules {
  /** Points lost. 0 = no penalty (kindest, recommended for school events). */
  penalty: number
  /** Penalty as a fraction of question value instead of flat. */
  penaltyIsProportional: boolean
  /** Can other teams take it? */
  allowSteal: boolean
  maxSteals: number
  /** Steal is worth this fraction of face value. */
  stealValueMultiplier: number
  /** Reveal the answer immediately after the final wrong attempt. */
  revealOnExhaustion: boolean
}

// ============================================================================
// 8. SCORING
// ============================================================================

export interface ScoringRules {
  /** Registry: 'scoring'. Built-ins below, or supply your own key. */
  engine: 'flat' | 'speedWeighted' | 'multiplier' | RegistryKey

  /** speedWeighted: floor as a fraction of base. 0.5 avoids "why 3 points?". */
  speedFloor: number
  /** Global multiplier — set to 2 on a round for "double points". */
  multiplier: number

  streak: {
    enabled: boolean
    /** Consecutive correct answers needed before bonus applies. */
    threshold: number
    /** Added per question once on a streak. */
    bonusPerQuestion: number
    /** Cap the bonus so streaks don't run away with the game. */
    maxBonus: number
    resetOnWrong: boolean
  }

  comeback: {
    /** Give trailing teams a boost. Keeps the room engaged when it's lopsided. */
    enabled: boolean
    /** Applies when a team is this far behind the leader. */
    deficitThreshold: number
    multiplier: number
  }

  wager: {
    enabled: boolean
    /** Cap wager at current score, a fixed number, or the round max. */
    maxRule: 'currentScore' | 'fixed' | 'roundMax'
    maxFixed: number
    /** Allow teams on <=0 to wager this much anyway. */
    minimumAllowance: number
    hiddenUntilReveal: boolean
  }

  /** Score visibility on the stage view. */
  visibility: 'always' | 'betweenQuestions' | 'betweenRounds' | 'finalOnly'
  /** Animate score changes by counting up. */
  animateChanges: boolean
  /** Allow negative totals. */
  allowNegative: boolean

  tieBreak: {
    /** In order. First rule that separates wins. */
    order: Array<'suddenDeath' | 'fewestWrong' | 'fastestAvgBuzz' | 'hostDecides' | 'shared'>
  }
}

// ============================================================================
// 9. LIFELINES & SPECIAL TILES
// ============================================================================

export interface LifelineRules {
  enabled: boolean
  /** Uses granted per team per game (or per round if perRound). */
  perRound: boolean
  available: Array<{
    /** Registry: 'lifeline'. Built-ins: fiftyFifty, askAudience, doubleDip,
     *  freezeOpponent, skipQuestion, phoneAFriend, extraTime. */
    plugin: RegistryKey
    uses: number
    label?: string
    icon?: string
    options?: Record<string, unknown>
  }>
}

export interface SpecialTileRules {
  enabled: boolean
  /** Registry: 'specialTile'. Attach to a Question via `special`. */
  types: Record<RegistryKey, {
    label: string
    color?: string
    icon?: string
    /** Hide until revealed — the Daily Double surprise. */
    hiddenUntilSelected: boolean
    options?: Record<string, unknown>
  }>
  /** Scatter n special tiles randomly instead of authoring them. */
  autoPlace: { enabled: boolean; count: number; types: RegistryKey[] }
}

// ============================================================================
// 10. TEAMS & PARTICIPANTS
// ============================================================================

export interface TeamConfig {
  /** Pre-authored teams. Leave empty to create them live in the lobby. */
  teams: Array<{
    id: string
    name: string
    color: string
    logo?: string
    avatar?: string
    /** Handicap: starting score. Useful for staff-vs-students. */
    startingScore?: number
  }>
  minTeams: number
  maxTeams: number
  /** Host can add/rename/recolour teams from the controller mid-game. */
  editableDuringGame: boolean

  membership: {
    /** How players end up on a team. */
    assignment: 'preassigned' | 'playerChoice' | 'autoBalance' | 'none'
    maxPerTeam: number | null
    /** Only the captain may buzz/answer for the team. */
    captainOnly: boolean
  }
}

export interface JoinConfig {
  /** 'none' = stage-only show, no player devices at all. */
  method: 'none' | 'code' | 'qr' | 'both' | 'preassigned'
  codeLength: number
  codeCharset: 'numeric' | 'alpha' | 'alphanumeric'
  /** Regenerate if a code leaks. */
  allowCodeRegeneration: boolean
  requireName: boolean
  nameMaxLength: number
  /** Players may join after the game has started. */
  allowLateJoin: boolean
  /** Auto-reconnect window before a disconnected player is dropped. */
  reconnectGraceSec: number
  maxPlayers: number
}

export interface ModerationConfig {
  profanityFilter: boolean
  /** Extra blocked substrings for names. */
  blocklist: string[]
  /** Host approves each name before it appears on the projector. */
  requireNameApproval: boolean
  allowKick: boolean
  allowRename: boolean
  /** Hide player names on stage entirely; show team names only. */
  hideNamesOnStage: boolean
}

// ============================================================================
// 11. ROUND PROGRAM — a show is a sequence of rounds, not one flat quiz
// ============================================================================

export interface Round {
  id: string
  title: string
  subtitle?: string
  /** Which content this round draws from. */
  bankId?: string
  categoryIds?: string[]
  /** Board format for this round. */
  style: StyleConfig
  /**
   * Deep overrides applied on top of the event-level config for this round only.
   * This is what lets Round 2 be "double points, buzzers only" and the Final be
   * "wager, no steal, 60 seconds" without any special-casing in the engine.
   */
  overrides?: DeepPartial<{
    rules: RuleSet
    theme: ThemeTokens
    motion: MotionConfig
    sound: SoundConfig
    copy: CopyStrings
  }>
  /** Full-screen title card before the round begins. */
  intro?: { enabled: boolean; durationMs: number; media?: MediaRef; text?: string }
  /** Break after this round — intermission slide. */
  intermissionAfter?: { enabled: boolean; text?: string; media?: MediaRef }
  /** Skip this round if fewer than n teams remain. */
  minTeams?: number
  /** Eliminate the lowest-scoring team after this round. */
  eliminateLowest?: boolean
}

export interface ProgramConfig {
  rounds: Round[]
  /** Show an overall scoreboard between rounds. */
  scoreboardBetweenRounds: boolean
  /** Carry scores forward, or reset each round. */
  carryScores: boolean
  finale: {
    style: 'podium' | 'scoreboard' | 'reveal' | RegistryKey
    /** Reveal places in reverse order for drama. */
    dramaticReveal: boolean
    showStats: boolean
  }
}

// ============================================================================
// 12. PRESENTATION & LAYOUT
// ============================================================================

export interface LayoutConfig {
  /** Target projector aspect. Letterboxed if the display differs. */
  aspect: '16:9' | '16:10' | '4:3' | 'fill'
  /** Inset for projector overscan. Older projectors crop the edges. */
  safeAreaPercent: number
  /** Registry: 'layout'. Swap the whole stage arrangement. */
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
    /** Sponsor/announcement strip. */
    lowerThird?: { enabled: boolean; text: string; media?: MediaRef }
  }
  /** Extra always-on-screen elements. Registry: 'widget'. */
  widgets: Array<{ plugin: RegistryKey; slot: string; options?: Record<string, unknown> }>
}

export interface AccessibilityConfig {
  /** Multiplies every font size. For large or difficult rooms. */
  fontScale: number
  highContrast: boolean
  /** Palette safe for deuteranopia/protanopia. Overrides team colours. */
  colorblindSafePalette: boolean
  /** Never rely on colour alone — add icons/patterns to team indicators. */
  redundantEncoding: boolean
  reduceMotion: boolean
  /** On-screen captions for audio questions. */
  captions: boolean
  /** Read questions aloud via speech synthesis. */
  screenReaderAnnouncements: boolean
  minTouchTargetPx: number
}

// ============================================================================
// 13. RUNTIME & OPERATIONS
// ============================================================================

export interface RuntimeConfig {
  /**
   * CRITICAL: the stage view must remain fully playable with zero players
   * connected. When true, the engine degrades to host-only control if the
   * network dies mid-show rather than blocking. Do not turn this off.
   */
  degradeToOfflineOnNetworkLoss: boolean

  /** Block the start until every media asset is cached. */
  preloadAllMedia: boolean
  /** Freeze content into the session at launch; ignore later edits to the bank. */
  snapshotContentAtLaunch: boolean

  persistence: {
    /** Survive a laptop crash mid-show. */
    autosave: boolean
    intervalMs: number
    /** 'memory' | 'localStorage' | 'file' | 'remote' */
    driver: string
    /** Resume an interrupted session by code. */
    allowResume: boolean
  }

  undo: {
    enabled: boolean
    depth: number
    /** Host can undo any awarded score, not just the last action. */
    allowArbitraryScoreEdit: boolean
  }

  transport: {
    /** Registry: 'transport'. 'local' | 'websocket' | 'durableObject' | 'supabase' | 'polling' */
    driver: RegistryKey
    options: Record<string, unknown>
    /** RTT sampling for compensated buzz arbitration. */
    pingIntervalMs: number
    pingSamples: number
  }

  /** Second screen output for streaming. */
  broadcast: {
    /** Transparent-background overlay route for OBS browser source. */
    obsOverlay: boolean
    overlayRoute: string
  }
}

// ============================================================================
// 14. INTEGRATION — hooks let you drive lights, OBS, Discord, anything
// ============================================================================

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
  /**
   * Subscribe registered handlers to engine events. Registry: 'handler'.
   * Built-ins: 'webhook', 'log', 'obsScene', 'serialOut'.
   */
  hooks: Array<{
    on: GameEventName | GameEventName[]
    plugin: RegistryKey
    options?: Record<string, unknown>
  }>
  /** Fire-and-forget HTTP POSTs on events. */
  webhooks: Array<{ on: GameEventName[]; url: string; headers?: Record<string, string> }>
}

// ============================================================================
// 15. ROOT
// ============================================================================

export interface GameShowConfig {
  /** Schema version — migrate old presets forward. */
  version: number
  meta: {
    id: string
    title: string
    subtitle?: string
    author?: string
    createdAt?: string
    notes?: string
  }

  /** Inherit from another preset by id, then apply this config on top. */
  extends?: string

  content: { banks: QuestionBank[] }
  program: ProgramConfig

  /** Event-level defaults. Rounds override these. */
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

  /** Namespace for plugin-specific config the core knows nothing about. */
  plugins?: Record<string, Record<string, unknown>>
}

/** What an author actually writes. Everything optional; defaults fill the rest. */
export type GameShowConfigInput = DeepPartial<GameShowConfig> & {
  meta: { id: string; title: string }
}
