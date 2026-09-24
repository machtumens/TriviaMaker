// Static so the projector window gets a <link> in its head rather than waiting
// for the dynamic import below to pull the stylesheet in.
import '../stage/stage.css'
import { installStageShim } from './channel'

installStageShim()

await import('../stage/main')
