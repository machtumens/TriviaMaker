import { dealQuestions, defaultDraft, feudQuestionsFromBank, shuffleHeats, type Draft } from './draft'
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
