import { register, type TransportHandle, type TransportPlugin } from '../registry/index'

const CHANNEL_NAME = 'triviamaker'

type Frame =
  | { kind: 'state'; channel: string; payload: unknown }
  | { kind: 'command'; type: string; payload: unknown }
  | { kind: 'hello' }

type CommandHandler = (command: { from: string; type: string; payload: unknown }) => void

const bus = new BroadcastChannel(CHANNEL_NAME)
const retained = new Map<string, unknown>()
const local = new Map<string, Set<(frame: string) => void>>()
let commandHandler: CommandHandler | null = null

function notifyLocal(channel: string, payload: unknown): void {
  const text = JSON.stringify(payload)
  for (const listener of local.get(channel) ?? []) listener(text)
}

function subscribeLocal(channel: string, listener: (frame: string) => void): () => void {
  let set = local.get(channel)
  if (!set) {
    set = new Set()
    local.set(channel, set)
  }
  set.add(listener)
  return () => set.delete(listener)
}

export const channelTransport: TransportHandle = {
  broadcast(channel, payload) {
    retained.set(channel, payload)
    notifyLocal(channel, payload)
    bus.postMessage({ kind: 'state', channel, payload } satisfies Frame)
  },

  onCommand(handler) {
    commandHandler = handler
  },

  rtt() {
    return 0
  },

  async stop() {
    commandHandler = null
    retained.clear()
  },
}

export const channelTransportPlugin: TransportPlugin = {
  key: 'channel',
  async start() {
    return channelTransport
  },
}

register('transport', channelTransportPlugin)

export function serveCommands(): void {
  bus.addEventListener('message', event => {
    const frame = event.data as Frame
    if (frame.kind === 'hello') {
      for (const [channel, payload] of retained) {
        bus.postMessage({ kind: 'state', channel, payload } satisfies Frame)
      }
      return
    }
    if (frame.kind === 'command') {
      commandHandler?.({ from: 'host', type: frame.type, payload: frame.payload })
    }
  })
}

export function installStageShim(): void {
  const listeners = new Set<(frame: string) => void>()

  bus.addEventListener('message', event => {
    const frame = event.data as Frame
    if (frame.kind !== 'state' || frame.channel !== 'stage') return
    const text = JSON.stringify(frame.payload)
    for (const listener of listeners) listener(text)
  })

  class ChannelEventSource extends EventTarget {
    private readonly listener: (frame: string) => void

    constructor() {
      super()
      this.listener = frame => {
        this.dispatchEvent(new MessageEvent('message', { data: frame }))
      }
      listeners.add(this.listener)
      bus.postMessage({ kind: 'hello' } satisfies Frame)
    }

    close(): void {
      listeners.delete(this.listener)
    }
  }

  Object.defineProperty(globalThis, 'EventSource', {
    value: ChannelEventSource,
    writable: true,
    configurable: true,
  })
}

export function installHostShim(dispatch: CommandHandler): void {
  class LocalEventSource extends EventTarget {
    private readonly unsubscribe: () => void

    constructor() {
      super()
      const listener = (frame: string) => {
        this.dispatchEvent(new MessageEvent('message', { data: frame }))
      }
      this.unsubscribe = subscribeLocal('host', listener)
      const current = retained.get('host')
      if (current !== undefined) {
        queueMicrotask(() => { listener(JSON.stringify(current)) })
      }
    }

    close(): void {
      this.unsubscribe()
    }
  }

  Object.defineProperty(globalThis, 'EventSource', {
    value: LocalEventSource,
    writable: true,
    configurable: true,
  })

  const realFetch = globalThis.fetch.bind(globalThis)
  Object.defineProperty(globalThis, 'fetch', {
    value: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('/command')) return realFetch(input, init)
      try {
        const body = JSON.parse(String(init?.body ?? '{}')) as { type?: string; payload?: unknown }
        dispatch({ from: 'host', type: String(body.type), payload: body.payload })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return new Response(JSON.stringify({ error: message }), { status: 500 })
      }
    },
    writable: true,
    configurable: true,
  })
}
