# TriviaMaker

**[Play the demo →](https://machtumens.github.io/TriviaMaker/)** — the real engine
running entirely in your browser.

A configurable game show engine. Runs a Jeopardy-style quiz off a laptop on
local wifi — projector on one screen, host controls on another device.

Built for live events: no internet at runtime, no accounts, no player app.

## Quick start

```bash
npm install
npm run build
npm run show presets/assembly-show.ts
```

It prints two URLs:

```
Stage: http://192.168.1.10:8080/stage.html
Host:  http://192.168.1.10:8080/host.html?token=...
```

Put **Stage** on the projector and open **Host** on your phone. The host link
carries the session token, so keep it off the screen.

Omit the preset argument for a shorter demo show.

## The two views

**Stage** is read-only. Board, current question, timer, scoreboard. It never
receives the answer key: `src/engine/broadcast.ts` redacts every payload before
handing it to the transport. `node scripts/check-stage-host-isolation.mjs` fails
if anything under `src/stage/` imports host code — run it yourself, it is a
source-level scan and is not wired into `npm run build`.

**Host** shows the answers, plus controls: pick a tile, arm, mark correct or
wrong, undo, advance the round, end the show.

Undo reverses a whole action in one press. Marking an answer changes a score,
consumes a tile and moves the phase; one press puts all three back.

## Writing a show

Shows are typed config files under `presets/`. Copy `assembly-show.ts` and
edit it. `demo-t1.ts` is a shorter smoke test; `school-assembly.example.ts`
exercises features this build does not implement yet and will not start. See [CUSTOMIZATION.md](CUSTOMIZATION.md) for the full surface —
themes, rules, scoring, timers, teams — and for what a style plugin must do.

Round-level overrides are deep-merged over the event config, so a
double-points round is config, not code:

```ts
overrides: {
  rules: { scoring: { multiplier: 2 }, timer: { questionSec: 20 } },
  theme: { color: { accent: '#ff6b35' } },
}
```

The one setting worth tuning for your room is `theme.type.baseSize`. Every
font size is a multiple of it.

## The demo

[machtumens.github.io/TriviaMaker](https://machtumens.github.io/TriviaMaker/) runs
the actual engine client-side — same phase machine, same scoring, same undo. It
swaps the Node transport for an in-memory one, which is the plugin seam working
as intended.

It is a demo, not the product. Everything is in one browser tab and the answers
are in the bundle, so it can only ever show sample content. A real show runs the
server, keeps the answer key on the host device, and puts nothing but the board
on the projector.

## Project layout

```
src/config/     schema, defaults, the merge cascade, redaction
src/engine/     phase machine, intents, event log and undo, broadcast
src/registry/   plugin interfaces and registration
src/styles/     board formats (grid)
src/scoring/    scoring engines (flat)
src/transport/  local HTTP server, SSE down, POST up
src/stage/      projector view
src/host/       host controller
presets/        shows
```

## Development

```bash
npm run typecheck
npm test
npm run build
node scripts/check-stage-host-isolation.mjs
```

Tests are plain scripts using `node:assert`; there is no test framework.

## Status

Grid rounds, flat scoring, multi-round programs with intros, intermissions,
score carry and elimination, host-manual adjudication. Buzzers and audience
devices are not implemented — the config models them, the engine does not
serve them yet.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and what is
deliberately left out.

## License

MIT
