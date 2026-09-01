import type { GameEvent, Intent, SessionState } from '../registry/index'
import type { GameEventName } from '../config/types'
import { INTENT_TOUCHED_KEYS, applyIntent } from './intents'

export const INTENT_EVENT_NAMES: Record<Intent['type'], GameEventName> = {
  setPhase: 'phase.changed',
  awardPoints: 'score.changed',
  consumeQuestion: 'question.revealed',
  selectQuestion: 'question.selected',
  setTurn: 'phase.changed',
  lockout: 'buzz.locked',
  startClock: 'question.armed',
  stopClock: 'question.armed',
  playSound: 'phase.changed',
  effect: 'phase.changed',
  eliminate: 'round.ended',
  setStyleState: 'phase.changed',
  advanceRound: 'round.started',
  custom: 'phase.changed',
}

const EMPTY_BATCH_EVENT_NAME: GameEventName = 'phase.changed'

const REVERSAL_OF = 'reversalOf'

export function applyIntentsWithLog(
  state: SessionState,
  intents: Intent[],
  seq: number,
  at: number,
): { state: SessionState; event: GameEvent } {
  const touched = new Set<keyof SessionState>()
  for (const intent of intents) {
    for (const key of INTENT_TOUCHED_KEYS[intent.type]) touched.add(key)
  }

  const undoPatch: Record<string, unknown> = {}
  for (const key of touched) undoPatch[key] = state[key]

  let next = state
  for (const intent of intents) next = applyIntent(next, intent)

  const lastIntent = intents[intents.length - 1]
  const name = lastIntent ? INTENT_EVENT_NAMES[lastIntent.type] : EMPTY_BATCH_EVENT_NAME

  const event: GameEvent = {
    seq,
    at,
    name,
    payload: { intents: intents.map(intent => ({ ...intent })) },
    undo: undoPatch,
  }

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
