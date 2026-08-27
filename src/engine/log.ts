/**
 * EVENT LOG + GENERIC UNDO — Design Locks L2, L2a, L3, L4.
 *
 * The whole undo mechanism is ONE function and ONE data table. There is no
 * hand-written inverse for any intent type, and adding a new intent type never
 * requires writing undo code — only a row in `INTENT_TOUCHED_KEYS`.
 *
 * L2a, the load-bearing rule: undo operates per HOST ACTION, not per intent.
 * One host press ("mark correct") is 2-3 intents. `applyIntentsWithLog`
 * snapshots the UNION of every key those intents can touch ONCE, against the
 * PRE-BATCH state, then applies them all, then appends exactly ONE event.
 *
 * A per-intent loop that re-snapshots after each `applyIntent` looks identical
 * in casual testing and is silently wrong: the 2nd and 3rd snapshots capture
 * already-mutated values, so one undo press only rewinds part of the action and
 * the host has to guess how many more times to press. Do not refactor this into
 * a loop over single intents.
 */

import type { GameEvent, Intent, SessionState } from '../registry/index'
import type { GameEventName } from '../config/types'
import { INTENT_TOUCHED_KEYS, applyIntent } from './intents'

/**
 * Intent -> event name (L4). `GameEventName` is a closed union in the settled
 * T0 contract, so several intents have no exact member and use a documented
 * best-fit fallback. This only affects which `integration.hooks` subscriptions
 * fire — `undo()` and dispute-audit read `payload`/`undo`, never `name`.
 */
export const INTENT_EVENT_NAMES: Record<Intent['type'], GameEventName> = {
  setPhase: 'phase.changed',
  awardPoints: 'score.changed',
  consumeQuestion: 'question.revealed',
  selectQuestion: 'question.selected',
  setTurn: 'phase.changed',        // fallback — no exact match exists
  lockout: 'buzz.locked',
  startClock: 'question.armed',
  stopClock: 'question.armed',     // fallback
  playSound: 'phase.changed',      // fallback, weakest — presentation-only
  effect: 'phase.changed',         // fallback, weakest
  eliminate: 'round.ended',        // fallback — closest semantic fit
  setStyleState: 'phase.changed',  // fallback — no exact member for opaque style writes
  advanceRound: 'round.started',   // exact match — one previously-unreachable member
  custom: 'phase.changed',         // fallback — payload.key differentiates
}

/** Used only when a batch carries no intents at all; see `applyIntentsWithLog`. */
const EMPTY_BATCH_EVENT_NAME: GameEventName = 'phase.changed'

/** Marks a synthetic reversal event in `GameEvent.payload`. */
const REVERSAL_OF = 'reversalOf'

/**
 * Apply one whole host action and append exactly ONE event for it.
 *
 * `session.ts`'s `dispatchHostAction` is the only caller anywhere in the
 * codebase — see Design Lock L16. Never call this per-intent in a loop.
 */
export function applyIntentsWithLog(
  state: SessionState,
  intents: Intent[],
  seq: number,
  at: number,
): { state: SessionState; event: GameEvent } {
  // 1. Union of every key this whole batch can touch.
  const touched = new Set<keyof SessionState>()
  for (const intent of intents) {
    for (const key of INTENT_TOUCHED_KEYS[intent.type]) touched.add(key)
  }

  // 2. Snapshot from the ORIGINAL state, BEFORE applying anything. Order is
  //    load-bearing — see the file header.
  const undoPatch: Record<string, unknown> = {}
  for (const key of touched) undoPatch[key] = state[key]

  // 3. Apply every intent in order, threading state through.
  let next = state
  for (const intent of intents) next = applyIntent(next, intent)

  // 4. Name the event after the LAST intent (display/subscription hint only).
  const lastIntent = intents[intents.length - 1]
  const name = lastIntent ? INTENT_EVENT_NAMES[lastIntent.type] : EMPTY_BATCH_EVENT_NAME

  // 5. Keep the full ordered intent list so a score dispute can be replayed
  //    exactly, not just the last step of the action.
  const event: GameEvent = {
    seq,
    at,
    name,
    payload: { intents: intents.map(intent => ({ ...intent })) },
    undo: undoPatch,
  }

  // 6/7. Append-only log; exactly one event regardless of `intents.length`.
  return { state: { ...next, log: [...next.log, event] }, event }
}

function isReversal(event: GameEvent): boolean {
  return event.payload[REVERSAL_OF] !== undefined
}

function reversedSeqs(log: readonly GameEvent[]): Set<number> {
  const seqs = new Set<number>()
  for (const event of log) {
    const target = event.payload[REVERSAL_OF]
    if (typeof target === 'number') seqs.add(target)
  }
  return seqs
}

function nextSeq(log: readonly GameEvent[]): number {
  const last = log[log.length - 1]
  return (last?.seq ?? 0) + 1
}

/**
 * Reverse the most recent un-reversed host action within the last `depth`
 * log entries.
 *
 * The log is never rewritten: the original event stays exactly where it was and
 * a synthetic reversal event is APPENDED (L3). A host who undoes an award and
 * is later challenged on it can still show what happened and that it was undone
 * — deleting the entry would destroy that record.
 *
 * Returns `undone: false` (not an error) when nothing eligible is in range;
 * pressing undo one time too many at the top of a show is normal, not a fault.
 */
export function undo(
  state: SessionState,
  depth: number,
): { state: SessionState; undone: boolean } {
  if (depth <= 0 || state.log.length === 0) return { state, undone: false }

  const alreadyReversed = reversedSeqs(state.log)
  const window = state.log.slice(-depth)

  for (let i = window.length - 1; i >= 0; i--) {
    const candidate = window[i]
    if (!candidate) continue
    if (isReversal(candidate)) continue
    if (alreadyReversed.has(candidate.seq)) continue

    const restored = { ...state, ...(candidate.undo ?? {}) } as SessionState
    const reversal: GameEvent = {
      seq: nextSeq(state.log),
      at: Date.now(),
      name: candidate.name,
      payload: { [REVERSAL_OF]: candidate.seq },
    }
    return {
      state: { ...restored, log: [...state.log, reversal] },
      undone: true,
    }
  }

  return { state, undone: false }
}
