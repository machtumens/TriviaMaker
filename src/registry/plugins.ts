import { register } from './index'
import { gridStyle } from '../styles/grid'
import { listStyle } from '../styles/list'
import { flatScoring } from '../scoring/flat'

register('style', gridStyle)
register('style', listStyle)
register('scoring', flatScoring)
register('layout', { key: 'classic' })
