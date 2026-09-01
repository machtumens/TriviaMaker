import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Socket } from 'node:net'
import type { TransportHandle, TransportPlugin } from '../registry/index'

type Channel = 'stage' | 'host' | 'player'
type CommandHandler = (cmd: { from: string; type: string; payload: unknown }) => void

export interface LocalTransportOptions {

  port?: number

  hostToken: string

  staticDir?: string
}

export interface LocalTransportHandle extends TransportHandle {

  readonly port: number
}

const DEFAULT_STATIC_DIR = 'dist'
const MAX_COMMAND_BODY_BYTES = 64 * 1024
const OCTET_STREAM = 'application/octet-stream'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const EVENT_ROUTES: Record<string, Channel> = {
  '/events/stage': 'stage',
  '/events/host': 'host',
}

const STATIC_ALIASES: Record<string, string> = {
  '/': 'stage/index.html',
  '/stage.html': 'stage/index.html',
  '/host.html': 'host/index.html',
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_COMMAND_BODY_BYTES) {
      throw new Error(`[transport:local] command body exceeds ${MAX_COMMAND_BODY_BYTES} bytes`)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function startLocalTransport(
  options: LocalTransportOptions,
): Promise<LocalTransportHandle> {
  const staticRoot = path.resolve(options.staticDir ?? DEFAULT_STATIC_DIR)
  const clients: Record<Channel, Set<http.ServerResponse>> = {
    stage: new Set(),
    host: new Set(),
    player: new Set(),
  }
  const sockets = new Set<Socket>()

  const retained: Record<Channel, string | null> = { stage: null, host: null, player: null }
  let commandHandler: CommandHandler | null = null

  function openStream(channel: Channel, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    res.write(': connected\n\n')
    const current = retained[channel]
    if (current !== null) res.write(current)
    clients[channel].add(res)
    res.on('close', () => { clients[channel].delete(res) })
  }

  async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      sendText(res, 400, 'bad request')
      return
    }

    const alias = STATIC_ALIASES[decoded]

    const relativeRequest = alias ?? decoded.replace(/^\/+/, '')
    const resolved = path.resolve(staticRoot, relativeRequest)

    const fromRoot = path.relative(staticRoot, resolved)
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
      sendText(res, 403, 'forbidden')
      return
    }

    try {
      const file = await readFile(resolved)
      const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? OCTET_STREAM
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': file.byteLength })
      res.end(file)
    } catch {
      sendText(res, 404, 'not found')
    }
  }

  async function handleCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let raw: string
    try {
      raw = await readBody(req)
    } catch {
      sendJson(res, 413, { error: 'command body too large' })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' })
      return
    }
    if (typeof parsed !== 'object' || parsed === null) {
      sendJson(res, 400, { error: 'command must be a JSON object' })
      return
    }

    const command = parsed as { type?: unknown; payload?: unknown; token?: unknown }
    if (typeof command.token !== 'string' || command.token !== options.hostToken) {
      sendJson(res, 401, { error: 'invalid host token' })
      return
    }
    if (typeof command.type !== 'string' || command.type.length === 0) {
      sendJson(res, 400, { error: 'command type is required' })
      return
    }

    try {
      commandHandler?.({ from: 'host', type: command.type, payload: command.payload })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 500, { error: message })
      return
    }
    sendJson(res, 200, { ok: true })
  }

  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/'

    if (req.method === 'GET') {
      const channel = EVENT_ROUTES[pathname]
      if (channel) {
        openStream(channel, res)
        return
      }
      void serveStatic(pathname, res)
      return
    }

    if (req.method === 'POST' && pathname === '/command') {
      void handleCommand(req, res)
      return
    }

    sendText(res, 404, 'not found')
  })

  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket) })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, () => resolve())
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? 0)

  return {
    port,

    broadcast(channel, payload) {
      const frame = `data: ${JSON.stringify(payload)}\n\n`
      retained[channel] = frame
      for (const res of clients[channel]) res.write(frame)
    },

    onCommand(handler) {
      commandHandler = handler
    },

    rtt() {
      return 0
    },

    async stop() {
      for (const channel of Object.keys(clients) as Channel[]) {
        for (const res of clients[channel]) res.end()
        clients[channel].clear()
      }
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))

        for (const socket of sockets) socket.destroy()
        sockets.clear()
      })
    },
  }
}

export const localTransport: TransportPlugin<LocalTransportOptions> = {
  key: 'local',
  start: startLocalTransport,
}
