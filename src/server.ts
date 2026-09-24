import './registry/bootstrap'
import { validateConfigPlugins } from './registry/index'

import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolve, type TransportPlugin } from './registry/index'
import type { GameShowConfig, GameShowConfigInput, QuestionBank } from './config/types'
import { resolveConfig } from './config/resolve'
import {
  readPacketText, bindPackets, stampLadderPoints, fitReport, formatProblems, hasErrors,
  isPacketPath, quickStartShow, type PacketProblem,
} from './config/packet'
import { undo } from './engine/log'
import { createSession, dispatchHostAction } from './engine/session'
import { intentsForCommand } from './engine/commands'
import { broadcastState } from './engine/broadcast'
import type { LocalTransportOptions } from './transport/local'

const DEFAULT_PRESET = 'presets/demo.ts'
const DEFAULT_PACKET_DIR = 'packets'
const DEFAULT_PORT = 8080
const DEFAULT_STATIC_DIR = 'dist'

function lanAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return 'localhost'
}

function isConfigInput(value: unknown): value is GameShowConfigInput {
  return typeof value === 'object' && value !== null && 'meta' in value
}

async function loadPreset(presetPath: string): Promise<GameShowConfigInput> {
  const absolute = path.resolve(presetPath)
  const module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>

  if (isConfigInput(module['default'])) return module['default']
  for (const [name, value] of Object.entries(module)) {
    if (name !== 'default' && isConfigInput(value)) return value
  }
  throw new Error(
    `[server] "${presetPath}" does not export a game show config ` +
    '(expected a default export, or a named export with a `meta` field)',
  )
}

function reportPacketProblems(problems: readonly PacketProblem[]): void {
  for (const line of formatProblems(problems)) console.error(line)
  if (hasErrors(problems)) process.exit(1)
}

async function loadPacketFile(packetPath: string): Promise<QuestionBank> {
  const relative = path.relative(process.cwd(), path.resolve(packetPath))
  const source = relative === '' || relative.startsWith('..') ? packetPath : relative

  let text: string
  try {
    text = await readFile(packetPath, 'utf8')
  } catch (error) {
    console.error(`[packet] ${source} could not be read:`)
    console.error(`  ✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const { bank, problems } = readPacketText(text, source)
  reportPacketProblems(problems)
  if (!bank) process.exit(1)
  return bank
}

/** A missing packets/ folder is not an error — the show then carries its own questions. */
async function loadPacketDir(dir: string): Promise<QuestionBank[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const banks: QuestionBank[] = []
  for (const entry of entries.filter(isPacketPath).sort()) {
    banks.push(await loadPacketFile(path.join(dir, entry)))
  }
  return banks
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? DEFAULT_PRESET
  const port = Number(process.env['PORT']) || DEFAULT_PORT

  // A .json or .csv argument is a question packet and is enough to play on its
  // own; a .ts argument is a show preset, which also picks up everything in packets/.
  const packets: QuestionBank[] = []
  let input: GameShowConfigInput
  if (isPacketPath(target)) {
    const bank = await loadPacketFile(target)
    packets.push(bank)
    const quickStart = quickStartShow(bank)
    reportPacketProblems(quickStart.problems)
    input = quickStart.input
  } else {
    input = await loadPreset(target)
    packets.push(...await loadPacketDir(DEFAULT_PACKET_DIR))
  }

  const config: GameShowConfig = stampLadderPoints(resolveConfig(bindPackets(input, packets)))

  const errors = validateConfigPlugins(config)
  if (errors.length > 0) {
    console.error(`[server] "${target}" cannot run:`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }

  const hostToken = randomUUID()
  let state = createSession(config)
  let seq = 0

  const transport = resolve<TransportPlugin<LocalTransportOptions>>(
    'transport',
    config.runtime.transport.driver,
  )
  const handle = await transport.start({ port, hostToken, staticDir: DEFAULT_STATIC_DIR })

  handle.onCommand(command => {
    if (command.type === 'undo') {
      state = undo(state, state.config.runtime.undoDepth).state
    } else {
      const intents = intentsForCommand(state, command.type, command.payload)
      seq++
      state = dispatchHostAction(state, intents, seq, Date.now()).state
    }
    broadcastState(handle, state, state.config)
  })

  broadcastState(handle, state, state.config)

  const origin = `http://${lanAddress()}:${port}`
  console.log(`\n  ${config.meta.title}`)
  console.log(`  ${config.program.rounds.length} round(s), ${state.teams.length} team(s)`)
  // A whole packet library would push the URLs off the first screen, so only a
  // lone packet — the quick-start case — gets its contents spelled out.
  const [only] = packets
  if (packets.length === 1 && only) {
    const questions = only.categories.reduce((total, category) => total + category.questions.length, 0)
    console.log(`  Packet: ${only.id} — ${only.categories.length} categories, ${questions} questions`)
  } else if (packets.length > 1) {
    console.log(`  Packets: ${packets.map(bank => bank.id).join(', ')}`)
  }

  const fit = fitReport(config)
  if (fit.length > 0) {
    console.log('')
    for (const line of formatProblems(fit)) console.log(line)
  }
  console.log('')
  console.log(`  Stage: ${origin}/stage.html`)
  console.log(`  Host:  ${origin}/host.html?token=${hostToken}\n`)
  console.log('  The host link contains the session token — do not put it on the projector.')
  console.log('  Ctrl-C to end the show.\n')

  const shutdown = () => {
    void handle.stop()
      .catch((error: unknown) => { console.error('[server] shutdown error:', error) })
      .finally(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
