import { resolveConfig } from '../config/resolve'
import { validateConfigPluginsT1 } from '../registry/plugins'
import { createSession, dispatchHostAction } from '../engine/session'
import { intentsForCommand } from '../engine/commands'
import { undo } from '../engine/log'
import { broadcastState } from '../engine/broadcast'
import type { BroadcastPayload } from '../engine/broadcast'
import type { GameShowConfig } from '../config/types'
import { memoryTransport, dispatch, subscribe } from './memory'
import { demoShow } from './show'
import { mountControls, mountTilePicker } from './controls'

const config: GameShowConfig = resolveConfig(demoShow)
const errors = validateConfigPluginsT1(config)
if (errors.length > 0) throw new Error(errors.join('\n'))

let state = createSession(config)
let seq = 0

memoryTransport.onCommand(command => {
  if (command.type === 'undo') {
    state = undo(state, state.config.runtime.undo.depth).state
  } else {
    const intents = intentsForCommand(state, command.type, command.payload)
    seq++
    state = dispatchHostAction(state, intents, seq, Date.now()).state
  }
  broadcastState(memoryTransport, state, state.config)
})

await import('../stage/main')

mountTilePicker(dispatch)

mountControls({
  send: dispatch,
  roundCount: config.program.rounds.length,
  onHostFrame: (listener: (payload: BroadcastPayload) => void) => subscribe('host', frame => {
    listener(JSON.parse(frame) as BroadcastPayload)
  }),
})

broadcastState(memoryTransport, state, state.config)
