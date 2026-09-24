import type { Phase } from '../registry/index'

export const PHASE_TRANSITIONS: Record<Phase, readonly Phase[]> = {
  lobby: ['roundIntro', 'board'],
  roundIntro: ['board'],
  board: ['reading', 'intermission', 'final'],
  reading: ['armed'],
  armed: ['reveal'],
  reveal: ['board', 'intermission', 'roundIntro', 'final'],
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
