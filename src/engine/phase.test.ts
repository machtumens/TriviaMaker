/**
 * Phase machine truth table — PLAN Sub-Phase 1 (item 4).
 *
 * Proves the L1 table is what the engine actually enforces: every declared
 * edge is accepted, non-edges are rejected, and `assertTransition` throws with
 * a message that names both ends of the illegal move.
 */

import assert from 'node:assert/strict'
import { PHASE_TRANSITIONS, canTransition, assertTransition } from './phase'
import type { Phase } from '../registry/index'

const ALL_PHASES = Object.keys(PHASE_TRANSITIONS) as Phase[]

// --- every edge in the L1 table is accepted --------------------------------
{
  let edgeCount = 0
  for (const from of ALL_PHASES) {
    for (const to of PHASE_TRANSITIONS[from]) {
      assert.equal(canTransition(from, to), true, `"${from}" -> "${to}" should be legal`)
      assert.doesNotThrow(
        () => assertTransition(from, to),
        `assertTransition should not throw on the legal edge "${from}" -> "${to}"`,
      )
      edgeCount++
    }
  }
  assert.ok(edgeCount > 0, 'the transition table is not empty')
}

// --- T2.2-L7: the round-boundary edge, asserted by name --------------------
// The generic loop above already covers this edge because it iterates the table
// itself. This named assertion is the guard against a future accidental revert
// of the `reveal` row: without it, deleting 'roundIntro' from the table would
// still leave every test in this file green.
{
  assert.equal(
    canTransition('reveal', 'roundIntro'), true,
    'T2.2: reveal -> roundIntro is legal (round boundary with no intermission, next round has an intro)',
  )
}

// --- the table covers the whole Phase union --------------------------------
{
  const EXPECTED_PHASES: Phase[] = [
    'lobby', 'roundIntro', 'board', 'reading', 'armed',
    'locked', 'adjudicate', 'reveal', 'wager', 'intermission', 'final',
  ]
  assert.deepEqual(
    [...ALL_PHASES].sort(),
    [...EXPECTED_PHASES].sort(),
    'every member of the Phase union has a row in the table',
  )
}

// --- non-edges are rejected ------------------------------------------------
{
  const NON_EDGES: Array<[Phase, Phase]> = [
    ['lobby', 'reveal'],
    ['reading', 'board'],
    ['final', 'lobby'],
    ['board', 'armed'],
    ['reveal', 'reading'],
  ]
  for (const [from, to] of NON_EDGES) {
    assert.equal(canTransition(from, to), false, `"${from}" -> "${to}" should be illegal`)
    assert.throws(
      () => assertTransition(from, to),
      new RegExp(`illegal transition "${from}" -> "${to}"`),
      `assertTransition should throw naming "${from}" -> "${to}"`,
    )
  }
}

// --- `final` is terminal ----------------------------------------------------
{
  assert.deepEqual(PHASE_TRANSITIONS.final, [], 'final has no outgoing edges')
  for (const to of ALL_PHASES) {
    assert.equal(canTransition('final', to), false, `final -> "${to}" is illegal`)
  }
}

console.log('✓ phase machine: all checks passed')
