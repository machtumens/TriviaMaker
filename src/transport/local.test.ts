import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { startLocalTransport } from './local'

const HOST_TOKEN = 'test-token-2f4a9c'
const SSE_TIMEOUT_MS = 3000
const STAGE_HTML = '<!doctype html><title>stage fixture</title>'

interface Response { status: number; headers: http.IncomingHttpHeaders; body: string }

function request(
  port: number,
  options: { method?: string; path: string; body?: string },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = String(Buffer.byteLength(options.body))
    }
    const req = http.request(
      { host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers },
      res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      },
    )
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

interface SseClient {
  status: number
  headers: http.IncomingHttpHeaders
  nextFrame(): Promise<string>
  close(): void
}

function openSse(port: number, route: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route }, res => {
      const ready: string[] = []
      let waiting: ((frame: string) => void) | null = null
      let buffer = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        buffer += chunk
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (frame.startsWith('data:')) {
            if (waiting) { const resolveFrame = waiting; waiting = null; resolveFrame(frame) }
            else ready.push(frame)
          }
          boundary = buffer.indexOf('\n\n')
        }
      })
      resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        nextFrame: () => new Promise<string>((resolveFrame, rejectFrame) => {
          const buffered = ready.shift()
          if (buffered !== undefined) { resolveFrame(buffered); return }
          waiting = resolveFrame
          setTimeout(() => rejectFrame(new Error('timed out waiting for an SSE frame')), SSE_TIMEOUT_MS).unref()
        }),
        close: () => req.destroy(),
      })
    })
    req.on('error', reject)
    req.end()
  })
}

const staticDir = await mkdtemp(path.join(tmpdir(), 'triviamaker-static-'))
await mkdir(path.join(staticDir, 'stage'), { recursive: true })
await writeFile(path.join(staticDir, 'stage', 'index.html'), STAGE_HTML)

const received: Array<{ from: string; type: string; payload: unknown }> = []
const handle = await startLocalTransport({ port: 0, hostToken: HOST_TOKEN, staticDir })
handle.onCommand(cmd => { received.push(cmd) })

try {
  assert.ok(handle.port > 0, 'an ephemeral port was bound')
  assert.equal(handle.rtt('anyone'), 0, 'rtt is a documented stub in T1')

  {
    const noToken = await request(handle.port, {
      method: 'POST', path: '/command',
      body: JSON.stringify({ type: 'markCorrect', payload: { teamId: 'a' } }),
    })
    assert.equal(noToken.status, 401, 'a command without a token is rejected')
    assert.match(noToken.body, /invalid host token/, 'the rejection says why')

    const wrongToken = await request(handle.port, {
      method: 'POST', path: '/command',
      body: JSON.stringify({ type: 'markCorrect', payload: {}, token: 'not-the-token' }),
    })
    assert.equal(wrongToken.status, 401, 'a forged token is rejected')
    assert.equal(received.length, 0, 'the command handler was never invoked')
  }

  {
    const ok = await request(handle.port, {
      method: 'POST', path: '/command',
      body: JSON.stringify({ type: 'select', payload: { questionId: 'q1' }, token: HOST_TOKEN }),
    })
    assert.equal(ok.status, 200, 'a valid command is accepted')
    assert.equal(received.length, 1, 'the handler ran exactly once')
    assert.equal(received[0]?.type, 'select', 'the command type is passed through')
    assert.equal(received[0]?.from, 'host', 'commands are attributed to the host')
    assert.deepEqual(received[0]?.payload, { questionId: 'q1' }, 'the payload is passed through')
  }

  {
    const badJson = await request(handle.port, { method: 'POST', path: '/command', body: 'not json' })
    assert.equal(badJson.status, 400, 'a non-JSON body is a client error')
    const noType = await request(handle.port, {
      method: 'POST', path: '/command', body: JSON.stringify({ token: HOST_TOKEN }),
    })
    assert.equal(noType.status, 400, 'a command with no type is a client error')
    assert.equal(received.length, 1, 'neither reached the handler')
  }

  {
    const stage = await openSse(handle.port, '/events/stage')
    assert.equal(stage.status, 200, 'the stage stream opened')
    assert.match(String(stage.headers['content-type']), /text\/event-stream/, 'served as SSE')
    assert.equal(stage.headers['cache-control'], 'no-cache', 'streams are not cached')

    handle.broadcast('stage', { foo: 1 })
    const frame = await stage.nextFrame()
    assert.match(frame, /\{"foo":1\}/, 'the broadcast payload arrived on the stage channel')

    assert.doesNotThrow(() => handle.broadcast('player', { foo: 2 }), 'broadcasting to nobody is fine')
    stage.close()
  }

  {

    handle.broadcast('stage', { round: 'already in progress' })
    const late = await openSse(handle.port, '/events/stage')
    const frame = await late.nextFrame()
    assert.match(frame, /already in progress/, 'the latest state is replayed on connect')
    late.close()
  }

  {
    const page = await request(handle.port, { path: '/stage.html' })
    assert.equal(page.status, 200, 'the stage entry point is served')
    assert.equal(page.body, STAGE_HTML, 'the built file is served verbatim')
    assert.match(String(page.headers['content-type']), /text\/html/, 'with an html content type')

    const root = await request(handle.port, { path: '/' })
    assert.equal(root.status, 200, 'the bare root serves the stage view')

    const missing = await request(handle.port, { path: '/nope.js' })
    assert.equal(missing.status, 404, 'a missing file is a 404')
  }

  {
    const TRAVERSALS = [
      '/../../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/..%2f..%2f..%2fetc%2fpasswd',
      '/stage/../../../../etc/passwd',
    ]
    for (const target of TRAVERSALS) {
      const res = await request(handle.port, { path: target })

      assert.ok(
        res.status === 403 || res.status === 404,
        `"${target}" must be refused with 403/404, never 200 (got ${res.status})`,
      )
      assert.equal(res.body.includes('root:'), false, `"${target}" must not leak file content`)
    }
  }
} finally {
  await handle.stop()
  await rm(staticDir, { recursive: true, force: true })
}

{
  await assert.rejects(
    () => request(handle.port, { path: '/stage.html' }),
    /ECONNREFUSED|socket hang up/,
    'after stop() the port is closed, not merely idle',
  )
}

console.log('✓ local transport: all checks passed')
