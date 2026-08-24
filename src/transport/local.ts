/**
 * LOCAL TRANSPORT — one `node:http` server, zero dependencies. Key: `'local'`.
 *
 * Serves three things on one port for the whole show:
 *   - `GET /events/{stage,host}` — Server-Sent Events, one stream per channel.
 *   - `POST /command`            — host commands, gated on a session token.
 *   - `GET /*`                   — the built stage and host bundles.
 *
 * Static files are served by this process rather than a dev server because a
 * dev server is one more thing that can die twenty minutes into a live event.
 *
 * SECURITY NOTES (both deliberate, both bounded by the local-LAN threat model):
 *   - Every static path is resolved and prefix-checked against `staticDir`.
 *     Without that, anything on the venue wifi could read the host's disk.
 *   - The token comparison is a plain string compare, not constant-time. With a
 *     122-bit `crypto.randomUUID()` secret on a LAN for the length of one show,
 *     a timing side-channel is not a credible attack. Revisit if this transport
 *     is ever exposed beyond the venue network.
 */

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Socket } from 'node:net'
import type { TransportHandle, TransportPlugin } from '../registry/index'

type Channel = 'stage' | 'host' | 'player'
type CommandHandler = (cmd: { from: string; type: string; payload: unknown }) => void

export interface LocalTransportOptions {
  /** 0 (the default) asks the OS for an ephemeral port. */
  port?: number
  /** Session secret every `POST /command` must present. */
  hostToken: string
  /** Directory the built bundles are served from. */
  staticDir?: string
}

export interface LocalTransportHandle extends TransportHandle {
  /** The port actually bound — meaningful when `port: 0` was requested. */
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

/**
 * Friendly URLs for the built entry points. Vite mirrors each entry's path
 * under `dist/`, so these keep the printed host/stage URLs short and typeable
 * on a phone at the back of a hall.
 */
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
  /**
   * The most recent frame per channel, replayed to a client the moment it
   * connects. Without this a projector opened mid-show sits blank until the
   * host happens to do something — SSE has no concept of "current value".
   */
  const retained: Record<Channel, string | null> = { stage: null, host: null, player: null }
  let commandHandler: CommandHandler | null = null

  function openStream(channel: Channel, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    // Opening comment flushes headers so the client's `open` event fires now.
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
    // Strip leading slashes so the request is always resolved RELATIVE to the
    // static root; `path.resolve(root, '/etc/passwd')` would otherwise return
    // the absolute path unchanged.
    const relativeRequest = alias ?? decoded.replace(/^\/+/, '')
    const resolved = path.resolve(staticRoot, relativeRequest)

    // Containment check: anything that escapes the root is refused outright.
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

    // Compensated buzz arbitration is T3+; nothing in T1 reads this.
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
        // SSE responses hold their sockets open; close() alone would hang.
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
