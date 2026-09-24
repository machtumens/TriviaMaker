import type {
  Category, CopyStrings, DeepPartial, GameShowConfigInput, MotionConfig, Question,
  QuestionBank, Round, RuleSet, StyleConfig,
} from '../config/types'

/**
 * The Studio draft: everything the customise screen can change, in the shape the
 * screen edits it. It is deliberately NOT a GameShowConfig — a draft holds both
 * board formats per round at once so switching between them does not throw away
 * work, and it flattens the parts of the schema a host would otherwise have to
 * learn (nested theme groups, easing curves, per-round override objects).
 *
 * draftToConfig() is the only bridge. Nothing else in the app reads a draft.
 */

export const STORAGE_KEY = 'triviamaker.studio'

export type BoardFormat = 'feud' | 'quiz'

/** Per round: inherit the show clock, run without one, or set your own. */
export type ClockMode = 'show' | 'off' | 'custom'

/**
 * What the end of a round does to the field.
 *
 *   all    — everybody carries on
 *   lowest — the single lowest score is out
 *   top    — only the top N continue (a tie on the line advances both)
 *
 * Scores decide all of it. The engine never pairs two teams against each other,
 * so a "bracket" here is a survival bracket, not a draw sheet.
 */
export type AdvanceMode = 'all' | 'lowest' | 'top'

export interface DraftTeam {
  name: string
  color: string
  startingScore: number
}

export interface FeudQuestion {
  prompt: string
  answers: Array<{ text: string; count: number }>
}

export interface QuizCategory {
  title: string
  questions: Array<{ prompt: string; answer: string; accept: string; note: string }>
}

export interface DraftRound {
  id: string

  /** What the Studio calls it. The projector never sees this. */
  name: string

  /** The two corners of the projector. Empty title falls back to the show title. */
  title: string
  subtitle: string

  format: BoardFormat

  clockMode: ClockMode
  clockSec: number

  introText: string
  introMs: number

  /** Empty means the show runs straight into the next round. */
  intermissionText: string

  /**
   * Which teams play this round, by position (`t1` is the first team on the
   * Teams tab). Empty means everyone still in. Set the team list before the
   * rosters — the ids are positional, so deleting a team shifts them.
   */
  teamIds: string[]

  /** What happens to the field when this round ends. */
  advance: AdvanceMode

  /** With advance: 'top', how many teams carry on. */
  advanceTop: number

  /** Skip the round unless this many teams are still in. 0 means always play it. */
  minTeams: number

  feud: {
    strikesAllowed: number
    showCounts: boolean
    questions: FeudQuestion[]
  }

  quiz: {
    pointLadder: number[]
    categories: QuizCategory[]
  }
}

export interface DraftLook {
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

  /** How far the question card dims the board behind it, 0–100. */
  scrimOpacity: number

  display: string
  body: string
  baseSize: number
  uppercaseCategories: boolean

  scaleTile: number
  scaleQuestion: number
  scaleCategory: number
  scaleScore: number

  boardGap: number
  screenPadding: number

  radiusTile: number
  radiusCard: number
  radiusPill: number

  shadow: ShadowKey
}

export interface DraftMotion {
  enabled: boolean
  respectReducedMotion: boolean
  speed: number
  questionEnter: number
  answerReveal: number
  scoreCount: number
  phaseTransition: number
  buzzFlash: number
  easing: EasingKey
}

export interface DraftCopy {
  forPoints: string
  arm: string
  correct: string
  wrong: string
  skip: string
  next: string
  endRound: string
}

export interface Draft {
  title: string
  subtitle: string

  teams: DraftTeam[]
  carryScores: boolean

  timerSec: number | null
  hostCanPause: boolean
  penalty: number
  penaltyIsProportional: boolean
  multiplier: number
  undoDepth: number

  look: DraftLook
  motion: DraftMotion
  copy: DraftCopy

  rounds: DraftRound[]
}

/** Sixteen distinguishable colours, reused for however many teams a show has. */
export const TEAM_COLORS = [
  '#e8453c', '#3b7ddd', '#42d392', '#f5c518',
  '#a855f7', '#f97316', '#14b8a6', '#ec4899',
  '#84cc16', '#06b6d4', '#8b5cf6', '#ef4444',
  '#22c55e', '#eab308', '#6366f1', '#f43f5e',
]

export const FONT_CHOICES = [
  { label: 'Condensed (Bebas)', value: '"Bebas Neue", Impact, system-ui, sans-serif' },
  { label: 'Heavy (Impact)', value: 'Impact, Haettenschweiler, system-ui, sans-serif' },
  { label: 'System sans', value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
]

export type ShadowKey = 'none' | 'soft' | 'hard' | 'glow'

export const SHADOWS: Record<ShadowKey, string> = {
  none: 'none',
  soft: '0 6px 18px rgba(0,0,0,0.30)',
  hard: '0 4px 0 rgba(0,0,0,0.35)',
  glow: '0 0 22px rgba(255,255,255,0.14)',
}

export type EasingKey = 'smooth' | 'bouncy' | 'even'

export const EASINGS: Record<EasingKey, { enter: string; bounce: string }> = {
  smooth: { enter: 'cubic-bezier(0.16,1,0.3,1)', bounce: 'cubic-bezier(0.34,1.56,0.64,1)' },
  bouncy: { enter: 'cubic-bezier(0.34,1.56,0.64,1)', bounce: 'cubic-bezier(0.68,-0.6,0.32,1.6)' },
  even: { enter: 'ease-in-out', bounce: 'ease-in-out' },
}

export const PALETTES: Array<{ name: string; look: Partial<DraftLook> }> = [
  {
    name: 'Midnight',
    look: {
      bg: '#0b1020', bgElevated: '#151c34', text: '#f5f7ff', textMuted: '#93a0c4',
      accent: '#ffc53d', tile: '#1b2547', tileConsumed: '#12182c', tileText: '#ffc53d',
      correct: '#3ddc84', wrong: '#ff5c5c',
    },
  },
  {
    name: 'Studio gold',
    look: {
      bg: '#101010', bgElevated: '#1c1a16', text: '#fffaf0', textMuted: '#b3a894',
      accent: '#f5c518', tile: '#26221a', tileConsumed: '#171512', tileText: '#f5c518',
      correct: '#7ddc4f', wrong: '#ff6b4a',
    },
  },
  {
    name: 'Deep teal',
    look: {
      bg: '#04262b', bgElevated: '#0a3940', text: '#f0fdfa', textMuted: '#7fb8b6',
      accent: '#34e0c0', tile: '#0d474f', tileConsumed: '#07333a', tileText: '#34e0c0',
      correct: '#5ef0a8', wrong: '#ff7a7a',
    },
  },
  {
    name: 'Bright hall',
    look: {
      bg: '#f4f5f7', bgElevated: '#ffffff', text: '#12151b', textMuted: '#5d6672',
      accent: '#2f5fe0', tile: '#e6eaf2', tileConsumed: '#f0f2f6', tileText: '#20386f',
      correct: '#12784a', wrong: '#b4232a',
    },
  },
  {
    name: 'Hot pink',
    look: {
      bg: '#1a0722', bgElevated: '#2b0f38', text: '#fdf2ff', textMuted: '#c39ad2',
      accent: '#ff4fa3', tile: '#3a1449', tileConsumed: '#240c2e', tileText: '#ffd6ec',
      correct: '#4fe0a8', wrong: '#ff5c5c',
    },
  },
]

export function defaultLook(): DraftLook {
  return {
    ...(PALETTES[0]!.look as Required<Pick<DraftLook,
      'bg' | 'bgElevated' | 'text' | 'textMuted' | 'accent' | 'correct' | 'wrong'
      | 'tile' | 'tileConsumed' | 'tileText'>>),
    scrimOpacity: 88,
    display: FONT_CHOICES[0]!.value,
    body: FONT_CHOICES[2]!.value,
    baseSize: 20,
    uppercaseCategories: true,
    scaleTile: 3.2,
    scaleQuestion: 3.6,
    scaleCategory: 1.6,
    scaleScore: 2,
    boardGap: 10,
    screenPadding: 48,
    radiusTile: 10,
    radiusCard: 16,
    radiusPill: 999,
    shadow: 'hard',
  }
}

export function defaultMotion(): DraftMotion {
  return {
    enabled: true,
    respectReducedMotion: true,
    speed: 1,
    questionEnter: 420,
    answerReveal: 300,
    scoreCount: 700,
    phaseTransition: 260,
    buzzFlash: 180,
    easing: 'smooth',
  }
}

export function defaultCopy(): DraftCopy {
  return {
    forPoints: 'for {points}',
    arm: 'Arm Buzzers',
    correct: 'Correct',
    wrong: 'Wrong',
    skip: 'Skip',
    next: 'Next',
    endRound: 'End Round',
  }
}

export const HEAT_COUNT = 4
export const TEAMS_PER_HEAT = 4

export function newRound(index: number, format: BoardFormat = 'feud'): DraftRound {
  return {
    id: `r${index + 1}`,
    name: `Round ${index + 1}`,
    title: '',
    subtitle: '',
    format,
    clockMode: 'show',
    clockSec: 60,
    introText: '',
    introMs: 2500,
    intermissionText: '',
    teamIds: [],
    advance: 'all',
    advanceTop: 2,
    minTeams: 0,
    feud: { strikesAllowed: 3, showCounts: true, questions: [] },
    quiz: { pointLadder: [100, 200, 300, 400], categories: [] },
  }
}

/**
 * The default show is the one this was built for: sixteen groups, four heats of
 * four, and a final between the four heat winners.
 *
 * Each heat plays its own groups (`teamIds`) and sends exactly one of them on
 * (`advance: 'top'`, one team). The final names nobody — by then the only teams
 * left in the show ARE the four winners. Scores do not carry, so every heat and
 * the final each start level.
 */
export function heatRounds(teamCount: number, heats = HEAT_COUNT): DraftRound[] {
  const perHeat = Math.max(1, Math.ceil(teamCount / heats))
  const rounds: DraftRound[] = []

  for (let index = 0; index < heats; index++) {
    const heat = newRound(index, 'feud')
    heat.name = `Heat ${index + 1}`
    heat.introText = `Heat ${index + 1}`
    heat.teamIds = []
    for (let seat = index * perHeat; seat < Math.min((index + 1) * perHeat, teamCount); seat++) {
      heat.teamIds.push(`t${seat + 1}`)
    }
    heat.advance = 'top'
    heat.advanceTop = 1
    rounds.push(heat)
  }

  const lastHeat = rounds[rounds.length - 1]
  if (lastHeat) lastHeat.intermissionText = 'Grand Final next'

  const final = newRound(heats, 'feud')
  final.name = 'Final'
  final.introText = 'Grand Final'
  // The final names nobody: by the time it runs, the only teams left in the show
  // are the heat winners.
  final.teamIds = []
  final.advance = 'all'
  rounds.push(final)

  return rounds
}

/**
 * Redraws which groups are in which heat, at random.
 *
 * Only rounds that already name a roster are redrawn, and each keeps the number
 * of groups it had — this shuffles the draw, it does not change the shape of the
 * show. The final, which names nobody, is untouched.
 *
 * The draw is made here and then saved, not rolled again at showtime: it has to
 * be the same list on the laptop, on the projector and on the paper you read it
 * off, and a group has to be able to see it before the show starts.
 */
export function shuffleHeats(draft: Draft, random: () => number = Math.random): Draft {
  const rostered = draft.rounds.filter(round => round.teamIds.length > 0)
  if (rostered.length === 0) return draft

  const pool = draft.teams.map((_team, index) => `t${index + 1}`)
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const held = pool[index]!
    pool[index] = pool[swap]!
    pool[swap] = held
  }

  let cursor = 0
  for (const round of rostered) {
    const size = round.teamIds.length
    round.teamIds = pool.slice(cursor, cursor + size)
    cursor += size
  }

  return draft
}

/**
 * Rebuilds an existing show into the heats-and-final shape, keeping its teams,
 * look and wording, and re-dealing every survey question it already had so none
 * is used twice.
 */
export function applyHeatsAndFinal(draft: Draft): Draft {
  const pool = draft.rounds.flatMap(round => round.feud.questions)
  draft.rounds = heatRounds(draft.teams.length)
  draft.carryScores = false
  shuffleHeats(draft)
  return dealQuestions(draft, pool)
}

export function heatsAndFinalDraft(): Draft {
  const teams = makeTeams(HEAT_COUNT * TEAMS_PER_HEAT)

  return {
    title: 'GLUE',
    subtitle: 'Family Feud',
    teams,
    // Every heat and the final start level: a heat winner does not carry the
    // points they beat their own group with into a different contest.
    carryScores: false,
    timerSec: 60,
    hostCanPause: true,
    penalty: 0,
    penaltyIsProportional: false,
    multiplier: 1,
    undoDepth: 50,
    look: defaultLook(),
    motion: defaultMotion(),
    copy: defaultCopy(),
    rounds: heatRounds(teams.length),
  }
}

export function defaultDraft(): Draft {
  return heatsAndFinalDraft()
}

export function makeTeams(count: number, existing: readonly DraftTeam[] = []): DraftTeam[] {
  const teams: DraftTeam[] = []
  for (let index = 0; index < count; index++) {
    const kept = existing[index]
    teams.push(kept ?? {
      name: `Group ${index + 1}`,
      color: TEAM_COLORS[index % TEAM_COLORS.length]!,
      startingScore: 0,
    })
  }
  return teams
}

export function blankQuizQuestions(count: number): QuizCategory['questions'] {
  const rows: QuizCategory['questions'] = []
  for (let index = 0; index < count; index++) {
    rows.push({ prompt: '', answer: '', accept: '', note: '' })
  }
  return rows
}

export function ladderOfLength(rows: number): number[] {
  const ladder: number[] = []
  for (let row = 0; row < rows; row++) ladder.push((row + 1) * 100)
  return ladder
}

/** #rrggbb plus an opacity percentage, for the scrim behind an open question. */
export function hexToRgba(hex: string, percent: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  const alpha = Math.min(1, Math.max(0, percent / 100))
  if (!match) return `rgba(0,0,0,${alpha})`
  const value = Number.parseInt(match[1]!, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red},${green},${blue},${alpha})`
}

// ------------------------------------------------------------ draft → config

/** Trailing blank rows are scaffolding in the editor; they never reach a board. */
function filledQuizQuestions(category: QuizCategory): QuizCategory['questions'] {
  return category.questions.filter(row => row.prompt.trim() !== '')
}

function feudCategories(round: DraftRound): Category[] {
  const questions: Question[] = round.feud.questions
    .filter(question => question.prompt.trim() !== '')
    .map((question, index) => {
      const answers = question.answers.filter(answer => answer.text.trim() !== '')
      return {
        id: `${round.id}q${index + 1}`,
        kind: 'survey' as const,
        prompt: question.prompt.trim(),
        answer: '',
        surveyAnswers: answers.map(answer => ({ text: answer.text.trim(), count: answer.count })),
      }
    })

  return [{ id: `${round.id}main`, title: round.name, questions }]
}

function quizCategories(round: DraftRound): Category[] {
  return round.quiz.categories.map((category, index) => {
    const id = `${round.id}c${index + 1}`
    const questions: Question[] = filledQuizQuestions(category).map((row, rowIndex) => {
      const accepted = row.accept.split('|').map(text => text.trim()).filter(text => text !== '')
      const question: Question = {
        id: `${id}q${rowIndex + 1}`,
        kind: 'text',
        prompt: row.prompt.trim(),
        answer: row.answer.trim(),
      }
      // Points come from the round's ladder (config/packet.ts stampLadderPoints),
      // so the row a question sits on is its value — nothing to keep in sync.
      if (accepted.length > 0) question.acceptedAnswers = accepted
      if (row.note.trim() !== '') question.hostNote = row.note.trim()
      return question
    })
    return { id, title: category.title.trim() || `Category ${index + 1}`, questions }
  })
}

export function roundCategories(round: DraftRound): Category[] {
  return round.format === 'feud' ? feudCategories(round) : quizCategories(round)
}

export function styleFor(round: DraftRound): StyleConfig {
  if (round.format === 'feud') {
    const slots = Math.max(
      1,
      ...round.feud.questions.map(question =>
        question.answers.filter(answer => answer.text.trim() !== '').length),
    )
    return {
      kind: 'list',
      slots,
      strikesAllowed: round.feud.strikesAllowed,
      showCounts: round.feud.showCounts,
    }
  }

  return {
    kind: 'grid',
    columns: Math.max(1, round.quiz.categories.length),
    rows: Math.max(1, round.quiz.pointLadder.length),
    pointLadder: round.quiz.pointLadder,
    showCategoryHeaders: true,
  }
}

function clockOverride(draft: Draft, round: DraftRound): DeepPartial<RuleSet> | null {
  if (round.clockMode === 'show') return null
  const questionSec = round.clockMode === 'off' ? null : Math.max(1, round.clockSec)
  if (questionSec === draft.timerSec) return null
  return { timer: { questionSec } }
}

function buildRound(
  draft: Draft,
  round: DraftRound,
  categories: Category[],
  teamIds: ReadonlySet<string>,
): Round {
  const built: Round = {
    id: round.id,
    title: round.title.trim() || draft.title,
    bankId: round.id,
    style: styleFor(round),
  }

  if (round.subtitle.trim() !== '') built.subtitle = round.subtitle.trim()
  if (round.format === 'quiz') built.categoryIds = categories.map(category => category.id)

  const rules = clockOverride(draft, round)
  if (rules) built.overrides = { rules }

  if (round.introText.trim() !== '') {
    built.intro = { enabled: true, durationMs: round.introMs, text: round.introText.trim() }
  }
  if (round.intermissionText.trim() !== '') {
    built.intermissionAfter = { enabled: true, text: round.intermissionText.trim() }
  }
  const roster = round.teamIds.filter(id => teamIds.has(id))
  if (roster.length > 0) built.teamIds = roster
  if (round.advance === 'lowest') built.eliminateLowest = true
  if (round.advance === 'top') built.advanceTop = Math.max(1, Math.round(round.advanceTop))
  if (round.minTeams > 0) built.minTeams = round.minTeams

  return built
}

function themeOf(draft: Draft) {
  const look = draft.look
  return {
    color: {
      bg: look.bg,
      bgElevated: look.bgElevated,
      text: look.text,
      textMuted: look.textMuted,
      accent: look.accent,
      correct: look.correct,
      wrong: look.wrong,
      tile: look.tile,
      tileConsumed: look.tileConsumed,
      tileText: look.tileText,
      scrim: hexToRgba(look.bg, look.scrimOpacity),
    },
    type: {
      display: look.display,
      body: look.body,
      baseSize: look.baseSize,
      scale: {
        tile: look.scaleTile,
        question: look.scaleQuestion,
        category: look.scaleCategory,
        score: look.scaleScore,
      },
      uppercaseCategories: look.uppercaseCategories,
    },
    space: { boardGap: look.boardGap, screenPadding: look.screenPadding },
    radius: { tile: look.radiusTile, card: look.radiusCard, pill: look.radiusPill },
    shadow: { tile: SHADOWS[look.shadow] },
  }
}

function motionOf(draft: Draft): MotionConfig {
  return {
    enabled: draft.motion.enabled,
    respectReducedMotion: draft.motion.respectReducedMotion,
    speed: draft.motion.speed,
    durationsMs: {
      questionEnter: draft.motion.questionEnter,
      answerReveal: draft.motion.answerReveal,
      scoreCount: draft.motion.scoreCount,
      phaseTransition: draft.motion.phaseTransition,
      buzzFlash: draft.motion.buzzFlash,
    },
    easing: EASINGS[draft.motion.easing],
  }
}

function copyOf(draft: Draft): CopyStrings {
  return {
    question: { forPoints: draft.copy.forPoints },
    host: {
      arm: draft.copy.arm,
      correct: draft.copy.correct,
      wrong: draft.copy.wrong,
      skip: draft.copy.skip,
      next: draft.copy.next,
      endRound: draft.copy.endRound,
    },
  }
}

export function draftToConfig(draft: Draft): GameShowConfigInput {
  const banks: QuestionBank[] = []
  const rounds: Round[] = []

  const teamIds = new Set(draft.teams.map((_team, index) => `t${index + 1}`))

  for (const round of draft.rounds) {
    const categories = roundCategories(round)
    banks.push({ id: round.id, title: round.name, categories })
    rounds.push(buildRound(draft, round, categories, teamIds))
  }

  return {
    meta: {
      id: 'studio',
      title: draft.title,
      ...(draft.subtitle.trim() === '' ? {} : { subtitle: draft.subtitle.trim() }),
    },
    theme: themeOf(draft),
    motion: motionOf(draft),
    copy: copyOf(draft),
    teams: {
      teams: draft.teams.map((team, index) => ({
        id: `t${index + 1}`,
        name: team.name.trim() || `Group ${index + 1}`,
        color: team.color,
        startingScore: team.startingScore,
      })),
    },
    rules: {
      timer: { questionSec: draft.timerSec, hostCanPause: draft.hostCanPause },
      wrongAnswer: {
        penalty: draft.penalty,
        penaltyIsProportional: draft.penaltyIsProportional,
      },
      scoring: { engine: 'flat', multiplier: draft.multiplier },
    },
    runtime: { undoDepth: draft.undoDepth, transport: { driver: 'local' } },
    content: { banks },
    program: { carryScores: draft.carryScores, rounds },
  }
}

// ------------------------------------------------------------ packets → draft

/**
 * Folds a loaded packet into one round: survey content becomes the Feud board,
 * anything else becomes the quiz grid. Everything the packet does not carry —
 * teams, colours, timing, look — is left exactly as the host set it.
 */
/** Every survey question in a packet, flattened, in the order it was written. */
export function feudQuestionsFromBank(bank: QuestionBank): FeudQuestion[] {
  return bank.categories.flatMap(category =>
    category.questions.map(question => {
      return {
        prompt: question.prompt,
        answers: (question.surveyAnswers ?? []).map(answer => ({ ...answer })),
      }
    }))
}

/**
 * Deals one pool of questions across the survey rounds, in order, never using
 * the same question twice. Every round gets an equal share and the last round —
 * the final, in a heats show — takes the remainder, because that is the one
 * worth playing longest.
 */
export function dealQuestions(draft: Draft, questions: readonly FeudQuestion[]): Draft {
  const targets = draft.rounds.filter(round => round.format === 'feud')
  if (targets.length === 0 || questions.length === 0) return draft

  const each = Math.floor(questions.length / targets.length)
  let cursor = 0

  targets.forEach((round, index) => {
    const last = index === targets.length - 1
    const take = last ? questions.length - cursor : each
    round.feud.questions = questions.slice(cursor, cursor + take).map(question => ({
      prompt: question.prompt,
      answers: question.answers.map(answer => ({ ...answer })),
    }))
    cursor += take
  })

  return draft
}

export function importBankIntoRound(round: DraftRound, bank: QuestionBank): DraftRound {
  const survey = bank.categories.some(category =>
    category.questions.some(question => question.kind === 'survey'))

  if (survey) {
    const questions = feudQuestionsFromBank(bank)
    return {
      ...round,
      name: bank.title || round.name,
      format: 'feud',
      feud: { ...round.feud, questions },
    }
  }

  const rows = Math.max(1, Math.min(...bank.categories.map(category => category.questions.length)))
  const ladder = round.quiz.pointLadder.length === rows
    ? round.quiz.pointLadder
    : ladderOfLength(rows)

  const categories: QuizCategory[] = bank.categories.map(category => {
    return {
      title: category.title,
      questions: category.questions.slice(0, rows).map(question => {
        return {
          prompt: question.prompt,
          answer: question.answer,
          accept: (question.acceptedAnswers ?? []).join(' | '),
          note: question.hostNote ?? '',
        }
      }),
    }
  })

  return {
    ...round,
    name: bank.title || round.name,
    format: 'quiz',
    quiz: { pointLadder: ladder, categories },
  }
}

// ------------------------------------------------------------------- storage

interface LegacyDraft {
  format?: BoardFormat
  introText?: string
  feud?: DraftRound['feud']
  quiz?: DraftRound['quiz']
}

interface LegacyRound {
  eliminateLowest?: boolean
}

/**
 * A draft written by an older build can be missing whole sections, and the first
 * Studio saved a single round inline. Merging over the defaults means an upgrade
 * never lands the host on a blank screen or loses their questions.
 */
export function upgradeDraft(stored: unknown): Draft {
  const base = defaultDraft()
  if (typeof stored !== 'object' || stored === null) return base

  const partial = stored as Partial<Draft> & LegacyDraft

  const rounds = Array.isArray(partial.rounds) && partial.rounds.length > 0
    ? partial.rounds.map((round, index) => {
      const fresh = newRound(index, round.format ?? 'feud')
      const legacy = round as DraftRound & LegacyRound
      return {
        ...fresh,
        ...round,
        id: round.id || fresh.id,
        advance: round.advance ?? (legacy.eliminateLowest ? 'lowest' : 'all'),
        feud: { ...fresh.feud, ...round.feud },
        quiz: { ...fresh.quiz, ...round.quiz },
      }
    })
    : [legacyRound(partial, base)]

  return {
    ...base,
    ...partial,
    look: { ...base.look, ...partial.look },
    motion: { ...base.motion, ...partial.motion },
    copy: { ...base.copy, ...partial.copy },
    teams: (partial.teams ?? base.teams).map(team => ({ ...team, startingScore: team.startingScore ?? 0 })),
    rounds,
  }
}

function legacyRound(partial: LegacyDraft, base: Draft): DraftRound {
  const round = newRound(0, partial.format ?? 'feud')
  if (partial.feud) round.feud = { ...round.feud, ...partial.feud }
  if (partial.quiz) round.quiz = { ...round.quiz, ...partial.quiz }
  if (partial.introText) round.introText = partial.introText
  if (!partial.feud && !partial.quiz) return base.rounds[0]!
  return round
}

/** localStorage throws outright in some privacy modes, so every access is guarded. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    return upgradeDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Storage denied or full — the show still runs from the page in memory.
  }
}
