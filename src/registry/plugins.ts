import { list, register, validateConfigPlugins } from './index'
import type { GameShowConfig } from '../config/types'
import { gridStyle } from '../styles/grid'
import { flatScoring } from '../scoring/flat'

register('style', gridStyle)
register('scoring', flatScoring)
register('layout', { key: 'classic' })

export function validateConfigPluginsT1(config: GameShowConfig): string[] {
  const errors = [...validateConfigPlugins(config)]
  const registered = list('style')
  const known = registered.join(', ') || '(none registered)'

  config.program.rounds.forEach((round, index) => {
    if (round.style.kind === 'custom') return
    if (registered.includes(round.style.kind)) return
    const where = `program.rounds[${index}].style.kind`
    errors.push(`${where}: unknown style plugin "${round.style.kind}". Registered: ${known}`)
  })

  return errors
}
