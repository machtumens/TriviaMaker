---
name: plan:gameshow-engine-t1
description: "T1 PLAN — playable core, host-manual game show engine (phase machine, undo, grid+flat, local transport, stage+host UI)"
date: 24-08-26
feature: general
---

# PLAN — Game Show Engine, T1 (Playable Core, Host-Manual)

**Date**: 24-08-26
**Status**: Draft — pending VALIDATE
**Complexity**: COMPLEX

## TL;DR

Build the T1 tier from the SPEC's Capability Inventory: phase machine, intent
application + generic undo, one style (`grid`), one scoring engine (`flat`), a
zero-dependency local HTTP+SSE transport with host-command auth, and a stage +
host UI — enough that a host can run a complete show end-to-end with zero
player devices. ~20 new files, one modified file (`package.json`), zero files
in `src/config/` or `src/registry/` are modified (only new sibling files added).
Zero new runtime dependencies; Vite is a dev-only build tool. Six build-order
sub-phases from INNOVATE plus one integration sub-phase this plan adds
explicitly (glue entrypoint — see Sub-Phase 7). Sub-Phases 3 and 4 are
parallel-safe; everything else is a straight dependency chain.

---

## Overview

T0 (config schema, cascade resolver, redaction, 12 plugin interfaces,
`school-assembly` preset) is done and typechecks/tests clean. Nothing in
`src/engine/`, `src/styles/`, `src/scoring/`, `src/transport/`, or any UI
exists yet — this is a greenfield build inside the existing config/registry
contracts. This plan implements exactly T1 from the SPEC's Capability
Inventory table and nothing from T2+ (remaining styles/scoring engines,
lifelines, special tiles, hardware/network input).

## Goals

1. A host can author nothing beyond what `school-assembly.ts` already
   demonstrates and run a complete `grid`-style round end-to-end using only
   host-manual adjudication (select → reveal → award/deduct → next), with
   zero player devices connected.
2. Undo reverses the single most recent action in one host interaction, with
   zero hand-written per-intent-type inverse logic.
3. The stage view never receives or renders unredacted question data, proven
   at both the network boundary (redaction) and the bundle boundary (import
   isolation).
4. Host commands cannot be forged by another device on the venue wifi.
5. All four invariants from `CUSTOMIZATION.md` hold, demonstrably, in T1's
   concrete code — not just in the schema that permits them.

## Scope

**In scope:** phase machine, intent application, generic event log + undo,
`grid` style plugin, `flat` scoring plugin, `local` transport plugin (SSE +
POST + host-token auth), stage view, host controller, the integration
entrypoint that boots all of the above into a running show.

**Out of scope (T2+, do not build):** `list`/`trivia`/`wheel`/`tictac`/
`hangman` styles, `speedWeighted`/`multiplier` scoring, streak/comeback
bonuses (config fields exist and default `enabled:false`; `flat` in T1 does
not implement them — see Sub-Phase 3 note), lifelines, special tiles,
`keyboard`/`network` input plugins, buzz arbitration, persistence/resume,
`websocket`/hosted transport. The two D3 contract gaps (style-owned
persistent state) are explicitly not touched.

**Do not modify:** `src/config/types.ts`, `src/registry/index.ts`,
`src/config/resolve.ts`, `src/config/defaults.ts`. All T1 work is new
sibling files that consume these contracts as-is.

---

## Design Locks (read before the checklist — referenced by item, not repeated per item)

These are decisions this PLAN makes to remove ambiguity from EXECUTE. Each is
referenced by short name in the checklist below.

| Lock | Decision |
|---|---|
| **L1 — Phase transition table** | Full 11-state table below. Complete graph per the fixed `Phase` union, even though T1's `grid`+host-manual path only exercises a subset. |
| **L2 — Undo mechanism** | Snapshot-diff, not deep object-diff. Per-intent-type declares WHICH top-level `SessionState` keys it touches (`INTENT_TOUCHED_KEYS`, a data table); ONE generic function snapshots those keys before applying, diffs after, and builds `event.undo`. The "per-type" part is a declaration, never per-type undo code. |
| **L3 — Undo does not delete log entries** | `undo()` reverses the most recent un-reversed event within the last `runtime.undo.depth` entries by applying its `.undo` patch, then APPENDS a new synthetic event (reusing the same `GameEventName` as the action being reversed, payload tagged `{ reversalOf: <seq> }`). The log stays append-only and unbounded; nothing is ever removed from it. |
| **L4 — Intent → GameEventName mapping** | Fixed table in Sub-Phase 2. `GameEventName` is a closed union (do not modify `types.ts`); several intents (`setTurn`, `playSound`, `effect`, `custom`, `stopClock`) have no precise match and use a documented best-fit fallback. This only affects which `integration.hooks` subscriptions fire for those intents — undo and dispute-audit correctness are unaffected because both read `payload`/`undo`, never `name`. Flagged as a real, bounded, non-blocking limitation — see Open Items. |
| **L5 — `flat` scoring omits streak/comeback in T1** | `rules.scoring.streak`/`.comeback` fields exist in config and default `enabled:false`. T1's `flat.ts` does not implement them even when a preset sets `enabled:true` (as `school-assembly.ts` round 2 does) — this is a documented, intentional T1 gap, not a bug. Streak/comeback are T2 scope per the SPEC Capability Inventory. |
| **L6 — Consume/award orchestration lives in `session.ts`, not the style plugin** | `resolveAnswer()` in `session.ts` calls the registered `scoring` plugin, then emits `awardPoints` + `consumeQuestion` + `setPhase` intents generically for every style. `StylePlugin.onResolved()` is reserved for style-SPECIFIC extra consequences only; `grid.onResolved()` returns `[]` in T1. |
| **L7 — Host token, not a `TransportHandle` field** | `TransportHandle` (`src/registry/index.ts:183-190`) is not modified. The app entrypoint (Sub-Phase 7) generates the token and passes it via `options.hostToken` into `transport.start(options)`; `local.ts` reads it from there and validates every POST against it. The token is embedded in the printed host controller URL, never in the stage URL. |
| **L8 — `local` transport serves static files too** | Vite is BUILD-time only in T1 (`vite build` → `dist/stage/`, `dist/host/`). `local.ts`'s `node:http` server serves those built files for GET requests that don't match `/events/*` or `/command`, using `node:fs` + a small extension→content-type map. One process, one port, for the whole show — no dependency on a dev server surviving the live event. |
| **L9 — Redaction has exactly one call site** | A single `broadcastState(handle, state, config)` helper in `src/engine/broadcast.ts` is the ONLY place that calls `handle.broadcast(...)`. It calls `redactQuestion(q, 'stage')` / `redactQuestion(q, 'player')` before broadcasting to those channels, and sends the full state unredacted to `'host'`. This minimizes the surface where redaction could be forgotten to one function. |
| **L10 — `createSession` uses `structuredClone`** | `createSession(config, ...)` deep-copies the resolved config into `SessionState.config` via Node's built-in `structuredClone` (zero new deps) — proves `snapshotContentAtLaunch` structurally, not by convention. |
| **L11 — Test runner stays framework-free** | Adding 8 new `*.test.ts` files pushes the project past `all-tests.md`'s documented 8-file Vitest-migration trigger (9 total after T1). This PLAN does NOT introduce Vitest (would add a dependency without an explicit argument beyond "file count"). Instead: `scripts/run-tests.mjs`, a small zero-dependency aggregator that discovers `**/*.test.ts` under `src/`, dynamically imports each, and reports PASS/FAIL per file with a non-zero exit on any failure. `package.json`'s `test` script becomes `tsx scripts/run-tests.mjs`. Flagged in Test Infra Improvement Notes for a future Vitest re-evaluation if T2 adds significantly more files. |

### L1 — Full phase transition table

```
lobby        -> [roundIntro, board]
roundIntro   -> [board]
board        -> [reading, wager, intermission, final]
reading      -> [armed]
armed        -> [locked, adjudicate, reveal]   // locked: buzz path (T3+, unused by T1); adjudicate: host-manual direct call; reveal: timeout/no answer
locked       -> [adjudicate]
adjudicate   -> [armed, reveal]                // wrong + reopen -> armed; correct or attempts exhausted -> reveal
reveal       -> [board, intermission, final]
wager        -> [reveal]
intermission -> [roundIntro, board]
final        -> []                              // terminal
```

T1's `grid` + host-manual exercised path: `lobby -> board -> reading -> armed
-> adjudicate -> reveal -> board (loop) -> final`. `locked` and `wager` are
reachable in the table (satisfying "core phase set is fixed") but not
exercised by any T1 style or test — they activate once buzz input (T3+) or a
wager-style round exists.

---

## Touchpoints

| Path | Change | Depends on |
|---|---|---|
| `src/engine/phase.ts` | NEW | — |
| `src/engine/phase.test.ts` | NEW | phase.ts |
| `src/engine/intents.ts` | NEW | phase.ts |
| `src/engine/intents.test.ts` | NEW | intents.ts |
| `src/engine/log.ts` | NEW | intents.ts |
| `src/engine/log.test.ts` | NEW | log.ts |
| `src/engine/broadcast.ts` | NEW | resolve.ts (`redactQuestion`), registry types |
| `src/engine/session.ts` | NEW | phase.ts, intents.ts, log.ts, registry `resolve()` |
| `src/engine/session.test.ts` | NEW | session.ts |
| `src/engine/host-manual-round.test.ts` | NEW | session.ts, grid.ts, flat.ts |
| `src/styles/grid.ts` | NEW | registry types |
| `src/styles/grid.test.ts` | NEW | grid.ts |
| `src/scoring/flat.ts` | NEW | registry types |
| `src/scoring/flat.test.ts` | NEW | flat.ts |
| `src/transport/local.ts` | NEW | registry types |
| `src/transport/local.test.ts` | NEW | local.ts |
| `src/registry/bootstrap.ts` | NEW (does not modify `index.ts`) | grid.ts, flat.ts, local.ts, `register()` |
| `src/registry/validateConfigPlugins.test.ts` | NEW (does not modify `index.ts`) | bootstrap.ts |
| `src/stage/main.ts`, `src/stage/index.html` | NEW | broadcast.ts payload shape |
| `src/host/main.ts`, `src/host/index.html` | NEW | local.ts `/command` contract |
| `src/server.ts` | NEW (integration entrypoint) | everything above |
| `vite.config.ts` | NEW | stage/host entry points |
| `scripts/run-tests.mjs` | NEW | — |
| `scripts/check-stage-host-isolation.mjs` | NEW | — |
| `package.json` | MODIFIED | add `vite` devDependency; `test`/`build`/`show` scripts |

`tsconfig.json` needs **no change** — `include: ["src/**/*", "presets/**/*"]`
already covers every new directory.

## Public Contracts

- **`local` transport HTTP API** (new, first concrete implementation of
  `TransportPlugin`): `GET /events/stage`, `GET /events/host` (SSE),
  `POST /command` (`{ type, payload, token }`, 401 without/with-wrong token),
  `GET /*` static file serving from `dist/`. This is what the host controller
  and stage view depend on — treat it as a real contract even though it is
  local-only.
- **`grid` style plugin**, registered under key `'grid'` — any future preset
  can reference `style: { kind: 'grid' }` and get this implementation.
- **`flat` scoring plugin**, registered under key `'flat'` — same, via
  `rules.scoring.engine: 'flat'`.
- **`session.ts` engine API** — `createSession`, `applyIntent`, `undo`,
  `resolveAnswer`, used by `server.ts` and (indirectly, via HTTP) the host
  controller. This is the new internal API surface EXECUTE and later tiers
  build on.

No public contract touches auth/identity, billing, schema/migration, or an
externally-reachable API — the host token is a local-LAN session secret, not
user authentication, and does not cross the SPEC's out-of-scope line.

## Blast Radius

~24 new files across 7 new top-level directories (`src/engine`, `src/styles`,
`src/scoring`, `src/transport`, `src/stage`, `src/host`, `scripts`) plus
`vite.config.ts` at the root; one modified file (`package.json`, additive
only — new devDependency + new/changed scripts, no existing script behavior
removed except `test`'s underlying command, which is upgraded to run a
strict superset of what it runs today). Zero files under `src/config/` or
`src/registry/index.ts` are touched. Risk class: none of auth/identity,
billing/credits, schema/migration, or public external API — this is a
greenfield local-LAN build inside settled contracts. Highest actual risk is
correctness of the generic undo diff and the redaction call-site discipline
(L9), both covered by dedicated fully-automated gates below.

---

## Four Invariants — how T1 preserves each

| # | Invariant | How T1 enforces it | Where |
|---|---|---|---|
| 1 | Stage stays playable with zero players connected | T1 has no input plugin at all — no player-device dependency exists anywhere in the T1 code path. Additionally, `stage/main.ts`'s `EventSource` relies on the browser's native auto-reconnect and must NOT clear rendered DOM on a dropped connection — it keeps showing last-known state until the next message arrives. | Structural (no input plugin exists) + Sub-Phase 5 checklist item |
| 2 | Content snapshotted at launch | `createSession` uses `structuredClone(config)` (L10) — a true deep copy, not a reference or shallow spread. | `session.ts`, proven by `session.test.ts` |
| 3 | Scoring plugins are pure | `flat.score()` never assigns to `input.state` or any nested object; test harness passes a deep-frozen `state` so any mutation attempt throws immediately rather than silently succeeding. | `flat.ts`, proven by `flat.test.ts` |
| 4 | Answers redacted at the transport boundary | Exactly one call site (`broadcastState`, L9) ever calls `handle.broadcast(...)`; it redacts before writing to `'stage'`/`'player'` channels. Reinforced independently by import-boundary isolation (stage bundle never imports `src/host/*`). | `broadcast.ts` + `scripts/check-stage-host-isolation.mjs` |

---

## Implementation Checklist

### Sub-Phase 0 — `validateConfigPlugins` test coverage (independent, run first)

Closes the SPEC-flagged gap (SPEC AC#3, Open Questions) with zero dependency
on any other sub-phase.

1. Create `src/registry/validateConfigPlugins.test.ts`. Assert: (a) a config
   referencing an unregistered `runtime.transport.driver` produces an error
   string naming the bad key and listing registered alternatives; (b) same
   for `rules.scoring.engine`, `layout.stageLayout`, a `custom`-kind round
   style's `plugin`, a lifeline's `plugin`, an `integration.hooks[].plugin`,
   and a `layout.widgets[].plugin`; (c) a fully valid config (using keys
   registered by `bootstrap.ts` in Sub-Phase 3/4) produces an empty error
   array. Register nothing globally in this test file beyond a throwaway
   local `register()` call scoped to a fake `RegistryKind` string so this
   test has no ordering dependency on `bootstrap.ts` having run.
2. Run `npx tsx src/registry/validateConfigPlugins.test.ts` — must exit 0.

### Sub-Phase 1 — Phase machine (no dependencies)

3. Create `src/engine/phase.ts`. Export `PHASE_TRANSITIONS` exactly as L1
   above (`Record<Phase, readonly Phase[]>`). Export
   `canTransition(from: Phase, to: Phase): boolean`. Export
   `assertTransition(from: Phase, to: Phase): void` — throws
   `Error('[phase] illegal transition "${from}" -> "${to}"')` when
   `canTransition` is false.
4. Create `src/engine/phase.test.ts`. Assert every edge in L1's table is
   accepted by `canTransition`; assert at least 3 non-edges are rejected
   (e.g. `lobby -> reveal`, `reading -> board`, `final -> lobby`); assert
   `assertTransition` throws on a rejected pair and does not throw on an
   accepted one.
5. Run `npx tsx src/engine/phase.test.ts` — must exit 0.

### Sub-Phase 2 — Intent application + event log + generic undo (depends on 1)

6. Create `src/engine/intents.ts`. Export `INTENT_TOUCHED_KEYS: Record<Intent['type'], (keyof SessionState)[]>`
   per this table:

   | Intent type | Touched `SessionState` keys |
   |---|---|
   | `setPhase` | `phase` |
   | `awardPoints` | `teams` |
   | `consumeQuestion` | `consumed`, `phase` |
   | `selectQuestion` | `currentQuestionId`, `phase` |
   | `setTurn` | `turnTeamId` |
   | `lockout` | `lockedOutTeamIds` |
   | `startClock` | `clockStartedAt` |
   | `stopClock` | `clockStartedAt` |
   | `playSound` | *(none — presentation-only, no state touched)* |
   | `effect` | *(none)* |
   | `eliminate` | `teams` |
   | `custom` | *(none by default — no generic way to know; document as a known limitation, see Open Items)* |

   Export `applyIntent(state: SessionState, intent: Intent): SessionState` —
   pure function, returns a NEW object (spread the unchanged top-level keys,
   replace only the touched ones). For `setPhase`, call
   `assertTransition(state.phase, intent.phase)` first. For `consumeQuestion`,
   add to a NEW `Set` built from `state.consumed` (never mutate the existing
   `ReadonlySet`). For `awardPoints`/`eliminate`, return a NEW `teams` array
   with the matching team replaced by a NEW object (immutable-update pattern
   per `process/development-protocols/implementation-standards.md`).
7. Create `src/engine/intents.test.ts`. One assertion block per intent type
   in the table above: apply, assert the touched key(s) changed and every
   OTHER top-level key is reference-equal (`===`) to the input state's value
   (proves untouched keys are never copied/reallocated). Assert `setPhase`
   with an illegal target throws via `assertTransition`.
8. Create `src/engine/log.ts`. Export
   `applyIntentWithLog(state: SessionState, intent: Intent, seq: number, at: number): { state: SessionState; event: GameEvent }`:
   snapshot `state[key]` for every `key` in `INTENT_TOUCHED_KEYS[intent.type]`
   BEFORE calling `applyIntent`, build `event.undo = { ...snapshotted keys }`,
   map `intent.type` to `name: GameEventName` via the L4 table below, append
   the new event to `state.log` (new array, log stays append-only), return
   `{ state: newStateWithLog, event }`.

   **L4 — Intent → `GameEventName` mapping (fixed, closed union, do not add
   new members to `types.ts`):**

   | Intent type | `GameEventName` used |
   |---|---|
   | `setPhase` | `'phase.changed'` |
   | `awardPoints` | `'score.changed'` |
   | `consumeQuestion` | `'question.revealed'` |
   | `selectQuestion` | `'question.selected'` |
   | `setTurn` | `'phase.changed'` *(fallback — no exact match exists)* |
   | `lockout` | `'buzz.locked'` |
   | `startClock` | `'question.armed'` |
   | `stopClock` | `'question.armed'` *(fallback)* |
   | `playSound` | `'phase.changed'` *(fallback, weakest — presentation-only)* |
   | `effect` | `'phase.changed'` *(fallback, weakest)* |
   | `eliminate` | `'round.ended'` *(fallback — closest semantic fit)* |
   | `custom` | `'phase.changed'` *(fallback — payload.key differentiates for readers)* |

9. Export `undo(state: SessionState, depth: number): { state: SessionState; undone: boolean }`
   from `log.ts`: scan `state.log.slice(-depth)` from the end for the most
   recent event that is NOT itself a reversal (`payload.reversalOf` absent)
   AND has no LATER event in the full log with `payload.reversalOf` equal to
   its `seq` (i.e. not already reversed). If found: apply its `.undo` patch
   to reconstruct those top-level keys, APPEND a new synthetic event with the
   SAME `name` as the reversed event and `payload: { reversalOf: <seq> }`
   (per L3 — never delete from `log`), return `{ state: newState, undone: true }`.
   If nothing eligible within the depth window: return
   `{ state, undone: false }` (no-op, not an error).
10. Create `src/engine/log.test.ts`. Cases: (a) apply `awardPoints` then
    `undo` — assert the team's score is back to its pre-award value AND
    `log.length` is 2 (original + reversal), never 1; (b) apply N events
    where N > `depth`, undo `depth` times, assert the (N-depth)th event from
    the start is never reachable by undo (returns `undone:false` on the next
    attempt); (c) undo on an empty log returns `undone:false`.
11. Run `npx tsx src/engine/intents.test.ts src/engine/log.test.ts` (or run
    individually) — both must exit 0.

### Sub-Phase 3 — `grid` style + `flat` scoring (depends on 2; parallel-safe with 4)

12. Create `src/styles/grid.ts`. Implement `StylePlugin<GridStyle>` with
    `key: 'grid'`. `buildBoard(round, options)`: one `BoardModel` cell per
    `(row, col)` where `row` indexes `options.pointLadder` and `col` indexes
    the round's questions-per-category (derive from `round.categoryIds` +
    the resolved question bank passed in via `options` — options is the
    resolved `GridStyle` config object itself, per the registry's generic
    `O` type param); `cells[].consumed` is computed from `state.consumed`,
    NOT stored separately. `availableQuestions(state, board)`: cell
    `questionId`s where `!state.consumed.has(id)`. `onSelect(state, questionId)`:
    return `[{type:'selectQuestion', questionId}, {type:'setPhase', phase:'reading'}]`.
    `onResolved(state, correct)`: return `[]` per L6 — grid has no
    style-specific extra consequences in T1. `isRoundComplete(state, board)`:
    true iff every cell's `questionId` is in `state.consumed`. Set
    `stageComponent`/`hostComponent` to placeholder string keys
    (`'grid-board'`/`'grid-host-board'`) — Sub-Phases 5/6 render by
    switching on these strings.
13. Create `src/styles/grid.test.ts`. Assert `buildBoard` cell count equals
    `columns * rows` for a fixture `GridStyle`; assert `availableQuestions`
    excludes a pre-consumed id; assert `onSelect` returns exactly the two
    intents above in order; assert `isRoundComplete` is false with one cell
    unconsumed and true when all are consumed.
14. Create `src/scoring/flat.ts`. Implement `ScoringPlugin` with
    `key: 'flat'`. `score(input)`: if `input.correct`, `delta = (question.points ?? 0) * rules.scoring.multiplier * (input.isSteal ? rules.wrongAnswer.stealValueMultiplier : 1)`;
    if not correct, `delta = -(rules.wrongAnswer.penaltyIsProportional ? (question.points ?? 0) * rules.scoring.multiplier : rules.wrongAnswer.penalty)`.
    Return `[{ teamId: input.teamId, delta, reason: input.correct ? 'correct answer' : 'wrong answer' }]`.
    Per L5, do NOT read or apply `rules.scoring.streak` or `.comeback` —
    leave a one-line comment citing L5 so a future T2 reader understands the
    omission is intentional.
15. Create `src/scoring/flat.test.ts`. Purity/determinism test per SPEC
    AC#8: build a fixture `ScoreInput`, deep-freeze `input.state` via
    `Object.freeze` recursively (or a small freeze helper), call `score()`
    twice with the same input, assert both calls return deep-equal output
    AND that no property assignment on `input.state` was attempted (freezing
    makes any such attempt throw in strict mode — assert no throw occurred,
    i.e. the plugin never tried to write to frozen state). Assert the
    correct-answer delta and wrong-answer-with-penalty delta match the
    formula above for at least 2 fixture cases each.
16. Run `npx tsx src/styles/grid.test.ts src/scoring/flat.test.ts` — both
    must exit 0.

### Sub-Phase 4 — `local` transport + redaction wiring + host-auth token (depends on 2; parallel-safe with 3)

17. Create `src/engine/broadcast.ts` (L9). Export
    `broadcastState(handle: TransportHandle, state: SessionState, config: GameShowConfig): void`.
    Builds three payload shapes from `state`: `'host'` gets the full
    `SessionState` (current question unredacted via `redactQuestion(q, 'host')`,
    which is a no-op passthrough per `resolve.ts:132`); `'stage'` and
    `'player'` each get a state view where the current question, if any, is
    replaced by `redactQuestion(currentQuestion, 'stage' | 'player')`. Calls
    `handle.broadcast('host', hostPayload)`, `handle.broadcast('stage', stagePayload)`,
    `handle.broadcast('player', playerPayload)` — always broadcast to all
    three channels; a channel with no connected clients is a safe no-op
    inside `local.ts`.
18. Create `src/transport/local.ts`. Implement `TransportPlugin` with
    `key: 'local'`. `start(options: { port?: number; hostToken: string; staticDir?: string })`:
    creates a `node:http` server on `options.port ?? 0`. Routes:
    - `GET /events/stage`, `GET /events/host` — set SSE headers
      (`Content-Type: text/event-stream`, `Cache-Control: no-cache`,
      `Connection: keep-alive`), keep the `ServerResponse` open in an
      in-memory `Set` per channel, write `data: ${JSON.stringify(payload)}\n\n`
      on every `broadcast()` call for that channel, remove from the set on
      `'close'`.
    - `POST /command` — parse JSON body `{ type, payload, token }`; if
      `token !== options.hostToken`, respond `401` with `{ error: 'invalid host token' }`
      and do NOT call the command handler; otherwise call the registered
      `onCommand` handler with `{ from: 'host', type, payload }` and respond
      `200`.
    - Any other `GET` — serve the matching file under `options.staticDir`
      (default `dist/`) via `node:fs.readFile`, with a small hardcoded
      extension→content-type map (`.html`, `.js`, `.css`, `.json`, `.png`,
      `.svg`); `404` if the file does not exist; this is L8.

    Returns a `TransportHandle`: `broadcast` writes to the right channel's
    SSE set; `onCommand` stores the handler for the POST route to call;
    `rtt()` returns `0` (stub, per D5 in INNOVATE — nothing reads this in
    T1); `stop()` closes every open SSE response and calls
    `server.close()`, returning a `Promise` that resolves once closed.
19. Create `src/transport/local.test.ts`. Fully-automated, no external
    precondition (ephemeral `port: 0`, torn down in the test itself):
    (a) start the transport, `POST /command` with no token → assert `401`;
    (b) `POST /command` with the correct token → assert `200` and that the
    registered `onCommand` handler was called with the right `type`/`payload`;
    (c) open `GET /events/stage`, call `broadcast('stage', {foo:1})`, assert
    the client receives an SSE frame containing `{"foo":1}`; (d) call
    `stop()`, assert a subsequent request to the server fails (connection
    refused) — proving teardown is real, not a no-op.
20. Run `npx tsx src/transport/local.test.ts` — must exit 0.

### Sub-Phase 5 — Stage view (depends on 3, 4)

21. Create `src/stage/index.html` — minimal HTML shell, one `<script type="module" src="./main.ts">`,
    a `<div id="root">` the renderer targets. No inline `<script>` content
    beyond the module tag (keeps the import-isolation check in Sub-Phase 8
    meaningful).
22. Create `src/stage/main.ts`. Connects `new EventSource('/events/stage')`.
    On `message`: parse JSON, call `themeToCssVars(payload.theme)`
    (`resolve.ts:102`) and `document.documentElement.style.setProperty` for
    each returned var; render the board (grid cells, via `grid.stageComponent`
    key dispatch — a local `switch` on `stageComponent`, currently one case:
    `'grid-board'`); render the current (already-redacted) question text if
    `phase` is `'reading'`/`'armed'`/`'adjudicate'`; render a locally-computed
    countdown from `clockStartedAt` + the resolved `questionSec` via
    `requestAnimationFrame`, showing nothing if `clockStartedAt` is `null`;
    render the scoreboard from `teams`. On connection loss (EventSource
    `error` event while `readyState !== CLOSED`): do NOT clear the rendered
    DOM — leave last-known state visible (per invariant #1, Four Invariants
    table). `main.ts` must contain zero imports from `../host/` or any
    module that itself imports `../host/` — this is the import-isolation
    invariant Sub-Phase 8 checks mechanically.
23. Manual gate (cannot be automated — see ARCHITECTURE.md §9): after
    `vite build`, serve `dist/` via `local.ts` and view `stage.html` on an
    actual external display at expected venue resolution/aspect; confirm
    body text legibility from the back of a room. Record the outcome in the
    phase report; this gate is honestly Agent-Probe/manual, never invented
    as automated.

### Sub-Phase 6 — Host controller (depends on 3, 4)

24. Create `src/host/index.html` — separate Vite entry, `<script type="module" src="./main.ts">`.
25. Create `src/host/main.ts`. Reads `token` from `location.search`. Connects
    `new EventSource('/events/host')` for full unredacted state. Renders host
    controls: select-question (per available cells from `grid.availableQuestions`),
    arm, mark-correct, mark-wrong, next, undo, pause/resume. Every control
    `POST`s `{ type, payload, token }` to `/command`. Undo button always
    visible and reachable in exactly one click/tap (SPEC AC#6 / live-event
    requirement). Pause: `POST { type:'stopClock' }`. Resume: host computes
    `remainingMs = questionSec*1000 - (Date.now() - clockStartedAt)` locally
    from its own already-received state, then
    `POST { type:'startClock', payload:{ ms: remainingMs } }` — no contract
    change needed (D5 in INNOVATE).
26. Manual gate: confirm the host token in the URL query string is present
    and required (a request to `/command` without it visibly fails from the
    browser's network tab) — quick manual smoke check alongside the
    automated `local.test.ts` coverage of the same behavior.

### Sub-Phase 7 — Integration entrypoint (depends on 3, 4, 5, 6 — added by this PLAN, not in the original 6-item build order)

> This sub-phase is necessary for Goal 1 ("a host can run a complete show")
> to be true — none of Sub-Phases 1-6 alone produce something a host can
> actually launch. Flagged explicitly rather than silently expanding scope.

27. Create `src/registry/bootstrap.ts`. Calls `register('style', gridPlugin)`,
    `register('scoring', flatPlugin)`, `register('transport', localPlugin)`
    exactly once. Imports the concrete plugins directly (this file is the
    ONE place in T1 allowed to import concretes — the engine itself never
    does, per `src/registry/index.ts`'s header comment).
28. Create `src/server.ts`. Reads a preset module path from `process.argv[2]`
    (default `presets/school-assembly.ts`), calls `resolveConfig`, calls
    `validateConfigPlugins(config)` and exits with the error list printed if
    non-empty (preflight check, SPEC AC#3), imports `bootstrap.ts` for its
    side effect, generates `hostToken = crypto.randomUUID()`
    (`node:crypto`), calls `createSession(config, ...)`, resolves the
    `'local'` transport via `resolve('transport', config.runtime.transport.driver)`,
    calls `.start({ hostToken, staticDir: 'dist' })`, wires `onCommand` to
    dispatch through `applyIntentWithLog`/`resolveAnswer`/`undo` and re-call
    `broadcastState` after every mutation, and prints to the console:
    `Stage: http://<lan-ip>:<port>/stage.html` and
    `Host:  http://<lan-ip>:<port>/host.html?token=<hostToken>`.
29. Add to `package.json`: `"show": "tsx src/server.ts"` script.

### Sub-Phase 8 — Cross-cutting gates (run after 1-7 complete)

30. Create `vite.config.ts` — multi-page build with two entries
    (`stage: 'src/stage/index.html'`, `host: 'src/host/index.html'`),
    `outDir: 'dist'`.
31. Add `vite` to `package.json` `devDependencies`. Add `"build": "vite build"`.
32. Create `scripts/check-stage-host-isolation.mjs`: greps `src/stage/**/*.ts`
    for any import specifier matching `/(^|\/)\.\.\/host(\/|$)/` or
    `/(^|\/)host\//` (excluding false positives like `hostNote`/`hosting`
    by requiring a path-segment boundary); exits 1 with the offending line
    if found, 0 otherwise. This is the mechanical half of SPEC AC#7.
33. Create `scripts/run-tests.mjs` (L11): recursively find every
    `src/**/*.test.ts`, dynamically `import()` each in a `try/catch`, print
    `PASS <file>` or `FAIL <file>: <error message>`, exit 1 if any failed
    else 0. Update `package.json`'s `"test"` script to `"tsx scripts/run-tests.mjs"`.
34. Run the full gate sequence: `npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`.
    All four must succeed before this plan is considered code-complete.

---

## Test Plan

Framework: none, per `all-tests.md` — plain `tsx` + `node:assert/strict`
scripts, run via the new `scripts/run-tests.mjs` aggregator (L11).

| Area | Tier | Scenario | Command | Proves |
|---|---|---|---|---|
| `src/registry/validateConfigPlugins.test.ts` | Fully-Automated | Unknown-plugin errors + valid-config pass | `npx tsx src/registry/validateConfigPlugins.test.ts` | SPEC AC#3 |
| `src/engine/phase.ts` | Fully-Automated | Full transition truth table | `npx tsx src/engine/phase.test.ts` | L1 correctness |
| `src/engine/intents.ts` | Fully-Automated | Per-intent-type state update + untouched-key identity | `npx tsx src/engine/intents.test.ts` | Immutable-update discipline |
| `src/engine/log.ts` | Fully-Automated | Undo reverses + log stays append-only + depth bound | `npx tsx src/engine/log.test.ts` | SPEC AC#6 (upgraded from Known-Gap) |
| `src/engine/session.ts` | Fully-Automated | `structuredClone` isolation (post-create config mutation doesn't leak) | `npx tsx src/engine/session.test.ts` | SPEC AC#11 (upgraded from Known-Gap) |
| `src/engine/host-manual-round.test.ts` | Fully-Automated | Full round, zero player devices, select→reveal→award→next loop to `isRoundComplete` | `npx tsx src/engine/host-manual-round.test.ts` | SPEC AC#5 (upgraded from Known-Gap; manual dry-run below still required) |
| `src/styles/grid.ts` | Fully-Automated | Board build, availability, select intents, completion | `npx tsx src/styles/grid.test.ts` | Style contract correctness |
| `src/scoring/flat.ts` | Fully-Automated | Purity via frozen-state harness + formula correctness | `npx tsx src/scoring/flat.test.ts` | SPEC AC#8 (upgraded from Known-Gap) |
| `src/transport/local.ts` | Fully-Automated | Token auth (401/200), SSE frame delivery, teardown | `npx tsx src/transport/local.test.ts` | Host-auth mitigation from INNOVATE risk table |
| `src/engine/broadcast.ts` (redaction call site) | Fully-Automated | Injected fake `TransportHandle` never receives `answer`/`acceptedAnswers`/`hostNote`/`correctChoiceIndex`/`numericAnswer` on `'stage'`/`'player'` channels | covered inside `session.test.ts` or a dedicated `broadcast.test.ts` | SPEC AC#4 (existing coverage) + AC#7 data-boundary half |
| Stage/host import isolation | Fully-Automated | Static grep for forbidden cross-imports | `node scripts/check-stage-host-isolation.mjs` | SPEC AC#7 bundle-boundary half (upgraded from "future addition") |
| `npm run typecheck && npm test` | Fully-Automated | Whole-project type safety + full aggregate suite green | `npm run typecheck && npm test` | SPEC AC#12 |
| Stage projector legibility | Agent-Probe / Manual | View built `stage.html` on real/simulated external display, read from distance | manual, per `ARCHITECTURE.md` §9 | SPEC AC#9 (visual, correctly stays Known-Gap for automation; manual gate is real, not skipped) |
| Host token present/required | Agent-Probe / Manual | Browser network tab: request without token visibly fails | manual smoke alongside `local.test.ts` | Reinforces host-auth mitigation |
| Full pre-show dry run | Agent-Probe / Manual | Complete round on real venue network, buzzer-free | manual, per `ARCHITECTURE.md` §9 checklist | SPEC AC#5's non-automatable half |
| Buzzer fairness | Known-Gap (explicitly deferred) | — | — | SPEC AC#10 — no input plugin exists until T3/T4; correctly not attempted here |
| Theming visual regression | Known-Gap (explicitly deferred) | — | — | SPEC AC#9's automated half — Playwright screenshot diffing is future work, not invented now |

### TDD stubs (Fully-Automated rows — red-first starting point for EXECUTE)

```
test("canTransition accepts every edge in the L1 table", () => { throw new Error("NOT IMPLEMENTED") })
test("undo reverses the most recent event and appends a reversal entry without deleting the original", () => { throw new Error("NOT IMPLEMENTED") })
test("createSession deep-clones config; mutating the source object after creation does not affect the session", () => { throw new Error("NOT IMPLEMENTED") })
test("a full grid round completes end-to-end using only host-manual intents, zero player devices", () => { throw new Error("NOT IMPLEMENTED") })
test("flat.score() is pure: two calls with the same frozen input produce deep-equal output", () => { throw new Error("NOT IMPLEMENTED") })
test("POST /command without a valid host token returns 401 and never invokes the command handler", () => { throw new Error("NOT IMPLEMENTED") })
test("broadcastState never sends answer/acceptedAnswers/hostNote/correctChoiceIndex/numericAnswer on the stage or player channel", () => { throw new Error("NOT IMPLEMENTED") })
test("src/stage/** contains no import path reaching into src/host/**", () => { throw new Error("NOT IMPLEMENTED") })
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `validateConfigPlugins.test.ts` | Fully-Automated | AC#3 |
| `phase.test.ts` (L1 truth table) | Fully-Automated | Live-event requirement: unmodelled transitions are the named failure mode (`ARCHITECTURE.md` §5) |
| `intents.test.ts` | Fully-Automated | Immutability requirement (coding-style.md) applied to engine state |
| `log.test.ts` | Fully-Automated | AC#6 |
| `session.test.ts` | Fully-Automated | AC#11, invariant #2 |
| `host-manual-round.test.ts` | Fully-Automated | AC#5 (automated half) |
| `grid.test.ts` | Fully-Automated | Style contract compliance |
| `flat.test.ts` | Fully-Automated | AC#8, invariant #3 |
| `local.test.ts` | Fully-Automated | Host-auth risk mitigation (INNOVATE vc-predict Medium risk) |
| redaction-call-site test | Fully-Automated | AC#4, AC#7 (data half), invariant #4 |
| `check-stage-host-isolation.mjs` | Fully-Automated | AC#7 (bundle half) |
| `npm run typecheck && npm test` | Fully-Automated | AC#12 |
| Projector legibility manual check | Agent-Probe / Manual | AC#9 (correctly not automated) |
| Host token URL manual smoke | Agent-Probe / Manual | Reinforces host-auth mitigation |
| Full pre-show dry run | Agent-Probe / Manual | AC#5 (manual half), live-event operational requirements |
| Buzzer fairness | Known-Gap (deferred, documented) | AC#10 — explicitly out of T1 scope |
| Visual regression on theming | Known-Gap (deferred, documented) | AC#9 automated half — future Playwright work |

---

## Acceptance Criteria

Testable outcomes for T1, each mapped to the SPEC criterion it closes or advances:

1. Running `npx tsx src/engine/host-manual-round.test.ts` passes: a full `grid` round
   completes end-to-end (select → reveal → award/deduct → next, looping to
   `isRoundComplete`) using only host-manual intents, with zero player devices
   connected or referenced anywhere in the code path. (SPEC AC#5, automated half.)
2. Running `npx tsx src/engine/log.test.ts` passes: an `awardPoints` action followed
   by `undo()` restores the pre-award score in one call, and the log entry count
   increases (never decreases) across the undo. (SPEC AC#6.)
3. Running `npx tsx src/engine/session.test.ts` passes: mutating the source config
   object after `createSession()` has no effect on the session's own `config` field.
   (SPEC AC#11, invariant #2.)
4. Running `npx tsx src/scoring/flat.test.ts` passes: two calls to `flat.score()` with
   the same frozen input produce deep-equal output and no mutation is attempted on
   `input.state`. (SPEC AC#8, invariant #3.)
5. Running `npx tsx src/registry/validateConfigPlugins.test.ts` passes: every checked
   field (transport, scoring, style, lifeline, handler, widget) produces a specific
   "unknown plugin" error naming the bad key plus registered alternatives, and a fully
   valid config produces zero errors. (SPEC AC#3.)
6. Running `npx tsx src/transport/local.test.ts` passes: `POST /command` without a
   valid host token is rejected with `401` and never reaches the command handler; with
   the correct token it is accepted and dispatched. (Host-auth mitigation from
   INNOVATE's vc-predict risk table.)
7. The redaction call-site test (in `session.test.ts` or a dedicated
   `broadcast.test.ts`) passes: no payload broadcast to the `'stage'` or `'player'`
   channel ever contains `answer`, `acceptedAnswers`, `hostNote`,
   `correctChoiceIndex`, or `numericAnswer`. (SPEC AC#4, AC#7 data half, invariant #4.)
8. Running `node scripts/check-stage-host-isolation.mjs` exits 0: no file under
   `src/stage/` imports anything from `src/host/`. (SPEC AC#7, bundle half.)
9. `npm run typecheck && npm test` both exit 0 with every T1 file included. (SPEC AC#12.)
10. Manual: the built `stage.html`, viewed on an external display at expected venue
    resolution, is legible from the back of a room (`ARCHITECTURE.md` §9). Recorded
    honestly as a human judgment call, not invented as automated. (SPEC AC#9, partial —
    the automated visual-regression half stays Known-Gap by design.)
11. Manual: a full pre-show dry run of one complete round on the real venue network
    succeeds using the built `show` entrypoint. (SPEC AC#5, manual half.)

## Phase Completion Rules

- A Sub-Phase is **CODE DONE** when its own checklist items are implemented and its
  own `*.test.ts` file(s) pass in isolation (`npx tsx <file>.test.ts` exits 0).
- A Sub-Phase is **VERIFIED** only after CODE DONE **and** the cross-cutting Sub-Phase
  8 gate sequence (`npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`)
  passes with that Sub-Phase's code included — CODE DONE is not VERIFIED on its own.
- The manual gates (projector legibility, host-token URL smoke check, full pre-show
  dry run) are never marked VERIFIED without an explicit human confirmation recorded
  in the phase report — an agent judgment call alone does not satisfy these rows.
- This plan as a whole is **VERIFIED** only when every row in Verification Evidence
  above is either green (Fully-Automated/Hybrid gate passed) or explicitly confirmed
  by a human (Agent-Probe/Manual rows) or is a documented, accepted Known-Gap (buzzer
  fairness, visual regression — both correctly out of T1 scope, not silently skipped).

## Open Items / Known Limitations (carried forward honestly, not buried)

1. **L4's imprecise `GameEventName` fallbacks** (`setTurn`, `stopClock`,
   `playSound`, `effect`, `custom` all map to a best-fit existing name).
   Bounded impact: only affects which `integration.hooks` subscriptions
   fire for those specific intents — undo and dispute-audit read `payload`/
   `undo`, not `name`, so both stay correct regardless. Recommend a T2
   fast-follow: add a generic `'engine.internal'` (or similar) member to
   `GameEventName` in `types.ts` once a second style plugin's needs are
   known, rather than guessing at the shape now.
2. **D3's two contract gaps** (no `SessionState` slot for style-owned
   persistent state; `buildBoard` doesn't receive `state`) remain
   unresolved, as decided in INNOVATE. Do not attempt to close them in T1
   EXECUTE even if a `tictac`-adjacent thought arises mid-build — that is
   T2 scope with its own PLAN pass.
3. **Wrong-answer policy default** (SPEC Open Questions) is unaffected by
   this plan — `flat.ts` correctly implements whatever `WrongAnswerRules`
   the resolved config carries; no default is hardcoded in engine code.

---

## Test Infra Improvement Notes

- File count crossing `all-tests.md`'s documented 8-file Vitest-migration
  trigger (9 test files after T1) is handled by `scripts/run-tests.mjs`
  (L11) rather than adding Vitest, to honor the zero-new-runtime-dependency
  constraint. If T2 adds meaningfully more test files (remaining 5 styles +
  3 scoring engines + lifelines/special tiles), re-evaluate Vitest then —
  watch mode alone may justify it once UI iteration starts in earnest.
- No container/CI environment exists yet in this repo (no `.github/`
  workflows found during RESEARCH). `npm run typecheck && npm test` is
  currently a local-only gate. Recommend adding a minimal CI workflow in a
  future UPDATE PROCESS pass once T1 lands, so regressions are caught
  before they reach a live-event dry run.

---

## Dependencies and Sequencing

Sub-Phases 1 → 2 → {3, 4 in parallel} → {5, 6, both depend on 3 and 4} → 7
(depends on 3,4,5,6) → 8 (cross-cutting, runs last). Sub-Phase 0 has no
dependency and may run anytime before Sub-Phase 8's full gate sequence.

## Risks

| Risk | Mitigation |
|---|---|
| Generic undo diff (L2/L3) is the highest-novelty piece of engine code — a subtle bug here breaks the log's audit guarantee. | Dedicated `log.test.ts` covers reversal-without-deletion, depth bounding, and empty-log no-op explicitly before any style/UI work depends on it (Sub-Phase 2 gates before 3/4 start). |
| Redaction could be forgotten at a new call site as the transport/UI grows. | L9 makes `broadcastState` the ONLY call site for `handle.broadcast(...)` in T1; enforced by not exposing `handle` directly to `server.ts`'s command-dispatch loop beyond that one function. |
| Host token could leak via server logs or browser history if mishandled. | Token travels only in the host URL's query string and the POST body — never logged by `local.ts` (no request logging is added in T1); documented as local-LAN-only threat model, consistent with SPEC's out-of-scope line on real auth/accounts. |

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md`
2. **Last completed phase or step:** PLAN written (this file). INNOVATE
   record persisted at `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_INNOVATE_24-08-26.md`.
   Neither VALIDATE nor EXECUTE has run.
3. **Validate-contract status:** pending — placeholder heading below.
   `ENTER VALIDATE MODE` before any EXECUTE work begins.
4. **Supporting context files loaded during this PLAN pass:**
   `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`,
   `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_SPEC_24-08-26.md`,
   `src/registry/index.ts`, `src/config/types.ts`, `src/config/resolve.ts`,
   `src/config/defaults.ts`, `src/config/resolve.test.ts`,
   `presets/school-assembly.ts`, `CUSTOMIZATION.md`, `ARCHITECTURE.md`
   (§§2, 4, 5, 6, 9, 10), `package.json`, `tsconfig.json`.
5. **Next step for a fresh agent picking up mid-execution:** if the plan
   file exists but no validate-contract section is filled in below, run
   VALIDATE first. If a validate-contract with `Gate: PASS` (or an accepted
   `CONDITIONAL`) already exists, resume EXECUTE at the first unchecked
   Sub-Phase in the Implementation Checklist above, in order — do not skip
   ahead even if later sub-phases look independent; Sub-Phase 2 in
   particular must be fully green before 3/4 begin.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
