import type {
  Category, GameShowConfig, GameShowConfigInput, Question, QuestionBank, Round,
} from './types'
import { csvToPacket } from './csv'

/** Bump only when a change would make an old file unreadable. */
export const PACKET_FORMAT_VERSION = 1

/** A show built from a packet alone gets a board this shape. */
export const QUICK_START_LADDER = [100, 200, 300, 400, 500]
export const QUICK_START_MAX_COLUMNS = 6
export const QUICK_START_TEAMS = [
  { id: 'red', name: 'Red', color: '#ff5c5c' },
  { id: 'blue', name: 'Blue', color: '#3b7ddd' },
  { id: 'green', name: 'Green', color: '#3ddc84' },
]

export interface PacketProblem {
  level: 'error' | 'warn'
  where: string
  message: string
}

export interface PacketReadResult {
  /** null when the packet has at least one error. */
  bank: QuestionBank | null
  problems: PacketProblem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authors type answers as `26` as often as `"26"`, and trailing spaces come free
 * with every spreadsheet export. Both are accepted rather than rejected.
 */
function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function textList(value: unknown): string[] {
  if (value === undefined || value === null) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw.map(text).filter((entry): entry is string => entry !== null)
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * Reads one packet file's parsed JSON into a question bank.
 *
 * Everything except `prompt` and `answer` is optional: ids, points and `kind`
 * are filled in here so that the file a human writes stays small. Points are
 * deliberately NOT defaulted — the round's point ladder supplies them later, in
 * stampLadderPoints, which is what lets one packet play at 100/200/300 in one
 * round and 200/400/600 in the next.
 */
export function readPacket(raw: unknown, source: string): PacketReadResult {
  const problems: PacketProblem[] = []
  const error = (where: string, message: string) => {
    problems.push({ level: 'error', where, message })
  }
  const warn = (where: string, message: string) => {
    problems.push({ level: 'warn', where, message })
  }

  if (!isRecord(raw)) {
    error(source, 'a packet must be a JSON object')
    return { bank: null, problems }
  }

  const version = raw['packet']
  if (version === undefined) {
    warn(source, `no "packet" field — assuming format version ${PACKET_FORMAT_VERSION}`)
  } else if (typeof version !== 'number' || !Number.isInteger(version)) {
    error(source, '"packet" must be a whole number (the format version)')
  } else if (version > PACKET_FORMAT_VERSION) {
    error(source, `written for packet format ${version}; this build reads ${PACKET_FORMAT_VERSION}`)
  }

  const title = text(raw['title'])
  if (title === null) error(source, '"title" is required')

  const explicitId = text(raw['id'])
  const packetId = explicitId ?? (title === null ? null : slug(title))
  if (packetId !== null && !ID_PATTERN.test(packetId)) {
    error(source, `id "${packetId}" must be lowercase letters, digits and dashes`)
  }

  const rawCategories = raw['categories']
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    error(source, '"categories" must be a non-empty array')
    return { bank: null, problems }
  }

  const categories: Category[] = []
  const categoryIds = new Set<string>()
  const questionIds = new Set<string>()
  const counts: number[] = []

  rawCategories.forEach((rawCategory, categoryIndex) => {
    const fallbackWhere = `${source} › category ${categoryIndex + 1}`
    if (!isRecord(rawCategory)) {
      error(fallbackWhere, 'each category must be an object')
      return
    }

    const categoryTitle = text(rawCategory['title'])
    const where = categoryTitle === null ? fallbackWhere : `${source} › ${categoryTitle}`
    if (categoryTitle === null) {
      error(fallbackWhere, '"title" is required')
      return
    }

    const categoryId = text(rawCategory['id'])
      ?? (slug(categoryTitle) || `category-${categoryIndex + 1}`)
    if (!ID_PATTERN.test(categoryId)) {
      error(where, `id "${categoryId}" must be lowercase letters, digits and dashes`)
      return
    }
    if (categoryIds.has(categoryId)) {
      error(where, `two categories share the id "${categoryId}" — give one an explicit "id"`)
      return
    }
    categoryIds.add(categoryId)

    const rawQuestions = rawCategory['questions']
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      error(where, '"questions" must be a non-empty array')
      return
    }

    const questions: Question[] = []
    rawQuestions.forEach((rawQuestion, questionIndex) => {
      const at = `${where} › question ${questionIndex + 1}`
      if (!isRecord(rawQuestion)) {
        error(at, 'each question must be an object')
        return
      }

      const prompt = text(rawQuestion['prompt'])
      const answer = text(rawQuestion['answer'])
      if (prompt === null) error(at, '"prompt" is required')
      if (answer === null) error(at, '"answer" is required')

      const kind = text(rawQuestion['kind']) ?? 'text'
      if (kind !== 'text') {
        error(at, `kind "${kind}" is not playable in this build — only "text" questions run`)
      }

      const rawPoints = rawQuestion['points']
      if (rawPoints !== undefined && typeof rawPoints !== 'number') {
        error(at, '"points" must be a number when set')
      }

      // Question ids are looked up across every bank at once (findQuestion), so
      // they are namespaced by packet. Two packets that both contain a "Space"
      // category would otherwise each generate "space-1" and shadow each other.
      const generatedId = `${packetId ?? 'packet'}/${categoryId}-${questionIndex + 1}`
      const questionId = text(rawQuestion['id']) ?? generatedId
      if (questionIds.has(questionId)) {
        error(at, `two questions share the id "${questionId}"`)
        return
      }
      questionIds.add(questionId)

      if (prompt === null || answer === null) return

      const accepted = textList(rawQuestion['accept'] ?? rawQuestion['acceptedAnswers'])
      const note = text(rawQuestion['note'] ?? rawQuestion['hostNote'])

      const question: Question = { id: questionId, kind: 'text', prompt, answer }
      if (accepted.length > 0) question.acceptedAnswers = accepted
      if (note !== null) question.hostNote = note
      if (typeof rawPoints === 'number') question.points = rawPoints

      questions.push(question)
    })

    counts.push(questions.length)

    const category: Category = { id: categoryId, title: categoryTitle, questions }
    const accent = text(rawCategory['accent'])
    if (accent !== null) category.accent = accent
    categories.push(category)
  })

  const distinctCounts = [...new Set(counts.filter(count => count > 0))]
  if (distinctCounts.length > 1) {
    warn(
      source,
      `categories hold different numbers of questions (${distinctCounts.sort((a, b) => a - b).join(', ')}) — ` +
      'the short columns will leave blank tiles on the board',
    )
  }

  const hasError = problems.some(problem => problem.level === 'error')
  if (hasError || packetId === null || title === null) return { bank: null, problems }

  return { bank: { id: packetId, title, categories }, problems }
}

/**
 * Appends packet banks to a show config's content. Ids must not collide: a
 * duplicate bank id would make `round.bankId` ambiguous, and a duplicate
 * question id would make findQuestion return the wrong question mid-show.
 */
export function bindPackets(
  input: GameShowConfigInput,
  banks: readonly QuestionBank[],
): GameShowConfigInput {
  if (banks.length === 0) return input

  const existing = (input.content?.banks ?? []) as QuestionBank[]
  const merged = [...existing, ...banks]

  const seenBanks = new Set<string>()
  const seenQuestions = new Map<string, string>()
  for (const bank of merged) {
    if (seenBanks.has(bank.id)) {
      throw new Error(
        `[packet] two question banks share the id "${bank.id}" — rename one, or remove the duplicate file`,
      )
    }
    seenBanks.add(bank.id)

    for (const category of bank.categories) {
      for (const question of category.questions) {
        const owner = seenQuestions.get(question.id)
        if (owner !== undefined) {
          throw new Error(
            `[packet] question id "${question.id}" appears in both "${owner}" and "${bank.id}" — ` +
            'ids must be unique across every loaded packet',
          )
        }
        seenQuestions.set(question.id, bank.id)
      }
    }
  }

  return { ...input, content: { ...input.content, banks: merged } }
}

/**
 * Fills in `question.points` from the point ladder of the round that plays it.
 *
 * The board reads tile values from the ladder (styles/grid.ts) but scoring reads
 * `question.points` (scoring/flat.ts). Without this pass a packet that omits
 * points renders 100/200/300 on the projector and awards zero on every correct
 * answer — visible only once the show is live.
 */
export function stampLadderPoints(config: GameShowConfig): GameShowConfig {
  const assigned = new Map<string, { points: number; roundId: string }>()

  for (const round of config.program.rounds) {
    if (round.style.kind !== 'grid') continue

    const bank = config.content.banks.find(candidate => candidate.id === round.bankId)
    if (!bank) continue // createSession reports unknown banks with a better message

    const categories = round.categoryIds === undefined
      ? bank.categories
      : round.categoryIds
        .map(id => bank.categories.find(category => category.id === id))
        .filter((category): category is Category => category !== undefined)

    for (const category of categories) {
      round.style.pointLadder.forEach((points, row) => {
        const question = category.questions[row]
        if (!question || question.points !== undefined) return

        const previous = assigned.get(question.id)
        if (previous !== undefined && previous.points !== points) {
          throw new Error(
            `[packet] question "${question.id}" is played by round "${previous.roundId}" at ` +
            `${previous.points} points and by round "${round.id}" at ${points} points. ` +
            'Give the question an explicit "points" value, or use a different category per round.',
          )
        }
        assigned.set(question.id, { points, roundId: round.id })
      })
    }
  }

  if (assigned.size === 0) return config

  const banks = config.content.banks.map(bank => ({
    ...bank,
    categories: bank.categories.map(category => ({
      ...category,
      questions: category.questions.map(question => {
        const hit = assigned.get(question.id)
        return hit === undefined ? question : { ...question, points: hit.points }
      }),
    })),
  }))

  return { ...config, content: { ...config.content, banks } }
}

/**
 * Whether the loaded content actually fills the board each round declares.
 * Silence means it fits; every line here is something a host would otherwise
 * discover from a blank tile on the projector.
 */
export function fitReport(config: GameShowConfig): PacketProblem[] {
  const problems: PacketProblem[] = []

  for (const round of config.program.rounds) {
    if (round.style.kind !== 'grid') continue
    const where = `round "${round.id}"`

    const bank = config.content.banks.find(candidate => candidate.id === round.bankId)
    if (!bank) continue

    const rows = round.style.pointLadder.length
    if (rows !== round.style.rows) {
      problems.push({
        level: 'warn',
        where,
        message: `style.rows is ${round.style.rows} but the point ladder has ${rows} value(s) — the ladder wins`,
      })
    }

    const ids = round.categoryIds ?? bank.categories.map(category => category.id)
    if (ids.length !== round.style.columns) {
      problems.push({
        level: 'warn',
        where,
        message: `style.columns is ${round.style.columns} but ${ids.length} category/categories are selected`,
      })
    }

    for (const id of ids) {
      const category = bank.categories.find(candidate => candidate.id === id)
      if (!category) continue
      const held = category.questions.length
      if (held < rows) {
        problems.push({
          level: 'warn',
          where,
          message: `"${category.title}" has ${held} question(s) but the ladder needs ${rows} — ` +
            `${rows - held} tile(s) will be blank`,
        })
      } else if (held > rows) {
        problems.push({
          level: 'warn',
          where,
          message: `"${category.title}" has ${held} question(s); only the first ${rows} are reachable`,
        })
      }
    }
  }

  return problems
}

export function formatProblems(problems: readonly PacketProblem[]): string[] {
  return problems.map(problem => {
    const mark = problem.level === 'error' ? '✗' : '!'
    return `  ${mark} ${problem.where}: ${problem.message}`
  })
}

export function hasErrors(problems: readonly PacketProblem[]): boolean {
  return problems.some(problem => problem.level === 'error')
}

export function isPacketPath(source: string): boolean {
  const lower = source.toLowerCase()
  return lower.endsWith('.json') || lower.endsWith('.csv')
}

/** "packets/general-knowledge.csv" → "General Knowledge". A sheet has no room for a title. */
export function titleFromSource(source: string): string {
  const base = source.split(/[\\/]/).pop() ?? source
  const stem = base.replace(/\.[^.]+$/, '')
  const words = stem.split(/[-_\s]+/).filter(word => word !== '')
  if (words.length === 0) return 'Questions'
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Reads either packet format from raw text. `.csv` files are folded into the
 * same object a `.json` file parses to, so both meet in readPacket and obey one
 * set of rules.
 */
export function readPacketText(text: string, source: string): PacketReadResult {
  if (source.toLowerCase().endsWith('.csv')) {
    const { object, problems } = csvToPacket(text, source, titleFromSource(source))
    if (object === null) return { bank: null, problems }
    const read = readPacket(object, source)
    return { bank: read.bank, problems: [...problems, ...read.problems] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { bank: null, problems: [{ level: 'error', where: source, message: `not valid JSON — ${detail}` }] }
  }

  return readPacket(parsed, source)
}

export interface QuickStartResult {
  input: GameShowConfigInput
  problems: PacketProblem[]
}

/**
 * Builds a playable show out of a packet alone, so a file of questions is enough
 * to start — no preset to copy, nothing to edit.
 *
 * With a `base` show it keeps that show's rules, theme and teams and replaces
 * only the board: the format stays, the content changes. That split is the whole
 * point of packets.
 */
export function quickStartShow(bank: QuestionBank, base?: GameShowConfigInput): QuickStartResult {
  const problems: PacketProblem[] = []
  const categories = bank.categories.slice(0, QUICK_START_MAX_COLUMNS)
  const shortest = Math.min(...categories.map(category => category.questions.length))
  const rows = Math.min(QUICK_START_LADDER.length, shortest)

  if (categories.length === 0 || rows < 1) {
    problems.push({
      level: 'error',
      where: bank.id,
      message: 'every category needs at least one question to build a board',
    })
    return { input: base ?? { meta: { id: bank.id, title: bank.title } }, problems }
  }

  if (bank.categories.length > categories.length) {
    problems.push({
      level: 'warn',
      where: bank.id,
      message: `only the first ${categories.length} categories fit one board; ` +
        `${bank.categories.length - categories.length} left out`,
    })
  }

  const round: Round = {
    id: 'r1',
    title: bank.title,
    bankId: bank.id,
    categoryIds: categories.map(category => category.id),
    style: {
      kind: 'grid',
      columns: categories.length,
      rows,
      pointLadder: QUICK_START_LADDER.slice(0, rows),
      selection: 'freePick',
      showCategoryHeaders: true,
      consumedStyle: 'dim',
      dramaticCategoryReveal: false,
    },
  }

  if (base) {
    return {
      input: { ...base, program: { ...base.program, rounds: [round] } },
      problems,
    }
  }

  return {
    input: {
      meta: { id: bank.id, title: bank.title },
      join: { method: 'none' },
      teams: { teams: QUICK_START_TEAMS, membership: { assignment: 'preassigned' } },
      rules: {
        turn: { picker: 'host', answerRights: 'turnOwner', maxAttempts: 1 },
        buzz: { enabled: false, requireArming: true },
        timer: { questionSec: 30, warnAtSec: 5, hostCanPause: true },
        wrongAnswer: { penalty: 0, allowSteal: false },
        scoring: { engine: 'flat', multiplier: 1 },
      },
      runtime: { transport: { driver: 'local' }, degradeToOfflineOnNetworkLoss: true },
      program: { carryScores: true, scoreboardBetweenRounds: true, rounds: [round] },
    },
    problems,
  }
}
