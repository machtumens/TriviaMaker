export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type RegistryKey = string

/**
 * Every token here is read by the stage or the host. Themes reach the browser as
 * CSS custom properties (config/resolve.ts walks colour, type, space, radius and
 * shadow), so adding a token means adding the CSS that uses it. Anything a
 * project needs beyond these goes in `custom`.
 */
export interface ThemeTokens {
  color: {
    bg: string
    bgElevated: string
    text: string
    textMuted: string
    accent: string
    correct: string
    wrong: string
    tile: string
    tileConsumed: string
    tileText: string
    scrim: string
  }

  type: {
    display: string
    body: string

    /** Every font size on the projector is a multiple of this. */
    baseSize: number
    scale: { tile: number; question: number; category: number; score: number }
    uppercaseCategories: boolean
  }

  space: { boardGap: number; screenPadding: number }
  radius: { tile: number; card: number; pill: number }
  shadow: { tile: string }

  custom?: Record<string, string>
}

export interface MotionConfig {
  enabled: boolean
  respectReducedMotion: boolean

  /** Divides every duration below: under 1 is slower. */
  speed: number

  durationsMs: {
    questionEnter: number
    answerReveal: number
    scoreCount: number
    phaseTransition: number
    buzzFlash: number
  }

  easing: { enter: string; bounce: string }
}

/** The few strings the host and stage render from config rather than markup. */
export interface CopyStrings {
  question: { forPoints: string }
  host: {
    arm: string
    correct: string
    wrong: string
    skip: string
    next: string
    endRound: string
  }
}

export type QuestionKind = 'text' | 'survey'

export interface Question {
  id: string
  kind: QuestionKind
  prompt: string

  /** Empty on a survey question — its answers live in `surveyAnswers`. */
  answer: string

  acceptedAnswers?: string[]

  /** Survey questions only: the slots, highest value first. */
  surveyAnswers?: Array<{ text: string; count: number }>

  points?: number

  /** Host-only. Never broadcast to the projector. */
  hostNote?: string

  overrides?: DeepPartial<RuleSet>
}

export interface Category {
  id: string
  title: string
  questions: Question[]
}

export interface QuestionBank {
  id: string
  title: string
  categories: Category[]
}

export type StyleConfig = GridStyle | ListStyle | CustomStyle

/** Jeopardy-style board: categories across, point tiles down. */
export interface GridStyle {
  kind: 'grid'
  columns: number
  rows: number
  pointLadder: number[]
  showCategoryHeaders: boolean
}

/** Family Feud board: one survey question, its answers in hidden slots. */
export interface ListStyle {
  kind: 'list'

  /** The cap, not the count — a question with four answers shows four slots. */
  slots: number
  strikesAllowed: number
  showCounts: boolean
}

/** A board format registered as a style plugin. */
export interface CustomStyle {
  kind: 'custom'
  plugin: RegistryKey
  options: Record<string, unknown>
}

export interface RuleSet {
  timer: TimerRules
  wrongAnswer: WrongAnswerRules
  scoring: ScoringRules
}

export interface TimerRules {
  /** null runs the question without a clock. */
  questionSec: number | null
  hostCanPause: boolean
}

export interface WrongAnswerRules {
  penalty: number

  /** Charge the question's own value instead of the flat `penalty`. */
  penaltyIsProportional: boolean
}

export interface ScoringRules {
  engine: RegistryKey
  multiplier: number
}

export interface TeamConfig {
  teams: Array<{
    id: string
    name: string
    color: string
    startingScore?: number
  }>
}

export interface Round {
  id: string

  /** The two corners of the projector, shown exactly as written. */
  title: string
  subtitle?: string

  bankId?: string
  categoryIds?: string[]

  style: StyleConfig

  overrides?: DeepPartial<{
    rules: RuleSet
    theme: ThemeTokens
    motion: MotionConfig
    copy: CopyStrings
  }>

  intro?: { enabled: boolean; durationMs: number; text?: string }
  intermissionAfter?: { enabled: boolean; text?: string }

  /**
   * Only these teams take part in this round. Everyone else sits it out: they
   * cannot be awarded points and they are not on the projector's scoreboard.
   * Elimination at the end of the round applies inside this list only, which is
   * what makes heats possible — four groups play, one survives, the twelve who
   * have not played yet are untouched.
   *
   * Omitted means every team still in the show plays.
   */
  teamIds?: string[]

  /** Skip this round unless at least this many teams are still in. */
  minTeams?: number
  eliminateLowest?: boolean

  /**
   * Only the top N scores continue past this round; everyone else is out. A tie
   * on the line advances every team holding it, so the field can stay larger
   * than N rather than the engine picking a loser on the host's behalf.
   *
   * Scores decide it, not pairings — the engine never matches two teams against
   * each other.
   */
  advanceTop?: number
}

export interface ProgramConfig {
  rounds: Round[]
  carryScores: boolean
}

export interface LayoutConfig {
  stageLayout: RegistryKey
}

export interface RuntimeConfig {
  /** How many actions back the host's Undo can reach. */
  undoDepth: number
  transport: { driver: RegistryKey; options: Record<string, unknown> }
}

export type GameEventName =
  | 'round.started' | 'round.ended'
  | 'question.selected' | 'question.armed' | 'question.revealed'
  | 'score.changed'
  | 'phase.changed'

export interface GameShowConfig {
  version: number
  meta: { id: string; title: string; subtitle?: string }

  extends?: string

  content: { banks: QuestionBank[] }
  program: ProgramConfig

  rules: RuleSet
  theme: ThemeTokens
  motion: MotionConfig
  copy: CopyStrings
  layout: LayoutConfig
  teams: TeamConfig
  runtime: RuntimeConfig

  plugins?: Record<string, Record<string, unknown>>
}

export type GameShowConfigInput = DeepPartial<GameShowConfig> & {
  meta: { id: string; title: string }
}
