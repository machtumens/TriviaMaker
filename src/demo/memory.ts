import { register, type TransportHandle, type TransportPlugin } from '../registry/index'

type Channel = 'stage' | 'host' | 'player'
type Listener = (frame: string) => void

const listeners: Record<Channel, Set<Listener>> = {
  stage: new Set(),
  host: new Set(),
  player: new Set(),
}
const retained: Record<Channel, string | null> = {
  stage: null,
  host: null,
  player: null,
}

let commandHandler: ((command: { from: string; type: string; payload: unknown }) => void) | null = null

export function subscribe(channel: Channel, listener: Listener): () => void {
  listeners[channel].add(listener)
  const current = retained[channel]
  if (current !== null) listener(current)
  return () => listeners[channel].delete(listener)
}

export function dispatch(type: string, payload?: unknown): void {
  commandHandler?.({ from: 'host', type, payload })
}

export const memoryTransport: TransportHandle = {
  broadcast(channel, payload) {
    const frame = JSON.stringify(payload)
    retained[channel as Channel] = frame
    for (const listener of listeners[channel as Channel]) {
      try {
        listener(frame)
      } catch (error) {
        console.error('[demo] a listener threw while rendering a frame', error)
      }
    }
  },

  onCommand(handler) {
    commandHandler = handler
  },

  rtt() {
    return 0
  },

  async stop() {
    for (const channel of Object.keys(listeners) as Channel[]) listeners[channel].clear()
    commandHandler = null
  },
}

export function installEventSourceShim(): void {
  class DemoEventSource extends EventTarget {
    private readonly unsubscribe: () => void

    constructor(url: string) {
      super()
      const channel: Channel = url.includes('host') ? 'host' : 'stage'
      this.unsubscribe = subscribe(channel, frame => {
        this.dispatchEvent(new MessageEvent('message', { data: frame }))
      })
    }

    close(): void {
      this.unsubscribe()
    }
  }

  Object.defineProperty(globalThis, 'EventSource', {
    value: DemoEventSource,
    writable: true,
    configurable: true,
  })
}

export const memoryTransportPlugin: TransportPlugin = {
  key: 'memory',
  async start() {
    return memoryTransport
  },
}

register('transport', memoryTransportPlugin)
