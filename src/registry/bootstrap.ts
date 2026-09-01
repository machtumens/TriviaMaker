import { register } from './index'
import { localTransport } from '../transport/local'

export { validateConfigPluginsT1 } from './plugins'

register('transport', localTransport)
