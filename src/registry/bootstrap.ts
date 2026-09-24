import './plugins'
import { register } from './index'
import { localTransport } from '../transport/local'

register('transport', localTransport)
