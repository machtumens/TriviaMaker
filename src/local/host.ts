import { resolveConfig } from '../config/resolve'
import {
  readPacketText, bindPackets, stampLadderPoints, fitReport, quickStartShow,
  type PacketProblem,
} from '../config/packet'
import '../registry/plugins'
import { validateConfigPlugins } from '../registry/index'
import { createSession, dispatchHostAction } from '../engine/session'
import { intentsForCommand } from '../engine/commands'
import { undo } from '../engine/log'
import { broadcastState } from '../engine/broadcast'
import type { GameShowConfig, GameShowConfigInput, QuestionBank } from '../config/types'
import { channelTransport, serveCommands, installHostShim } from './channel'
import { assemblyShow } from '../../presets/assembly-show'
import { demo } from '../../presets/demo'
import { familyFeud } from '../../presets/family-feud'
import familyFeudCsv from '../../packets/family-feud.csv?raw'
import { draftToConfig, loadDraft } from '../admin/draft'

interface BuiltInShow {
  input: GameShowConfigInput

  /** Packets a show carries with it. The browser has no packets/ folder to read. */
  packets: QuestionBank[]
}

function builtInPacket(text: string, name: string): QuestionBank[] {
  const { bank, problems } = readPacketText(text, name)
  if (!bank) throw new Error(problems.map(problem => problem.message).join('\n'))
  return [bank]
}

const SHOWS: Record<string, BuiltInShow> = {
  assembly: { input: assemblyShow, packets: [] },
  demo: { input: demo, packets: [] },
  feud: { input: familyFeud, packets: builtInPacket(familyFeudCsv, 'family-feud.csv') },
}

// A show built in the Studio lives in this browser, not in presets/.
const studioDraft = loadDraft()
if (studioDraft) SHOWS['studio'] = { input: draftToConfig(studioDraft), packets: [] }

const chosen = new URLSearchParams(location.search).get('show') ?? 'assembly'
if (chosen === 'studio' && !studioDraft) location.replace('../admin/index.html')

const selected = SHOWS[chosen] ?? SHOWS['assembly']!
const show = selected.input

/** The show as authored: rules, theme and teams. A packet replaces only its board. */
const baseShow: GameShowConfigInput = {
  ...show,
  runtime: { ...show.runtime, transport: { driver: 'channel' } },
}

function buildConfig(input: GameShowConfigInput, banks: QuestionBank[]): GameShowConfig {
  return stampLadderPoints(resolveConfig(bindPackets(input, banks)))
}

let config = buildConfig(baseShow, selected.packets)

const errors = validateConfigPlugins(config)
if (errors.length > 0) throw new Error(errors.join('\n'))

let state = createSession(config)
let seq = 0

function apply(command: { type: string; payload: unknown }): void {
  if (command.type === 'undo') {
    state = undo(state, state.config.runtime.undoDepth).state
  } else {
    const intents = intentsForCommand(state, command.type, command.payload)
    seq++
    state = dispatchHostAction(state, intents, seq, Date.now()).state
  }
  broadcastState(channelTransport, state, state.config)
}

channelTransport.onCommand(apply)
serveCommands()
installHostShim(apply)

export function showLabel(): string {
  return `${config.meta.title} · ${config.program.rounds.length} round(s)`
}

export function publish(): void {
  broadcastState(channelTransport, state, state.config)
}

/**
 * Rebuilds the board from a packet, keeping the show's rules, theme and teams.
 * Returns errors and warnings (an uneven board, say). Nothing changes unless the
 * packet is playable, so a bad file leaves the running show alone.
 */
export function playPacket(text: string, name: string): PacketProblem[] {
  if (state.phase !== 'lobby') {
    return [{
      level: 'error',
      where: name,
      message: 'the show has already started — reload this page to change the questions',
    }]
  }

  const { bank, problems } = readPacketText(text, name)
  if (!bank) return problems

  const quickStart = quickStartShow(bank, baseShow)
  if (quickStart.problems.some(problem => problem.level === 'error')) {
    return [...problems, ...quickStart.problems]
  }

  const next = buildConfig(quickStart.input, [bank])
  const invalid = validateConfigPlugins(next)
  if (invalid.length > 0) {
    return [...problems, ...invalid.map(message => ({ level: 'error' as const, where: name, message }))]
  }

  config = next
  state = createSession(config)
  publish()

  return [...problems, ...quickStart.problems, ...fitReport(config)]
}
