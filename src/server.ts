import { validateConfigPluginsT1 } from './registry/bootstrap'

import { randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolve, type TransportPlugin } from './registry/index'
import type { GameShowConfig, GameShowConfigInput } from './config/types'
import { resolveConfig } from './config/resolve'
import { undo } from './engine/log'
import { createSession, dispatchHostAction } from './engine/session'
import { intentsForCommand } from './engine/commands'
import { broadcastState } from './engine/broadcast'
import type { LocalTransportOptions } from './transport/local'

const DEFAULT_PRESET = 'presets/demo-t1.ts'
const DEFAULT_PORT = 8080
const DEFAULT_STATIC_DIR = 'dist'
const MS_PER_SECOND = 1000

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

async function main(): Promise<void> {
  const presetPath = process.argv[2] ?? DEFAULT_PRESET
  const port = Number(process.env['PORT']) || DEFAULT_PORT

  const config: GameShowConfig = resolveConfig(await loadPreset(presetPath))

  const errors = validateConfigPluginsT1(config)
  if (errors.length > 0) {
    console.error(`[server] "${presetPath}" cannot run:`)
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
      if (!state.config.runtime.undo.enabled) throw new Error('[server] undo is disabled for this show')
      state = undo(state, state.config.runtime.undo.depth).state
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
  console.log(`  ${config.program.rounds.length} round(s), ${state.teams.length} team(s)\n`)
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
