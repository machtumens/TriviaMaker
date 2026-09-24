import {
  dealQuestions, defaultDraft, feudQuestionsFromBank, loadDraft, saveDraft, shuffleHeats,
  type Draft,
} from './draft'
import { readPacketText } from '../config/packet'
import familyFeudCsv from '../../packets/family-feud.csv?raw'

/**
 * The show a browser gets when it has never been here: the shipped question
 * packet, drawn into heats at random and dealt out so no question is used twice.
 *
 * Both the Studio and the host page build it, so opening either link first works
 * — the host never has to visit the Studio to get a runnable show.
 */
export function freshDraft(): Draft {
  const { bank } = readPacketText(familyFeudCsv, 'family-feud.csv')
  const draft = shuffleHeats(defaultDraft())
  return bank ? dealQuestions(draft, feudQuestionsFromBank(bank)) : draft
}

/**
 * The saved show, or a new one — saved immediately.
 *
 * Writing it out at once is the point: the heat draw is made here, and it has to
 * be the same draw whichever page the host opened first. Leaving the fresh draft
 * in memory until the first edit meant the Studio could show one draw and the
 * host page roll a different one.
 */
export function loadOrSeed(): Draft {
  const saved = loadDraft()
  if (saved) return saved

  const fresh = freshDraft()
  saveDraft(fresh)
  return fresh
}
