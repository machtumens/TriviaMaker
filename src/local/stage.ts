import { installStageShim } from './channel'

installStageShim()

await import('../stage/main')
