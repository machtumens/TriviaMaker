/**
 * T1 preflight — PLAN Sub-Phase 7 (item 27a), SPEC AC#3.
 *
 * The gap being closed: `validateConfigPlugins` only validates a round's style
 * when the kind is `'custom'`. A round asking for a built-in kind this build
 * does not implement (`trivia`, `wheel`, `tictac`, ...) passed preflight and
 * then threw from `resolve()` mid-show. `validateConfigPluginsT1` catches it
 * before the doors open.
 *
 * Unlike `validateConfigPlugins.test.ts`, this file legitimately depends on
 * `bootstrap.ts` having registered the real plugins.
 */

import assert from 'node:assert/strict'
import { validateConfigPluginsT1 } from './bootstrap'
import { list } from './index'
import { resolveConfig } from '../config/resolve'
import type { GameShowConfig, Round, StyleConfig } from '../config/types'

const GRID_STYLE: StyleConfig = {
  kind: 'grid', columns: 2, rows: 2, pointLadder: [100, 200],
  selection: 'freePick', showCategoryHeaders: true,
  consumedStyle: 'dim', dramaticCategoryReveal: false,
}

const TRIVIA_STYLE: StyleConfig = {
  kind: 'trivia', questionOrder: 'authored',
  showChoicesOnPlayerDevice: false, revealDistribution: false,
}

function configWithStyle(style: StyleConfig): GameShowConfig {
  const base = resolveConfig({ meta: { id: 'preflight-t1', title: 'Preflight T1' } })
  const round: Round = { id: 'r1', title: 'Round 1', bankId: 'bank', style }
  return { ...base, program: { ...base.program, rounds: [round] } }
}

// --- bootstrap registered the T1 plugins ------------------------------------
{
  assert.ok(list('style').includes('grid'), 'the grid style is registered')
  assert.ok(list('scoring').includes('flat'), 'the flat scoring engine is registered')
  assert.ok(list('transport').includes('local'), 'the local transport is registered')
  assert.ok(list('layout').includes('classic'), 'the default stage layout is registered')
}

// --- (a) an unregistered BUILT-IN style kind is rejected --------------------
{
  const errors = validateConfigPluginsT1(configWithStyle(TRIVIA_STYLE))
  const styleErrors = errors.filter(e => e.includes('style'))
  assert.equal(styleErrors.length, 1, `exactly one style error, got: ${errors.join(' | ')}`)
  const [message] = styleErrors
  assert.ok(message, 'error message present')
  assert.ok(message.includes('"trivia"'), `the error names the unimplemented kind: ${message}`)
  assert.ok(message.includes('program.rounds[0].style.kind'), `the error names where: ${message}`)
  assert.ok(message.includes('grid'), `the error lists grid as a registered alternative: ${message}`)
}

// --- (b) a registered built-in style kind produces no style error ----------
{
  const errors = validateConfigPluginsT1(configWithStyle(GRID_STYLE))
  assert.deepEqual(errors, [], `a fully valid T1 config passes preflight, got: ${errors.join(' | ')}`)
}

// --- the wrapped registry checks still run ----------------------------------
{
  const base = configWithStyle(GRID_STYLE)
  const bad: GameShowConfig = {
    ...base,
    runtime: { ...base.runtime, transport: { ...base.runtime.transport, driver: 'websocket' } },
  }
  const errors = validateConfigPluginsT1(bad)
  assert.equal(errors.length, 1, 'the underlying validateConfigPlugins checks are preserved')
  assert.ok(errors[0]?.includes('runtime.transport.driver'), 'including the transport driver check')
}

// --- a custom-kind round is still routed through the original check --------
{
  const custom: StyleConfig = { kind: 'custom', plugin: 'not-registered', options: {} }
  const errors = validateConfigPluginsT1(configWithStyle(custom))
  assert.equal(errors.length, 1, 'a custom style is checked once, not twice')
  assert.ok(errors[0]?.includes('program.rounds[0].style.plugin'), 'via the plugin field, not the kind')
}

console.log('✓ T1 preflight: all checks passed')
