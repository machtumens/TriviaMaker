import { resolveConfig } from '../config/resolve'
import {
  readPacketText, bindPackets, stampLadderPoints, fitReport, quickStartShow,
  type PacketProblem,
} from '../config/packet'
import { validateConfigPluginsT1 } from '../registry/plugins'
import { createSession, dispatchHostAction } from '../engine/session'
import { intentsForCommand } from '../engine/commands'
import { undo } from '../engine/log'
import { broadcastState } from '../engine/broadcast'
import type { GameShowConfig, GameShowConfigInput, QuestionBank } from '../config/types'
import { channelTransport, serveCommands, installHostShim } from './channel'
import { assemblyShow } from '../../presets/assembly-show'
import { demoT1 } from '../../presets/demo-t1'

const SHOWS: Record<string, GameShowConfigInput> = {
  assembly: assemblyShow,
  demo: demoT1,
}

const chosen = new URLSearchParams(location.search).get('show') ?? 'assembly'
const show = SHOWS[chosen] ?? assemblyShow

/** The show as authored: rules, theme and teams. A packet replaces only its board. */
const baseShow: GameShowConfigInput = {
  ...show,
  runtime: { ...show.runtime, transport: { driver: 'channel' } },
}

function buildConfig(input: GameShowConfigInput, banks: QuestionBank[]): GameShowConfig {
  return stampLadderPoints(resolveConfig(bindPackets(input, banks)))
}

let config = buildConfig(baseShow, [])

const errors = validateConfigPluginsT1(config)
if (errors.length > 0) throw new Error(errors.join('\n'))

let state = createSession(config)
let seq = 0

function apply(command: { type: string; payload: unknown }): void {
  if (command.type === 'undo') {
    if (!state.config.runtime.undo.enabled) throw new Error('undo is disabled for this show')
    state = undo(state, state.config.runtime.undo.depth).state
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
 * Swaps the questions without touching the show: the preset's rules, theme and
 * teams stay, and the board is rebuilt from the packet.
 *
 * Returns what went wrong, or what is merely worth knowing (an uneven board, say).
 * Nothing is changed unless the packet is playable, so a bad file leaves the
 * running show alone.
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
  const invalid = validateConfigPluginsT1(next)
  if (invalid.length > 0) {
    return [...problems, ...invalid.map(message => ({ level: 'error' as const, where: name, message }))]
  }

  config = next
  state = createSession(config)
  publish()

  return [...problems, ...quickStart.problems, ...fitReport(config)]
}
