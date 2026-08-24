/**
 * Preflight self-check — SPEC AC#3, PLAN Sub-Phase 0 (items 1-2).
 *
 * `validateConfigPlugins()` is the only thing standing between a typo in a
 * preset and a crash mid-show in front of an audience. Every field it claims
 * to check is asserted here, plus a fully-valid config producing zero errors.
 *
 * Registry hygiene: this file registers ONLY throwaway keys prefixed
 * `vcp-test-` so it has no ordering dependency on `bootstrap.ts` and can never
 * collide with the real `grid`/`flat`/`local` registrations when the whole
 * suite runs in one process.
 */

import assert from 'node:assert/strict'
import { register, validateConfigPlugins } from './index'
import { resolveConfig } from '../config/resolve'
import type { GameShowConfig, Round } from '../config/types'

// --- throwaway registrations, unique to this file --------------------------
const TEST_TRANSPORT = 'vcp-test-transport'
const TEST_SCORING = 'vcp-test-scoring'
const TEST_LAYOUT = 'vcp-test-layout'
const TEST_STYLE = 'vcp-test-style'
const TEST_LIFELINE = 'vcp-test-lifeline'
const TEST_HANDLER = 'vcp-test-handler'
const TEST_WIDGET = 'vcp-test-widget'

register('transport', { key: TEST_TRANSPORT })
register('scoring', { key: TEST_SCORING })
register('layout', { key: TEST_LAYOUT })
register('style', { key: TEST_STYLE })
register('lifeline', { key: TEST_LIFELINE })
register('handler', { key: TEST_HANDLER })
register('widget', { key: TEST_WIDGET })

const BASE = resolveConfig({ meta: { id: 'preflight', title: 'Preflight' } })

/** A config that is fully valid against the throwaway registrations above. */
function validConfig(): GameShowConfig {
  const round: Round = {
    id: 'r1',
    title: 'Round 1',
    style: { kind: 'custom', plugin: TEST_STYLE, options: {} },
  }
  return {
    ...BASE,
    program: { ...BASE.program, rounds: [round] },
    rules: {
      ...BASE.rules,
      scoring: { ...BASE.rules.scoring, engine: TEST_SCORING },
      lifelines: {
        ...BASE.rules.lifelines,
        available: [{ plugin: TEST_LIFELINE, uses: 1 }],
      },
    },
    layout: {
      ...BASE.layout,
      stageLayout: TEST_LAYOUT,
      widgets: [{ plugin: TEST_WIDGET, slot: 'corner' }],
    },
    runtime: {
      ...BASE.runtime,
      transport: { ...BASE.runtime.transport, driver: TEST_TRANSPORT },
    },
    integration: {
      ...BASE.integration,
      hooks: [{ on: 'phase.changed', plugin: TEST_HANDLER }],
    },
  }
}

/** Assert exactly one error, naming both the config path and the bad key. */
function assertNamesBadKey(errors: string[], where: string, badKey: string) {
  assert.equal(errors.length, 1, `expected exactly one error, got: ${errors.join(' | ')}`)
  const [message] = errors
  assert.ok(message, 'error message present')
  assert.ok(
    message.includes(where),
    `error should name the config path "${where}": ${message}`,
  )
  assert.ok(
    message.includes(`"${badKey}"`),
    `error should name the bad key "${badKey}": ${message}`,
  )
}

// --- (c) a fully valid config produces zero errors -------------------------
{
  assert.deepEqual(
    validateConfigPlugins(validConfig()),
    [],
    'a config referencing only registered keys produces no errors',
  )
}

// --- (a) unregistered transport driver -------------------------------------
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    runtime: { ...cfg.runtime, transport: { ...cfg.runtime.transport, driver: 'no-such-transport' } },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'runtime.transport.driver', 'no-such-transport')
}

// --- (b) every other checked field -----------------------------------------
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    rules: { ...cfg.rules, scoring: { ...cfg.rules.scoring, engine: 'no-such-scoring' } },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'rules.scoring.engine', 'no-such-scoring')
}
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    layout: { ...cfg.layout, stageLayout: 'no-such-layout' },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'layout.stageLayout', 'no-such-layout')
}
{
  const cfg = validConfig()
  const round: Round = {
    id: 'r1',
    title: 'Round 1',
    style: { kind: 'custom', plugin: 'no-such-style', options: {} },
  }
  const bad: GameShowConfig = { ...cfg, program: { ...cfg.program, rounds: [round] } }
  assertNamesBadKey(validateConfigPlugins(bad), 'program.rounds[0].style.plugin', 'no-such-style')
}
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    rules: {
      ...cfg.rules,
      lifelines: { ...cfg.rules.lifelines, available: [{ plugin: 'no-such-lifeline', uses: 1 }] },
    },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'rules.lifelines.available[0]', 'no-such-lifeline')
}
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    integration: { ...cfg.integration, hooks: [{ on: 'phase.changed', plugin: 'no-such-handler' }] },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'integration.hooks[0]', 'no-such-handler')
}
{
  const cfg = validConfig()
  const bad: GameShowConfig = {
    ...cfg,
    layout: { ...cfg.layout, widgets: [{ plugin: 'no-such-widget', slot: 'corner' }] },
  }
  assertNamesBadKey(validateConfigPlugins(bad), 'layout.widgets[0]', 'no-such-widget')
}

// --- a round-level scoring override is checked too -------------------------
{
  const cfg = validConfig()
  const round: Round = {
    id: 'r1',
    title: 'Round 1',
    style: { kind: 'custom', plugin: TEST_STYLE, options: {} },
    overrides: { rules: { scoring: { engine: 'no-such-round-scoring' } } },
  }
  const bad: GameShowConfig = { ...cfg, program: { ...cfg.program, rounds: [round] } }
  assertNamesBadKey(validateConfigPlugins(bad), 'program.rounds[0].scoring.engine', 'no-such-round-scoring')
}

console.log('✓ validateConfigPlugins: all checks passed')
