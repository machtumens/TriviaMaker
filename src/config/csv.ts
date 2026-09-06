import type { PacketProblem } from './packet'

/**
 * A spreadsheet export, one question per row. This is the format people's
 * questions are already in — the JSON packet is what the engine reads, but
 * almost nobody should have to type it by hand.
 */

/** Header names people actually type, mapped to the field they mean. */
const HEADER_ALIASES: Record<string, string> = {
  category: 'category', categories: 'category', topic: 'category', column: 'category',
  prompt: 'prompt', question: 'prompt', q: 'prompt',
  answer: 'answer', a: 'answer', correct: 'answer',
  accept: 'accept', accepted: 'accept', alternatives: 'accept', alt: 'accept', also: 'accept',
  note: 'note', notes: 'note', hostnote: 'note',
  title: 'title', packet: 'title', packettitle: 'title',
  points: 'points', value: 'points', score: 'points',
}

const REQUIRED_FIELDS = ['category', 'prompt', 'answer'] as const

/** Alternative answers are separated by | or ; — a comma would end the field. */
const ACCEPT_SEPARATOR = /[|;]/

/** The first spreadsheet row is the header, so data starts at row 2. */
const FIRST_DATA_ROW = 2

/**
 * RFC 4180 reader: quoted fields may hold commas, newlines and "" escapes.
 * Excel and Sheets both emit that shape, and both may prefix a BOM.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; index < text.length; index++) {
    const char = text.charAt(index)

    if (quoted) {
      if (char !== '"') { field += char; continue }
      if (text.charAt(index + 1) === '"') { field += '"'; index++; continue }
      quoted = false
      continue
    }

    // A quote only opens a quoted field at the start of one. Mid-field quotes
    // are literal, so a hand-typed `Accept "twenty-six"` survives unescaped —
    // which Excel would have written fully quoted, handled by the branch above.
    if (char === '"' && field === '') { quoted = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Blank lines are ordinary in hand-edited spreadsheets and mean nothing.
  return rows.filter(entry => entry.some(cell => cell.trim() !== ''))
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface CsvPacketResult {
  /** A packet-shaped object for readPacket, or null when the sheet is unusable. */
  object: unknown | null
  problems: PacketProblem[]
}

interface CsvQuestion {
  prompt: string
  answer: string
  accept?: string[]
  note?: string
  points?: number
}

/**
 * Turns a sheet into the same object a .json packet parses to, so both formats
 * meet in readPacket and share one set of rules.
 *
 * Problems are reported with spreadsheet row numbers, because that is what the
 * author is looking at while fixing them.
 */
export function csvToPacket(text: string, source: string, title: string): CsvPacketResult {
  const problems: PacketProblem[] = []
  const rows = parseCsv(text)

  const header = rows[0]
  if (!header) {
    problems.push({ level: 'error', where: source, message: 'the file is empty' })
    return { object: null, problems }
  }

  const columns = header.map(normalizeHeader).map(name => HEADER_ALIASES[name] ?? name)
  const missing = REQUIRED_FIELDS.filter(field => !columns.includes(field))
  if (missing.length > 0) {
    problems.push({
      level: 'error',
      where: `${source} row 1`,
      message: `header is missing ${missing.map(field => `"${field}"`).join(' and ')} — ` +
        `found ${header.map(cell => `"${cell.trim()}"`).join(', ')}`,
    })
    return { object: null, problems }
  }

  const cell = (row: readonly string[], field: string): string => {
    const at = columns.indexOf(field)
    return at === -1 ? '' : (row[at] ?? '').trim()
  }

  // A sheet has no header for the packet's own name, so an optional "title"
  // column can carry it. Without one the filename is used, which turns
  // "week-3.csv" into "Week 3" — fine for a file, poor as a show title.
  const declared = rows.slice(1).map(row => cell(row, 'title')).find(value => value !== '')

  const order: string[] = []
  const byCategory = new Map<string, CsvQuestion[]>()

  rows.slice(1).forEach((row, index) => {
    const where = `${source} row ${index + FIRST_DATA_ROW}`

    const category = cell(row, 'category')
    const prompt = cell(row, 'prompt')
    const answer = cell(row, 'answer')

    const blanks = [
      category === '' ? 'category' : null,
      prompt === '' ? 'prompt' : null,
      answer === '' ? 'answer' : null,
    ].filter((field): field is string => field !== null)

    if (blanks.length > 0) {
      problems.push({
        level: 'error',
        where,
        message: `${blanks.map(field => `"${field}"`).join(' and ')} is empty`,
      })
      return
    }

    const question: CsvQuestion = { prompt, answer }

    const accept = cell(row, 'accept')
      .split(ACCEPT_SEPARATOR)
      .map(entry => entry.trim())
      .filter(entry => entry !== '')
    if (accept.length > 0) question.accept = accept

    const note = cell(row, 'note')
    if (note !== '') question.note = note

    const points = cell(row, 'points')
    if (points !== '') {
      const value = Number(points)
      if (!Number.isFinite(value)) {
        problems.push({ level: 'error', where, message: `"points" is not a number: "${points}"` })
        return
      }
      question.points = value
    }

    let bucket = byCategory.get(category)
    if (!bucket) {
      bucket = []
      byCategory.set(category, bucket)
      order.push(category)
    }
    bucket.push(question)
  })

  if (problems.some(problem => problem.level === 'error')) return { object: null, problems }

  if (order.length === 0) {
    problems.push({ level: 'error', where: source, message: 'no question rows below the header' })
    return { object: null, problems }
  }

  return {
    object: {
      packet: 1,
      title: declared ?? title,
      categories: order.map(category => ({
        title: category,
        questions: byCategory.get(category) ?? [],
      })),
    },
    problems,
  }
}
