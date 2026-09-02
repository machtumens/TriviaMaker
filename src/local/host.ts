import { resolveConfig } from '../config/resolve'
import { validateConfigPluginsT1 } from '../registry/plugins'
import { createSession, dispatchHostAction } from '../engine/session'
import { intentsForCommand } from '../engine/commands'
import { undo } from '../engine/log'
import { broadcastState } from '../engine/broadcast'
import type { GameShowConfig, GameShowConfigInput } from '../config/types'
import { channelTransport, serveCommands, installHostShim } from './channel'
import { assemblyShow } from '../../presets/assembly-show'
import { demoT1 } from '../../presets/demo-t1'

const SHOWS: Record<string, GameShowConfigInput> = {
  assembly: assemblyShow,
  demo: demoT1,
}

const chosen = new URLSearchParams(location.search).get('show') ?? 'assembly'
const show = SHOWS[chosen] ?? assemblyShow

const config: GameShowConfig = resolveConfig({
  ...show,
  runtime: { ...show.runtime, transport: { driver: 'channel' } },
})

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

export const showTitle = config.meta.title
export const roundCount = config.program.rounds.length

export function publish(): void {
  broadcastState(channelTransport, state, state.config)
}
