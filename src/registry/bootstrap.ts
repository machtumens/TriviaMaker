/**
 * BOOTSTRAP — the one file in T1 allowed to import concrete plugins.
 *
 * `registry/index.ts`'s header rule is that the engine depends on interfaces
 * only and never imports a concrete style, scoring engine or transport. That
 * rule needs exactly one exception: something has to put the implementations
 * into the registry. This is it. Import it for its side effect, once, before
 * preflight runs.
 */

import { list, register, validateConfigPlugins } from './index'
import type { GameShowConfig } from '../config/types'
import { gridStyle } from '../styles/grid'
import { flatScoring } from '../scoring/flat'
import { localTransport } from '../transport/local'

register('style', gridStyle)
register('scoring', flatScoring)
register('transport', localTransport)

/**
 * The default `layout.stageLayout`. T1's stage view renders by dispatching on
 * the style's `stageComponent` key, so there is no layout behaviour to attach
 * yet — but `validateConfigPlugins` checks `layout.stageLayout` against this
 * registry for every config, so a marker registration is what lets any config
 * pass preflight at all. Real layout plugins are T2.
 */
register('layout', { key: 'classic' })

/**
 * Preflight, plus the check the registry's own validator cannot make.
 *
 * `validateConfigPlugins` only checks `round.style.plugin`, and only when the
 * kind is `'custom'`. A round declaring a BUILT-IN kind the running build does
 * not implement — `wheel`, `trivia`, `tictac` — sails through preflight and
 * then throws from `resolve()` mid-show, in front of an audience. T1
 * implements exactly one style, so that gap is not hypothetical here.
 *
 * Lives outside `registry/index.ts` deliberately: the T0 contract files are
 * settled and this is a T1 concern.
 */
export function validateConfigPluginsT1(config: GameShowConfig): string[] {
  const errors = [...validateConfigPlugins(config)]
  const registered = list('style')
  const known = registered.join(', ') || '(none registered)'

  config.program.rounds.forEach((round, index) => {
    if (round.style.kind === 'custom') return   // already covered above
    if (registered.includes(round.style.kind)) return
    const where = `program.rounds[${index}].style.kind`
    errors.push(`${where}: unknown style plugin "${round.style.kind}". Registered: ${known}`)
  })

  return errors
}
