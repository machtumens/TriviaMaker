import type { GameShowConfigInput } from '../config/types'
import { demo } from '../../presets/demo'

/**
 * The published demo runs the same show as `presets/demo.ts`, so there is one
 * copy of the questions. Only the transport and the type size differ: the whole
 * engine lives in the page, and the board has to read on a phone.
 */
export const demoShow: GameShowConfigInput = {
  ...demo,
  meta: { id: 'demo', title: 'TriviaMaker', subtitle: 'Live demo' },
  runtime: { transport: { driver: 'memory' } },
  theme: { type: { baseSize: 15 } },
}
