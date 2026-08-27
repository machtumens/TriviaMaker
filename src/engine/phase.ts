/**
 * PHASE MACHINE — the legal-transition truth table (PLAN Design Lock L1).
 *
 * An unmodelled transition is the named live-event failure mode
 * (ARCHITECTURE.md §5): the show ends up in a state nobody drew, and the only
 * way out is a reload that loses the scores. Making every edge explicit and
 * asserting on transition turns that class of bug into a loud error at the
 * moment it happens instead of a silent wrong screen ten minutes later.
 *
 * The graph is COMPLETE for the fixed `Phase` union even though T1's
 * grid + host-manual path only walks a subset of it. `locked` (buzz input,
 * T3+) and `wager` (a wager-style round, T2+) are reachable in the table but
 * unexercised in T1 — that is intentional, not dead code to prune.
 */

import type { Phase } from '../registry/index'

/** Every legal `from -> to` edge. Design Lock L1. */
export const PHASE_TRANSITIONS: Record<Phase, readonly Phase[]> = {
  lobby: ['roundIntro', 'board'],
  roundIntro: ['board'],
  board: ['reading', 'wager', 'intermission', 'final'],
  reading: ['armed'],
  // locked: buzz path (T3+, unused by T1)
  // adjudicate: host-manual direct call
  // reveal: timeout / no answer
  armed: ['locked', 'adjudicate', 'reveal'],
  locked: ['adjudicate'],
  // wrong + reopen -> armed; correct or attempts exhausted -> reveal
  adjudicate: ['armed', 'reveal'],
  // `roundIntro` (T2.2-L7): the round boundary with no intermission, where the
  // round being entered has its own intro card.
  reveal: ['board', 'intermission', 'roundIntro', 'final'],
  wager: ['reveal'],
  intermission: ['roundIntro', 'board'],
  final: [],
}

export function canTransition(from: Phase, to: Phase): boolean {
  return PHASE_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) {
    throw new Error(`[phase] illegal transition "${from}" -> "${to}"`)
  }
}
