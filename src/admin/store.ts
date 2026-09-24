import { newRound, saveDraft, type Draft, type DraftRound } from './draft'
import { freshDraft, loadOrSeed } from './seed'

/**
 * One mutable draft, shared by every panel. Panels mutate it in place and then
 * say which kind of repaint they need:
 *
 *   refresh()  — a value changed. Save, re-check, repaint the preview. The panel
 *                itself is left alone, because rebuilding it mid-keystroke would
 *                take the focus out of the field being typed into.
 *   rerender() — the shape changed (a row added, a tab switched). Rebuild it all.
 */

export type Tab = 'show' | 'rounds' | 'questions' | 'teams' | 'look' | 'motion' | 'words'

interface StudioState {
  draft: Draft
  tab: Tab
  round: number
}

export { freshDraft }

export const state: StudioState = {
  draft: loadOrSeed(),
  tab: 'show',
  round: 0,
}

let onRefresh: () => void = () => {}
let onRerender: () => void = () => {}

export function bind(refreshFn: () => void, rerenderFn: () => void): void {
  onRefresh = refreshFn
  onRerender = rerenderFn
}

export function refresh(): void {
  saveDraft(state.draft)
  onRefresh()
}

export function rerender(): void {
  onRerender()
}

export function replaceDraft(next: Draft): void {
  state.draft = next
  state.round = Math.min(state.round, next.rounds.length - 1)
}

/** The round every panel is currently working on. Never undefined — a draft
 *  without rounds grows one rather than leaving the screen empty. */
export function currentRound(): DraftRound {
  if (state.draft.rounds.length === 0) state.draft.rounds.push(newRound(0))
  state.round = Math.min(Math.max(0, state.round), state.draft.rounds.length - 1)
  return state.draft.rounds[state.round]!
}

export function goTo(tab: Tab, round?: number): void {
  state.tab = tab
  if (round !== undefined) state.round = round
  rerender()
}
