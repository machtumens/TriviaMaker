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
application + generic **host-action** undo (batched per host action, not per
Intent — L2a, closed by the 24-08-26 PVL supplement), one style (`grid`), one
scoring engine (`flat`), a zero-dependency local HTTP+SSE transport with
host-command auth and path-traversal containment, and a stage + host UI —
enough that a host can run a complete show end-to-end with zero player
devices. ~26 new files, two modified files (`package.json`, `tsconfig.json`).
Zero files in `src/config/` or `src/registry/` are modified (only new sibling
files added). Zero new runtime dependencies; Vite is a dev-only build tool.
Six build-order sub-phases from INNOVATE plus one integration sub-phase this
plan adds explicitly (glue entrypoint — see Sub-Phase 7). Sub-Phases 3 and 4
are parallel-safe; everything else is a straight dependency chain. **This plan
was PVL-supplemented on 24-08-26** to close VALIDATE's first-pass `Gate:
BLOCKED` finding (F1, undo granularity) plus five CONCERNs (F2, F3, F5, F6,
F7) and one accepted note (F8) — see Design Locks L2a/L12-L15 and the
per-item checklist notes below for exactly what changed.

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
| **L2 — Undo mechanism** | Snapshot-diff, not deep object-diff. Per-intent-type declares WHICH top-level `SessionState` keys it touches (`INTENT_TOUCHED_KEYS`, a data table); ONE generic function snapshots the UNION of those keys across a whole host-action's `Intent[]` batch, before applying any of them, and builds ONE `event.undo` per host action — see **L2a** (added by PVL supplement, 24-08-26). The "per-type" part is a declaration, never per-type undo code. |
| **L2a — Undo operates per host action, not per Intent (PVL supplement, 24-08-26)** | A single host action (e.g. selecting a question, marking an answer) can produce 2-3 `Intent`s from one `StylePlugin`/`session.ts` call. `log.ts` exports `applyIntentsWithLog(state, intents: Intent[], seq, at)` — it snapshots the UNION of every touched key across the WHOLE batch before applying ANY intent, applies all intents in order, and appends exactly ONE `GameEvent` for the whole batch. `session.ts` is the only caller and always passes a whole host action's `Intent[]` in one call — never a per-intent loop of individual log calls. This closes VALIDATE finding F1 (net gate BLOCKED) with zero changes to `GameEvent`/`Intent` in `src/registry/index.ts` (Option B from the F1 finding). Full algorithm: see item 8 in the checklist below, and the expanded ### L2a subsection after the L1 table. |
| **L3 — Undo does not delete log entries** | `undo()` reverses the most recent un-reversed event within the last `runtime.undo.depth` entries by applying its `.undo` patch, then APPENDS a new synthetic event (reusing the same `GameEventName` as the action being reversed, payload tagged `{ reversalOf: <seq> }`). The log stays append-only and unbounded; nothing is ever removed from it. (Since L2a, one `event` already represents one whole host action, so this reverses one host action per `undo()` call — no change to `undo()`'s own logic was needed to close VALIDATE F1.) |
| **L4 — Intent → GameEventName mapping** | Fixed table in Sub-Phase 2. `GameEventName` is a closed union (do not modify `types.ts`); several intents (`setTurn`, `playSound`, `effect`, `custom`, `stopClock`) have no precise match and use a documented best-fit fallback. This only affects which `integration.hooks` subscriptions fire for those intents — undo and dispute-audit correctness are unaffected because both read `payload`/`undo`, never `name`. Flagged as a real, bounded, non-blocking limitation — see Open Items. |
| **L5 — `flat` scoring omits streak/comeback in T1** | `rules.scoring.streak`/`.comeback` fields exist in config and default `enabled:false`. T1's `flat.ts` does not implement them even when a preset sets `enabled:true` (as `school-assembly.ts` round 2 does) — this is a documented, intentional T1 gap, not a bug. Streak/comeback are T2 scope per the SPEC Capability Inventory. |
| **L6 — Consume/award orchestration lives in `session.ts`, not the style plugin** | `resolveAnswer()` in `session.ts` calls the registered `scoring` plugin, then emits `awardPoints` + `consumeQuestion` + `setPhase` intents generically for every style, passed together as ONE `Intent[]` array to a single `applyIntentsWithLog` call (L2a) — never three separate log calls — so one `undo()` reverses the whole `resolveAnswer()` action in one press. `StylePlugin.onResolved()` is reserved for style-SPECIFIC extra consequences only; `grid.onResolved()` returns `[]` in T1. |
| **L7 — Host token, not a `TransportHandle` field** | `TransportHandle` (`src/registry/index.ts:183-190`) is not modified. The app entrypoint (Sub-Phase 7) generates the token and passes it via `options.hostToken` into `transport.start(options)`; `local.ts` reads it from there and validates every POST against it. The token is embedded in the printed host controller URL, never in the stage URL. |
| **L8 — `local` transport serves static files too** | Vite is BUILD-time only in T1 (`vite build` → `dist/stage/`, `dist/host/`). `local.ts`'s `node:http` server serves those built files for GET requests that don't match `/events/*` or `/command`, using `node:fs` + a small extension→content-type map. One process, one port, for the whole show — no dependency on a dev server surviving the live event. |
| **L9 — Redaction has exactly one call site** | A single `broadcastState(handle, state, config)` helper in `src/engine/broadcast.ts` is the ONLY place that calls `handle.broadcast(...)`. It calls `redactQuestion(q, 'stage')` / `redactQuestion(q, 'player')` before broadcasting to those channels, and sends the full state unredacted to `'host'`. This minimizes the surface where redaction could be forgotten to one function. |
| **L10 — `createSession` uses `structuredClone`** | `createSession(config, ...)` deep-copies the resolved config into `SessionState.config` via Node's built-in `structuredClone` (zero new deps) — proves `snapshotContentAtLaunch` structurally, not by convention. |
| **L11 — Test runner stays framework-free** | Adding 8 new `*.test.ts` files pushes the project past `all-tests.md`'s documented 8-file Vitest-migration trigger (9 total after T1). This PLAN does NOT introduce Vitest (would add a dependency without an explicit argument beyond "file count"). Instead: `scripts/run-tests.mjs`, a small zero-dependency aggregator that discovers `**/*.test.ts` under `src/`, dynamically imports each, and reports PASS/FAIL per file with a non-zero exit on any failure. `package.json`'s `test` script becomes `tsx scripts/run-tests.mjs`. Flagged in Test Infra Improvement Notes for a future Vitest re-evaluation if T2 adds significantly more files. |
| **L12 — Preflight also validates built-in style kinds (PVL supplement, 24-08-26)** | `validateConfigPlugins()` (`src/registry/index.ts`, unmodified) only checks `round.style.plugin` when `kind === 'custom'` — a `wheel`/`list`/`tictac`/`hangman`/`trivia` round passes preflight and crashes mid-show (VALIDATE F2). Fix lives entirely OUTSIDE `registry/index.ts`: `bootstrap.ts` exports `validateConfigPluginsT1(config)`, which calls `validateConfigPlugins(config)` then additionally checks every round's `style.kind` (built-in or custom) against `list('style')`, using the same registered-alternatives error format. `server.ts`'s preflight (item 28) calls `validateConfigPluginsT1`, not the raw registry function. |
| **L13 — T1 ships its own demo preset; `flat` warns once on unimplemented streak/comeback (PVL supplement, 24-08-26)** | `presets/school-assembly.ts` (the plan's original bundled demo) enables `streak` in round 2 and uses the unregistered `'trivia'` style in its `final` round — both crash or silently mis-score under T1 (VALIDATE F3). Two independent fixes, both applied: (1) `presets/demo-t1.ts` — a new, T1-scoped demo preset containing only `grid`-style rounds with streak/comeback left off — becomes `server.ts`'s zero-argument default (item 28); `school-assembly.ts` is left UNCHANGED as a worked T2+ example, per the original plan's intent. (2) `flat.score()` additionally warns once per process (`console.warn`, not a throw) whenever it receives `rules.scoring.streak.enabled` or `.comeback.enabled === true`, as a visible guard against silently-wrong on-stage scores — this is deliberate insurance, not defensive clutter, and applies to ANY config, not just the bundled presets. |
| **L14 — Static file serving is path-contained (PVL supplement, 24-08-26)** | `local.ts`'s static-file `GET` route (item 18) resolves the requested path with `path.resolve`, verifies it stays within the resolved `options.staticDir` via a prefix check, and responds `403`/`404` on escape — closing VALIDATE F5 (unbounded `node:http` server on the venue LAN with no path-traversal containment). |
| **L15 — `vite.config.ts` is type-checked (PVL supplement, 24-08-26)** | `tsconfig.json`'s `include` gains `"vite.config.ts"` (Sub-Phase 8, item 30) so `npm run typecheck` actually covers it — closing VALIDATE F6 (previously covered by neither `tsc` nor `vite build`'s untyped esbuild transpile). |

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

### L2a — Batch-union undo snapshot algorithm (PVL supplement, 24-08-26)

Closes VALIDATE finding F1 (net gate: BLOCKED). `log.ts` exports
`applyIntentsWithLog(state: SessionState, intents: Intent[], seq: number, at: number): { state: SessionState; event: GameEvent }`
as the ONLY logging entry point `session.ts` calls — never a per-intent loop.
Exact order (load-bearing — a naive per-intent loop that re-snapshots after
each `applyIntent` call reintroduces the bug this closes):

1. Union every `INTENT_TOUCHED_KEYS[intent.type]` across the whole `intents`
   array into one `Set<keyof SessionState>`.
2. Snapshot `state[key]` for every key in that union from the **original,
   pre-batch** `state` argument — before applying ANY intent. This snapshot
   becomes `event.undo`.
3. Apply every intent in `intents`, in array order, via the existing pure
   `applyIntent(state, intent)` (item 6/7, unchanged), threading state through
   each call.
4. Map `name: GameEventName` via the existing L4 table, keyed off the LAST
   intent in the batch (display/subscription hint only — `undo()` and
   dispute-audit read `payload`/`undo`, never `name`).
5. Set `event.payload = { intents: intents.map(i => ({ ...i })) }` — the
   full ordered list of raw intents in this host action, for dispute audit.
6. Append the new event to `state.log` (unchanged — append-only).
7. Return `{ state, event }` — exactly ONE event per call, regardless of
   `intents.length`. A single-intent host action (e.g. `stopClock`) calls
   this with a one-element array; the algorithm degrades correctly to the
   original single-intent behavior with no special-casing.

Requires **no** change to `src/registry/index.ts` or `src/config/types.ts` —
`GameEvent.payload` is already `Record<string, unknown>` (confirmed by direct
read, `src/registry/index.ts:66-73`), so `{ intents: [...] }` is a documented
convention, not a type change. `Intent`/`GameEvent`/`StylePlugin.onSelect`/
`onResolved` (all of which return `Intent[]`, confirmed generic-plural
already) are all unmodified. `undo(state, depth)` (item 9) is unmodified —
because one `GameEvent` now already represents one whole host action, its
existing "reverse the most recent un-reversed event" logic automatically
reverses one host action per call.

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
| `presets/demo-t1.ts` | NEW (PVL supplement, F3) | — |
| `src/registry/bootstrap.test.ts` | NEW (PVL supplement, F2) | bootstrap.ts |
| `package.json` | MODIFIED | add `vite` devDependency; `test`/`build`/`show` scripts |
| `tsconfig.json` | MODIFIED (PVL supplement, F6 — corrects the "no change" claim below) | — |

`tsconfig.json`'s `include: ["src/**/*","presets/**/*"]` already covers every
new `src/**`/`presets/**` file. It does **not** cover the new root-level
`vite.config.ts` (Sub-Phase 8) — VALIDATE F6 confirmed neither `npm run
typecheck` nor `npm run build` (esbuild, untyped) checks it. This PLAN's
original claim that "`tsconfig.json` needs no change" is corrected: Sub-Phase
8 (item 30/31) now also adds `"vite.config.ts"` to `include`.

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
- **`session.ts` engine API** — `createSession`, `applyIntent`,
  `applyIntentsWithLog` (L2a — the sole logging entry point, batches a whole
  host action's `Intent[]` into one `GameEvent`), `undo`, `resolveAnswer`,
  used by `server.ts` and (indirectly, via HTTP) the host controller. This is
  the new internal API surface EXECUTE and later tiers build on.
- **`bootstrap.ts`'s `validateConfigPluginsT1`** (PVL supplement, F2) — wraps
  `validateConfigPlugins()` with an additional built-in-style-kind check;
  `server.ts`'s preflight calls this, not the raw registry function.

No public contract touches auth/identity, billing, schema/migration, or an
externally-reachable API — the host token is a local-LAN session secret, not
user authentication, and does not cross the SPEC's out-of-scope line.

## Blast Radius

~26 new files (24 from the original build order plus `presets/demo-t1.ts`
and `src/registry/bootstrap.test.ts`, added by the 24-08-26 PVL supplement
for F3/F2) across 7 new top-level directories (`src/engine`, `src/styles`,
`src/scoring`, `src/transport`, `src/stage`, `src/host`, `scripts`) plus
`vite.config.ts` at the root; two modified files, both additive-only —
`package.json` (new devDependency + new/changed scripts, no existing script
behavior removed except `test`'s underlying command, upgraded to a strict
superset) and `tsconfig.json` (adds `"vite.config.ts"` to `include`, PVL
supplement F6). Zero files under `src/config/` or `src/registry/index.ts` are
touched — the F2 preflight fix and the F1 undo fix both stay entirely outside
those two files (T1-local wrapper in `bootstrap.ts`; batching lives in
`log.ts`/`session.ts`). Risk class: none of auth/identity, billing/credits,
schema/migration, or public external API — this is a greenfield local-LAN
build inside settled contracts. Highest actual risk is correctness of the
generic undo BATCH diff (L2a, closing VALIDATE F1) and the redaction
call-site discipline (L9), both covered by dedicated fully-automated gates
below; the static file server's path-traversal containment (L14, closing F5)
is the other meaningful hardening added by this supplement.

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
   test has no ordering dependency on `bootstrap.ts` having run. (The
   additional built-in-style-kind check — VALIDATE F2 — is NOT tested
   here; it's tested in `src/registry/bootstrap.test.ts`, Sub-Phase 7 item
   27a, which legitimately depends on `bootstrap.ts` having run.)
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
   per `process/development-protocols/implementation-standards.md`). For
   `startClock` (PVL supplement, closes VALIDATE F7): do NOT naively set
   `clockStartedAt = Date.now()` — that restarts the full countdown and
   loses elapsed time on resume. Instead compute
   `clockStartedAt = Date.now() - (questionSec * 1000 - intent.ms)`, where
   `questionSec` is read from the resolved round's timer config on
   `state.config` for the round containing `state.currentQuestionId`. This
   makes the client-rendered countdown (`questionSec*1000 - (now -
   clockStartedAt)`, item 22) correctly resume from `intent.ms` remaining
   rather than restarting. This is an EXECUTE-time instruction, not a
   design change — no new field or interface is introduced.
7. Create `src/engine/intents.test.ts`. One assertion block per intent type
   in the table above: apply, assert the touched key(s) changed and every
   OTHER top-level key is reference-equal (`===`) to the input state's value
   (proves untouched keys are never copied/reallocated). Assert `setPhase`
   with an illegal target throws via `assertTransition`.
8. Create `src/engine/log.ts`. Export
   `applyIntentsWithLog(state: SessionState, intents: Intent[], seq: number, at: number): { state: SessionState; event: GameEvent }`
   — the batched/generic logging entry point (**L2a**, PVL supplement,
   closes VALIDATE F1 — replaces the single-`Intent` version originally
   specified here, which VALIDATE found does not guarantee one-click undo
   for multi-intent host actions). Algorithm, in this exact order:
   1. Compute the UNION of `INTENT_TOUCHED_KEYS[intent.type]` across every
      `intent` in `intents` into one `Set<keyof SessionState>`.
   2. Snapshot `state[key]` for every key in that union **from the
      ORIGINAL `state` argument, before applying ANY intent in the
      batch** — this snapshot becomes `event.undo`. This ordering is
      load-bearing: snapshotting inside a per-intent loop (i.e.
      re-snapshotting after each `applyIntent` call) would capture
      already-mutated values for the 2nd/3rd intent and silently
      reintroduce the exact bug this supplement closes — the union
      snapshot MUST happen once, up front, against the pre-batch state.
   3. Apply every intent in `intents`, in array order, via the existing
      pure `applyIntent(state, intent)` from item 6/7 (unchanged),
      threading the returned state through each call.
   4. Map to `name: GameEventName` using the existing L4 table (unchanged),
      keyed off the **last** intent in `intents` (display/subscription
      hint only — `undo` and dispute-audit never read `name`, per Open
      Item 1).
   5. Set `event.payload = { intents: intents.map(i => ({ ...i })) }` —
      the full ordered list of raw intents that composed this one host
      action, so dispute-audit (D2, INNOVATE) can see exactly what
      happened, not just the last step.
   6. Append the new event to `state.log` (new array, log stays
      append-only, unchanged from the original design).
   7. Return `{ state: newStateWithLog, event }` — exactly ONE
      `GameEvent` per call, regardless of `intents.length`. Callers with
      a single-intent host action (e.g. `stopClock`/`startClock` from
      the pause/resume flow, item 25) call this with a one-element
      array — the batching logic degrades correctly to the original
      single-intent behavior.

   `session.ts` is the ONLY caller of `applyIntentsWithLog` (per L6,
   updated) — style plugins and `resolveAnswer` return `Intent[]`, and
   `session.ts` passes that whole array to ONE `applyIntentsWithLog` call
   per host action, never a per-intent loop of individual log calls.
   This is what makes one `undo()` call reverse one host action (see
   item 9, unchanged).

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
   `{ state, undone: false }` (no-op, not an error). Because item 8's
   `applyIntentsWithLog` now produces exactly one `GameEvent` per whole
   host action (L2a), `undo()`'s existing single-event-reversal logic
   already reverses one full host action per call — no change to
   `undo()`'s own logic was required to close VALIDATE F1; the fix lives
   entirely in how events are CREATED (item 8), not in how they are
   reversed.
10. Create `src/engine/log.test.ts`. Cases: (a) apply `awardPoints` then
    `undo` — assert the team's score is back to its pre-award value AND
    `log.length` is 2 (original + reversal), never 1; (b) apply N events
    where N > `depth`, undo `depth` times, assert the (N-depth)th event from
    the start is never reachable by undo (returns `undone:false` on the next
    attempt); (c) undo on an empty log returns `undone:false`; (d) build a
    2-intent batch matching `grid.onSelect`'s exact shape (`selectQuestion`
    then `setPhase`), apply it via ONE `applyIntentsWithLog` call, call
    `undo()` once — assert BOTH touched keys (`currentQuestionId` AND
    `phase`) are restored to their pre-batch values in that single call,
    and `log.length` is 2 (one batched action-event + one reversal event),
    never 3; (e) build a 3-intent batch matching `resolveAnswer`'s exact
    shape (`awardPoints`, `consumeQuestion`, `setPhase`), apply it via ONE
    `applyIntentsWithLog` call, call `undo()` once — assert the team's
    score, `consumed` set, AND `phase` are ALL restored to their pre-batch
    values in that single call, and `log.length` is 2, never 4. Cases (d)
    and (e) are the tests required by VALIDATE F1 — they directly prove
    Goal 2 / SPEC AC#6 at host-action granularity, closing the gap the
    plan's original single-intent-only coverage left open.
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
    return `[{type:'selectQuestion', questionId}, {type:'setPhase', phase:'reading'}]`
    (these two intents are applied and logged as ONE `GameEvent` by
    `session.ts`'s single `applyIntentsWithLog` call — L2a — closing
    VALIDATE F1; `grid.ts` itself has no knowledge of batching).
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
    omission is intentional. Additionally (L13, PVL supplement, closes
    VALIDATE F3's silent-under-scoring half): if `rules.scoring.streak?.enabled`
    or `rules.scoring.comeback?.enabled` is `true`, call `console.warn(...)`
    — ONCE per process, using a module-level `let warned = false` flag, not
    once per `score()` call — naming which flag(s) are enabled and stating
    that `flat` does not implement them (Design Lock L5). This is a
    deliberate guard against silent scoring divergence, not defensive
    clutter: purity (invariant #3, `flat.test.ts`) is unaffected because
    `console.warn` is a side-effect-free diagnostic, not a state mutation,
    and never alters `score()`'s return value.
15. Create `src/scoring/flat.test.ts`. Purity/determinism test per SPEC
    AC#8: build a fixture `ScoreInput`, deep-freeze `input.state` via
    `Object.freeze` recursively (or a small freeze helper), call `score()`
    twice with the same input, assert both calls return deep-equal output
    AND that no property assignment on `input.state` was attempted (freezing
    makes any such attempt throw in strict mode — assert no throw occurred,
    i.e. the plugin never tried to write to frozen state). Assert the
    correct-answer delta and wrong-answer-with-penalty delta match the
    formula above for at least 2 fixture cases each. (d) (PVL supplement,
    closes VALIDATE F3's silent-scoring half) spy/mock `console.warn`;
    call `score()` twice with `rules.scoring.streak.enabled: true` in the
    fixture `RuleSet` — assert `console.warn` was called exactly ONCE
    across both calls (proving the once-per-process guard, not
    once-per-call), and assert neither call's returned `ScoreDelta[]`
    differs from the non-streak fixture case (proving the warning is
    diagnostic-only and never changes scoring output).
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
    - Any other `GET` — resolve the requested path with
      `path.resolve(options.staticDir ?? 'dist', decodeURIComponent(req.url.split('?')[0]))`,
      then verify the resolved path stays within
      `path.resolve(options.staticDir ?? 'dist')` (prefix check on the
      resolved absolute paths, e.g. via `path.relative` not starting with
      `..`) — respond `403` if it escapes containment (L14, PVL
      supplement, closes VALIDATE F5's path-traversal gap); otherwise
      serve the matching file via `node:fs.readFile`, with a small
      hardcoded extension→content-type map (`.html`, `.js`, `.css`,
      `.json`, `.png`, `.svg`); `404` if the file does not exist. This is
      L8+L14.

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
    refused) — proving teardown is real, not a no-op; (e) (PVL supplement,
    closes VALIDATE F5) request `GET /../../../etc/passwd` and at least
    one encoded-traversal variant (e.g. `GET /%2e%2e/%2e%2e/etc/passwd`)
    — assert BOTH are rejected with `403`/`404`, never `200`, and never
    leak file content.
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
    does, per `src/registry/index.ts`'s header comment). Also export
    `validateConfigPluginsT1(config: GameShowConfig): string[]` (L12, PVL
    supplement, closes VALIDATE F2): calls `validateConfigPlugins(config)`
    (the unmodified registry function), then additionally, for every round
    where `round.style.kind !== 'custom'`, checks
    `list('style').includes(round.style.kind)` — pushing an error string
    in the SAME format as the registry's own `check()` helper
    (`"${where}: unknown style plugin \"${kind}\". Registered: ${known}"`)
    when it is not registered. This lives entirely in `bootstrap.ts`, not
    `registry/index.ts` — zero edits to the protected T0 files.
27a. Create `src/registry/bootstrap.test.ts` (PVL supplement, F2). Imports
    `bootstrap.ts` for its registration side effect (this test
    legitimately depends on `'grid'`/`'flat'`/`'local'` being registered,
    unlike Sub-Phase 0's `validateConfigPlugins.test.ts`). Cases: (a) a
    fixture config with a round `style.kind: 'trivia'` (unregistered in
    T1) → `validateConfigPluginsT1` returns an error naming `'trivia'` and
    listing `'grid'` as the only registered alternative; (b) the same
    fixture with `style.kind: 'grid'` → zero style-kind errors. Run
    `npx tsx src/registry/bootstrap.test.ts` — must exit 0.
27b. Create `presets/demo-t1.ts` (L13, PVL supplement, F3). A standalone
    preset — do not import from or modify `presets/school-assembly.ts` —
    containing only `grid`-style rounds (2-3 rounds is enough), with
    `rules.scoring.streak.enabled` and `.comeback.enabled` left at their
    config defaults (`false`) or omitted entirely. This is the preset a
    host can run start-to-finish with zero arguments and zero surprises;
    it demonstrates T1's actual shipped capability, not T2's future
    surface. `school-assembly.ts` is left UNCHANGED — it remains a worked
    example of the FULL engine (T1+T2) and is not expected to run cleanly
    under T1 alone.
28. Create `src/server.ts`. Reads a preset module path from `process.argv[2]`
    (default `presets/demo-t1.ts` — L13, PVL supplement; NOT
    `presets/school-assembly.ts`, whose round 2/3 are guaranteed to
    misbehave under T1 per VALIDATE F3), calls `resolveConfig`, imports
    `bootstrap.ts` for its side effect FIRST (so `'grid'`/`'flat'`/
    `'local'` are registered before preflight runs), calls
    `validateConfigPluginsT1(config)` (L12 — NOT the raw
    `validateConfigPlugins` — closes VALIDATE F2) and exits with the error
    list printed if non-empty (preflight check, SPEC AC#3), generates
    `hostToken = crypto.randomUUID()` (`node:crypto`), calls
    `createSession(config, ...)`, resolves the `'local'` transport via
    `resolve('transport', config.runtime.transport.driver)`, calls
    `.start({ hostToken, staticDir: 'dist' })`, wires `onCommand` to
    dispatch each host command's resulting `Intent[]` (from `onSelect`,
    `resolveAnswer`, or a single-intent pause/resume call) as ONE array
    to ONE `applyIntentsWithLog` call (L2a — closes VALIDATE F1; never a
    per-intent loop), then `undo` on the undo command, and re-call
    `broadcastState` after every mutation, and prints to the console:
    `Stage: http://<lan-ip>:<port>/stage.html` and
    `Host:  http://<lan-ip>:<port>/host.html?token=<hostToken>`.
29. Add to `package.json`: `"show": "tsx src/server.ts"` script.

### Sub-Phase 8 — Cross-cutting gates (run after 1-7 complete)

30. Create `vite.config.ts` — multi-page build with two entries
    (`stage: 'src/stage/index.html'`, `host: 'src/host/index.html'`),
    `outDir: 'dist'`. Also add `"vite.config.ts"` to `tsconfig.json`'s
    `include` array (L15, PVL supplement, closes VALIDATE F6) — currently
    `["src/**/*", "presets/**/*"]`, missing this root-level file, which
    means neither `npm run typecheck` nor `vite build`'s untyped esbuild
    transpile ever type-checks it.
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
| `src/registry/bootstrap.test.ts` | Fully-Automated | Preflight also catches unregistered BUILT-IN style kinds, not just `custom` (PVL supplement, closes F2) | `npx tsx src/registry/bootstrap.test.ts` | SPEC AC#3 |
| `src/engine/phase.ts` | Fully-Automated | Full transition truth table | `npx tsx src/engine/phase.test.ts` | L1 correctness |
| `src/engine/intents.ts` | Fully-Automated | Per-intent-type state update + untouched-key identity | `npx tsx src/engine/intents.test.ts` | Immutable-update discipline |
| `src/engine/log.ts` | Fully-Automated | Undo reverses (single-intent AND multi-intent host-action batches, cases (d)/(e), closes F1) + log stays append-only + depth bound | `npx tsx src/engine/log.test.ts` | SPEC AC#6 (upgraded from Known-Gap) |
| `src/engine/session.ts` | Fully-Automated | `structuredClone` isolation (post-create config mutation doesn't leak) | `npx tsx src/engine/session.test.ts` | SPEC AC#11 (upgraded from Known-Gap) |
| `src/engine/host-manual-round.test.ts` | Fully-Automated | Full round, zero player devices, select→reveal→award→next loop to `isRoundComplete` | `npx tsx src/engine/host-manual-round.test.ts` | SPEC AC#5 (upgraded from Known-Gap; manual dry-run below still required) |
| `src/styles/grid.ts` | Fully-Automated | Board build, availability, select intents, completion | `npx tsx src/styles/grid.test.ts` | Style contract correctness |
| `src/scoring/flat.ts` | Fully-Automated | Purity via frozen-state harness + formula correctness + streak/comeback warn-once (case (d), closes F3 silent-scoring half) | `npx tsx src/scoring/flat.test.ts` | SPEC AC#8 (upgraded from Known-Gap) |
| `src/transport/local.ts` | Fully-Automated | Token auth (401/200), SSE frame delivery, teardown, path-traversal rejection (case (e), closes F5) | `npx tsx src/transport/local.test.ts` | Host-auth mitigation from INNOVATE risk table |
| `src/engine/broadcast.ts` (redaction call site) | Fully-Automated | Injected fake `TransportHandle` never receives `answer`/`acceptedAnswers`/`hostNote`/`correctChoiceIndex`/`numericAnswer` on `'stage'`/`'player'` channels | covered inside `session.test.ts` or a dedicated `broadcast.test.ts` | SPEC AC#4 (existing coverage) + AC#7 data-boundary half |
| Stage/host import isolation | Fully-Automated | Static grep for forbidden cross-imports | `node scripts/check-stage-host-isolation.mjs` | SPEC AC#7 bundle-boundary half (upgraded from "future addition") |
| `npm run typecheck && npm test` | Fully-Automated | Whole-project type safety (now including `vite.config.ts`, closes F6) + full aggregate suite green | `npm run typecheck && npm test` | SPEC AC#12 |
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
test("a single host action composed of 2-3 intents (onSelect/resolveAnswer shape) is fully reversed by exactly one undo() call", () => { throw new Error("NOT IMPLEMENTED") })
test("validateConfigPluginsT1 rejects an unregistered built-in style kind (e.g. 'trivia') the same way it rejects an unregistered custom plugin", () => { throw new Error("NOT IMPLEMENTED") })
test("GET requests attempting path traversal outside staticDir are rejected with 403/404, never 200", () => { throw new Error("NOT IMPLEMENTED") })
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `validateConfigPlugins.test.ts` | Fully-Automated | AC#3 |
| `bootstrap.test.ts` | Fully-Automated | AC#3 (built-in style kinds, closes F2) |
| `phase.test.ts` (L1 truth table) | Fully-Automated | Live-event requirement: unmodelled transitions are the named failure mode (`ARCHITECTURE.md` §5) |
| `intents.test.ts` | Fully-Automated | Immutability requirement (coding-style.md) applied to engine state |
| `log.test.ts` | Fully-Automated | AC#6 (single-intent AND host-action-batch granularity, closes F1) |
| `session.test.ts` | Fully-Automated | AC#11, invariant #2 |
| `host-manual-round.test.ts` | Fully-Automated | AC#5 (automated half) |
| `grid.test.ts` | Fully-Automated | Style contract compliance |
| `flat.test.ts` | Fully-Automated | AC#8, invariant #3; streak/comeback warn-once (closes F3 silent half) |
| `local.test.ts` | Fully-Automated | Host-auth risk mitigation (INNOVATE vc-predict Medium risk); path-traversal containment (closes F5) |
| redaction-call-site test | Fully-Automated | AC#4, AC#7 (data half), invariant #4 |
| `check-stage-host-isolation.mjs` | Fully-Automated | AC#7 (bundle half) |
| `npm run typecheck && npm test` | Fully-Automated | AC#12 (now including `vite.config.ts`, closes F6) |
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
12. Running `npx tsx src/engine/log.test.ts` cases (d) and (e) passes: a
    2-intent host action (matching `grid.onSelect`) and a 3-intent host
    action (matching `resolveAnswer`) are each fully reversed by exactly ONE
    `undo()` call. (SPEC AC#6 at host-action granularity; closes VALIDATE F1.)
13. Running `npx tsx src/registry/bootstrap.test.ts` passes: a config
    referencing an unregistered BUILT-IN style kind (e.g. `'trivia'`) is
    rejected by `validateConfigPluginsT1` with the same clarity as an
    unregistered `custom` plugin. (SPEC AC#3; closes VALIDATE F2.)
14. Running `npx tsx src/scoring/flat.test.ts` case (d) passes:
    `console.warn` fires exactly once per process when `streak`/`comeback`
    is enabled but unimplemented, and never alters `score()`'s return value.
    (Closes VALIDATE F3's silent-under-scoring half.)
15. Running `npx tsx src/transport/local.test.ts` case (e) passes: path-
    traversal requests against the static file route are rejected with
    `403`/`404`, never `200`, and never leak file content outside
    `staticDir`. (Closes VALIDATE F5.)

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
4. **Host token comparison is not constant-time** (VALIDATE F8, accepted as
   non-blocking). `local.ts`'s `token !== options.hostToken` check (item 18)
   is a plain string inequality. Given the plan's own accepted local-LAN-only
   threat model (Risks table) and a high-entropy `crypto.randomUUID()`
   secret (122 bits of randomness), a timing side-channel attack recovering
   the token over a live LAN during a show is not a credible risk for this
   application class. This is a documented, deliberate acceptance — not an
   oversight — and applies only under T1's stated threat model; it must be
   revisited if this transport is ever exposed beyond the venue LAN, which
   the SPEC explicitly rules out for T1.

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
- `src/registry/bootstrap.test.ts` (added by the 24-08-26 PVL supplement,
  closing VALIDATE F2) adds one more file to the `**/*.test.ts` count beyond
  what was tallied when L11 was written — `scripts/run-tests.mjs`'s
  discovery-based aggregation already handles this correctly (it discovers
  test files dynamically, so no aggregator change is needed), but the
  Vitest-migration trigger discussion above should be read as a floor, not
  an exact count.

---

## Dependencies and Sequencing

Sub-Phases 1 → 2 → {3, 4 in parallel} → {5, 6, both depend on 3 and 4} → 7
(depends on 3,4,5,6) → 8 (cross-cutting, runs last). Sub-Phase 0 has no
dependency and may run anytime before Sub-Phase 8's full gate sequence.
Within Sub-Phase 7 (PVL supplement additions): item 27a (`bootstrap.test.ts`)
depends on item 27 (`bootstrap.ts`) and may run immediately after it, in
parallel with item 27b (`presets/demo-t1.ts`, no dependency on 27/27a);
item 28 (`server.ts`) depends on both 27b (for its new default argument)
and 27/27a (for the `validateConfigPluginsT1` preflight call).

## Risks

| Risk | Mitigation |
|---|---|
| Generic undo diff (L2/L3, batched per host action via L2a) is the highest-novelty piece of engine code — a subtle bug here breaks the log's audit guarantee. | Dedicated `log.test.ts` covers reversal-without-deletion, depth bounding, and empty-log no-op explicitly before any style/UI work depends on it (Sub-Phase 2 gates before 3/4 start). Extended (PVL supplement, F1) to also cover 2-intent and 3-intent host-action batches (cases (d)/(e)) — the exact granularity gap VALIDATE found. |
| Redaction could be forgotten at a new call site as the transport/UI grows. | L9 makes `broadcastState` the ONLY call site for `handle.broadcast(...)` in T1; enforced by not exposing `handle` directly to `server.ts`'s command-dispatch loop beyond that one function. |
| Host token could leak via server logs or browser history if mishandled. | Token travels only in the host URL's query string and the POST body — never logged by `local.ts` (no request logging is added in T1); documented as local-LAN-only threat model, consistent with SPEC's out-of-scope line on real auth/accounts. |
| Static file server on the venue LAN could be tricked into serving arbitrary host files via path traversal (VALIDATE F5). | `local.ts`'s static route resolves and prefix-checks every path against `staticDir` before reading (L14); `local.test.ts` case (e) asserts traversal attempts are rejected. |

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md`
2. **Last completed phase or step:** PLAN written, then PVL-supplemented
   (24-08-26) addressing VALIDATE's first-pass F1 (FAIL) and F2/F3/F5/F6/F7/F8
   (CONCERNs/notes) findings — see the Design Locks L2a/L12-L15 and the
   updated Sub-Phase 2/3/4/7/8 checklist items above. INNOVATE record
   persisted at `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_INNOVATE_24-08-26.md`
   (D2 carries a dated correction note from this same supplement pass).
   VALIDATE's first pass (`Gate: BLOCKED`, below) predates this supplement
   and does NOT reflect it — VALIDATE must re-run from V1. EXECUTE has not
   run.
3. **Validate-contract status:** a first-pass contract exists below
   (`Gate: BLOCKED`, dated 24-08-26) but is now STALE — it was written
   against the plan version before this PVL supplement. `ENTER VALIDATE
   MODE` to re-run from V1 against the supplemented plan before any EXECUTE
   work begins; do not treat the existing `BLOCKED` verdict as current.
4. **Supporting context files loaded during this PLAN pass:**
   `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`,
   `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_SPEC_24-08-26.md`,
   `src/registry/index.ts`, `src/config/types.ts`, `src/config/resolve.ts`,
   `src/config/defaults.ts`, `src/config/resolve.test.ts`,
   `presets/school-assembly.ts`, `CUSTOMIZATION.md`, `ARCHITECTURE.md`
   (§§2, 4, 5, 6, 9, 10), `package.json`, `tsconfig.json`. PVL-supplement
   pass (24-08-26) additionally re-read: this plan's own `## Validate
   Contract` section (F1-F8 findings), `src/registry/index.ts`
   (`GameEvent`/`Intent`/`StylePlugin` definitions, confirming no
   `actionId`/`groupId` field and confirming `payload` is untyped
   `Record<string, unknown>`), `tsconfig.json` (confirming `vite.config.ts`
   is excluded from `include`), `presets/school-assembly.ts` lines 90-125
   (confirming the streak-enabled round 2 and `trivia`-kind `final` round),
   `package.json`, this plan's own SPEC (AC#6, line 178), and this plan's
   own INNOVATE record (D2, appended with a dated correction note).
5. **Next step for a fresh agent picking up mid-execution:** the existing
   `Gate: BLOCKED` contract below predates this 24-08-26 PVL supplement and
   must NOT be treated as current — re-run VALIDATE from V1 first. If a
   validate-contract with `Gate: PASS` (or an accepted `CONDITIONAL`) from a
   run AFTER this supplement already exists, resume EXECUTE at the first
   unchecked Sub-Phase in the Implementation Checklist above (including new
   items 27a/27b), in order — do not skip ahead even if later sub-phases
   look independent; Sub-Phase 2 in particular (now including the L2a batch
   logic in item 8) must be fully green before 3/4 begin.

---

## Validate Contract

Status: BLOCKED
Date: 24-08-26
date: 2026-08-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Single non-phase-program plan, 1 dimension pass over 4 Layer-1 lenses + 9
Layer-2 sub-phase sections. This VALIDATE pass was executed as a single agent session
(Read + Bash tools only, no Agent/Task tool available in this invocation) rather than a
true parallel fan-out — findings below were produced by direct source-code cross-checks
against the plan's claims, sub-phase by sub-phase, in one pass. Signal count: 1/7 (single
package, no schema/auth/API/billing surface, single plan, ≤5 blast-radius files touched
that are *existing* files — the ~24 new files are creation targets, not concurrent-edit
targets). A true fan-out (parallel subagents, 4 dimension + ~9 section agents) would be the
textbook-correct strategy once the Agent tool is available for a re-run.

---

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | CONCERN — see F5 (static file path-traversal), F6 (vite.config.ts outside tsconfig include) |
| Test coverage | FAIL — see F1 (no test can exist for the missing one-click multi-intent undo guarantee; the plan's own TDD stubs don't cover it) |
| Breaking changes | PASS — verified zero required edits to `src/config/types.ts` or `src/registry/index.ts` across all 9 sub-phases (see Breaking Changes section) |
| Security surface | CONCERN — see F5 (path traversal), F8 (timing-unsafe token compare, accepted low-risk) |

| Layer 2 sections | Status |
|---|---|
| Sub-Phase 0 — validateConfigPlugins test coverage | CONCERN — see F2 (the function this sub-phase tests has a real coverage gap: non-`custom` style kinds aren't validated at all) |
| Sub-Phase 1 — Phase machine | PASS |
| Sub-Phase 2 — Intent application + event log + generic undo | **FAIL — see F1.** This is the plan's own named top risk, and the probe confirms the hazard is real, though not the exact shape the plan's Risks table anticipated. |
| Sub-Phase 3 — grid style + flat scoring | CONCERN — see F3 (bundled demo preset exercises the documented streak gap and an unregistered style) |
| Sub-Phase 4 — local transport + auth | CONCERN — see F5, F7, F8 |
| Sub-Phase 5 — Stage view | PASS (mechanically sound; import-isolation check covers the documented invariant, with one shallow-check caveat noted as an open gap, not a blocker) |
| Sub-Phase 6 — Host controller | PASS (contract-level; token URL handling correct) |
| Sub-Phase 7 — Integration entrypoint | CONCERN — see F3 (default demo preset argument will crash mid-show) |
| Sub-Phase 8 — Cross-cutting gates | CONCERN — see F6 |

**Totals: 1 FAIL / 8 CONCERNs / 8 PASSes**

**→ Net Gate: BLOCKED**

One unresolved FAIL (F1) is sufficient to block per the standard rule (any FAIL → BLOCKED
unless explicitly converted to CONDITIONAL by a user, and no user is present in this
session to make that call). F1 is not a hypothetical edge case — it fires on the two most
common host actions in the entire show (select a question; mark an answer correct or
wrong), so it cannot be waved through as an acceptable residual.

---

### F1 — [FAIL] Generic undo operates per-Intent, but a single host action can be multiple Intents — one-click-undo is not actually guaranteed

**This was the specific hazard requested for deep probing (the generic undo diff). The
verdict is FAIL, but not for the reason the plan's own Risks table anticipated.**

**What the plan's Risks table worried about:** a *shallow diff on a nested structure*
producing a wrong inverse patch (e.g. Set/array fields, or a nested team object inside
`teams`).

**What the probe found instead:** the snapshot mechanism itself is sound for a *single*
intent. `applyIntentWithLog` snapshots the *entire* value under each touched top-level key
(`state[key]`) before calling `applyIntent`, and `applyIntent` is specified to always build
brand-new object/array/Set graphs rather than mutate in place (item 6: new `Set` for
`consumed`, new array + new team object for `teams`). Because the snapshot captures the
**whole** pre-image of the key (not a computed per-field delta), and because old references
are never mutated once superseded, `event.undo = { ...snapshottedKeys }` is a faithful
whole-key checkpoint — restoring it does *not* reintroduce a stale sibling, *provided* the
immutable-update discipline in item 6 is followed exactly and `INTENT_TOUCHED_KEYS` is
exhaustive for what each intent actually writes. On that specific, narrower question — is a
Set/array/nested-object diff itself correct — the design is technically sound as specified.

**The real, load-bearing bug is one level up: granularity mismatch between "Intent" (the
unit `applyIntentWithLog`/`undo()` operate on) and "host action" (the unit the SPEC and this
plan's own Goal 2 require undo to reverse in one click):**

- `grid.onSelect(state, questionId)` (item 12) returns **two** intents:
  `[{type:'selectQuestion', questionId}, {type:'setPhase', phase:'reading'}]`.
- `session.ts`'s `resolveAnswer()` (Design Lock L6) "emits `awardPoints` +
  `consumeQuestion` + `setPhase` intents generically for every style" — **three** intents
  for a single "mark correct / mark wrong" host click.
- `applyIntentWithLog(state, intent, seq, at)` (item 8) takes exactly **one** `Intent` and
  produces exactly **one** `GameEvent`. There is no batching parameter.
- `undo(state, depth)` (item 9) reverses **the single most recent un-reversed `GameEvent`**
  by applying its own `.undo` patch and appending one synthetic reversal event.
- `GameEvent` (`src/registry/index.ts:66-73`, confirmed by direct read) has fields
  `seq, at, name, payload, undo?` — **no `actionId`/`groupId`/batch field exists anywhere
  in the data model** to mark "these N events came from one host click and must be undone
  together."

**Consequence, concretely:** after a host selects a question (2 intents → 2 separate log
entries), pressing "undo" once reverses only the `setPhase` half — `currentQuestionId`
stays set to the selected question, requiring a **second** undo press to fully back out of
the selection. After a host marks an answer correct (3 intents → 3 separate log entries:
`awardPoints`, `consumeQuestion`, `setPhase`), a single undo press reverses only the *last*
of the three (`setPhase`) — the score stays awarded and the question stays consumed. The
host would need **three** separate undo presses, applied correctly and in order, with the
UI accurately reflecting each intermediate (half-undone) state, to fully reverse one mark-
correct click. This directly contradicts:

- **PLAN Goal 2**: "Undo reverses the single most recent action in one host interaction,
  with zero hand-written per-intent-type inverse logic."
- **SPEC AC#6**: "The most recent scoring or phase-changing action can be reversed in a
  single host interaction."
- **Host controller item 25**: "Undo button always visible and reachable in exactly one
  click/tap (SPEC AC#6 / live-event requirement)."
- The live-event framing throughout the SPEC ("a misclick under pressure in front of an
  audience is recoverable in one action, not several").

**Why this is a FAIL, not a CONCERN:** it is not an edge case — it fires on the two most
frequent host actions in the entire show (select-question, mark-correct/wrong), it is
architectural (no amount of careful EXECUTE-time coding closes it without a data-model or
dispatch-model change), and no test in the plan would catch it. `log.test.ts` item 10 only
exercises a single, isolated `awardPoints` → `undo` round trip (one intent, not a multi-
intent host action) — it would pass green while the real multi-intent case silently ships
broken. `host-manual-round.test.ts` is scoped to prove AC#5 (zero-player playability, a full
round loop), not AC#6 (undo), per the Test Plan / Verification Evidence tables — no test
anywhere asserts "N host actions applied, N `undo()` calls fully reverse them one action
per call."

**What licenses the FAIL classification, stated precisely:** the mechanism as specified
correctly implements per-Intent undo. It does not implement per-host-action undo. Since the
plan's own Goal 2 and the SPEC's AC#6 are stated at the host-action granularity, and the
implemented mechanism operates at the finer Intent granularity with no grouping construct
between them, the gap is real and must be closed in this plan before EXECUTE, not
discovered live.

**Closing this requires a genuine design decision** (INNOVATE-adjacent, but small enough to
resolve as a plan supplement rather than a full INNOVATE re-pass) — two viable directions,
neither requiring a `src/registry/index.ts` or `src/config/types.ts` change:

- **Option A — group by call site, not by data model.** Add an internal (non-exported,
  `src/engine/` only) `applyIntents(state, intents: Intent[], seq0, at): { state, events:
  GameEvent[] }` that calls `applyIntentWithLog` once per intent but merges their `.undo`
  patches into the union of all touched keys and tags the events with a shared, added-in-
  T1 (non-`GameEventName`) marker so `undo()` can detect "these consecutive log entries
  belong to one host action" and reverse all of them in a single `undo()` call. Requires
  extending `GameEvent`'s `payload`/a new field to carry a group marker — but `GameEvent`
  is defined in `src/registry/index.ts` (line 66-73), so this needs either (a) confirming
  `payload: Record<string, unknown>` is loose enough to carry `{ actionId }` without a type
  change (it is — `payload` is already untyped `Record<string, unknown>`, so no interface
  edit is needed, only a documented convention), or (b) adding a dedicated field, which
  WOULD require a `registry/index.ts` edit (out of scope per this plan's own constraint).
  **Prefer (a)**: thread `payload.actionId` (a per-host-action UUID or the seq of the first
  event in the group) through every intent, generated once per `onCommand` dispatch in
  `server.ts`, and have `undo()` collect and reverse every event sharing the most recent
  action's `actionId` in one call. No contract change.
- **Option B — collapse multi-intent host actions into a single intent at the source.**
  Instead of `onSelect`/`resolveAnswer` returning multiple fine-grained intents, have
  `session.ts` apply them via one `applyIntentWithLog`-equivalent call that snapshots the
  UNION of all keys touched by the whole intent batch up front, applies all intents in
  sequence, and logs exactly ONE `GameEvent` for the whole batch (with `name` chosen per
  the existing L4 fallback rules using the *last* intent's mapped name, and `undo` covering
  every key any intent in the batch touched). This keeps `GameEvent`/`Intent` untouched and
  requires no new field — only a small addition to `log.ts`'s public surface
  (`applyIntentsWithLog(state, intents: Intent[], seq, at)`Plural variant, or a
  documented convention that `session.ts` is the ONLY caller of `applyIntentWithLog` and
  it always batches). **This is the cleaner fix** — it keeps `undo()`'s existing single-
  event semantics exactly as specified and only changes how `session.ts` groups its own
  internal calls; no data-model change of any kind.

Recommend **Option B** in the SUPPLEMENT REQUEST below — it requires zero changes to
`GameEvent`/`Intent` and keeps `undo()` as specified, only adding a `applyIntentsWithLog`
(or equivalently, having `session.ts` call a small internal helper that snapshots the
union of touched keys across a whole `Intent[]` batch before applying any of them).

---

### F2 — [CONCERN] `validateConfigPlugins()` does not check built-in (non-`custom`) style kinds against the `style` registry

Confirmed by direct read of `src/registry/index.ts:262-292`: the only style-related check is

```
if (round.style.kind === 'custom') {
  check('style', round.style.plugin, `program.rounds[${i}].style.plugin`)
}
```

`StyleConfig` (`src/config/types.ts:314-317`) is a closed discriminated union
(`GridStyle | WheelStyle | ListStyle | TicTacStyle | HangmanStyle | TriviaStyle |
CustomStyle`) where the built-in kinds (`grid`, `wheel`, `list`, `tictac`, `hangman`,
`trivia`) are literal strings, not a `RegistryKey` field that gets validated. There is no
code path in `validateConfigPlugins()` that checks whether `round.style.kind` (for a
non-`custom` round) is actually registered under `'style'`. Since T1's `bootstrap.ts`
registers only `'grid'` (item 27), a preset with a `wheel`/`list`/`tictac`/`hangman`/
`trivia` round will pass preflight cleanly and then throw at runtime
(`resolve('style', 'trivia')` → `Error('unknown style plugin "trivia"')`) whenever that
round is reached mid-show. This directly undermines the exact promise the preflight
mechanism exists for — SPEC AC#3: "a typo... caught in the green room, not on stage."

**This is not hypothetical** — see F3: `presets/school-assembly.ts`, the plan's own bundled
demo config, reproduces exactly this failure mode in round 3.

**Recommended fix (small, in-scope, no `registry/index.ts` change):** extend
`validateConfigPlugins()`'s round-loop check (in `bootstrap.ts` or a new thin wrapper the
`server.ts` preflight calls, NOT by editing the exported function in `registry/index.ts`
itself — or, if editing `validateConfigPlugins()` in `registry/index.ts` is acceptable
since it's additive/backward-compatible, note that as a deviation from the "zero registry
edits" claim and get explicit confirmation) to also check
`check('style', round.style.kind, ...)` unconditionally, not only for `kind === 'custom'`.
**Because this technically touches `src/registry/index.ts` (currently on the "do not
modify" list), the supplement must either (a) implement this check in `bootstrap.ts` /
`server.ts` as a T1-local wrapper around `validateConfigPlugins()` that adds the extra
check without editing the exported function, or (b) get an explicit, recorded decision to
make a small additive edit to the exported function.** Prefer (a) to honor the plan's own
"do not modify" contract; flagging this precisely so the supplement doesn't accidentally
violate Breaking Changes by editing the protected file.

---

### F3 — [CONCERN] Bundled default preset is inconsistent with T1's own documented scope, and `server.ts` defaults to it

Confirmed by direct read of `presets/school-assembly.ts` and `src/config/defaults.ts`:

- Round 2 (`r2`, `style.kind: 'grid'` — in T1 scope) sets
  `overrides.rules.scoring.streak.enabled: true, threshold: 2` (line 104). The preset never
  overrides `rules.scoring.engine`, so round 2 resolves to the default `'flat'` engine
  (`src/config/defaults.ts:70`). Per this plan's own Design Lock L5, `flat.ts` does **not**
  implement streak even when enabled — an intentional, documented T1 gap. The consequence:
  round 2 will silently under-score any team on a hot streak, with zero warning, zero
  error, and no visible signal to the host that anything is wrong.
- Round 3 (`final`, `style.kind: 'trivia'`) is not a T1-registered style at all (see F2) —
  it will hard-crash if reached.
- `server.ts` (item 28) reads the preset path from `process.argv[2]`, **defaulting to
  `presets/school-assembly.ts`** when no argument is given. That means the plan's own
  "getting started" path — `npm run show` with no arguments — is guaranteed to (a) silently
  mis-score round 2 and (b) crash outright on round 3, for anyone who runs the bundled demo
  past round 1.

**Why this is a CONCERN and not folded into the FAIL:** narrowly read, PLAN Goal 1 and SPEC
AC#11 only require "a complete `grid`-style round" / "one complete round" — round 1 alone
satisfies both literally, and L5 already documents the streak omission as intentional. But
the plan's own chosen default entrypoint argument actively exercises both gaps, which is a
real and easily-hit rehearsal/live-event failure mode (a host clicking past round 1 is the
overwhelmingly likely real-world path), and it directly contradicts the SPEC's own framing
that on-stage crashes are "a defect, not an edge case."

**Resolution options (pick one in the supplement):**
- **A.** Change `server.ts`'s default argument (or add a T1-scoped demo preset,
  e.g. `presets/school-assembly-t1-demo.ts`) that only includes the `grid`-style rounds
  with streak left off, so the zero-argument path actually completes end-to-end.
- **B.** Strip the `streak.enabled: true` override from `school-assembly.ts` round 2 and
  replace the `final` round's `trivia` style with a second `grid` round (or document that
  `school-assembly.ts` is a T2+ fixture and is not expected to run under T1 — but then the
  Sub-Phase 7 default argument should NOT point at it).
- **C.** Have `flat.score()` throw or log a loud warning when it detects
  `rules.scoring.streak.enabled === true` or `.comeback.enabled === true` (a "your config
  asked for a scoring feature this engine build doesn't implement" guard) — closes the
  *silent* half of the problem even if the crash-on-`trivia` half (F2) is fixed separately.

---

### F4 — [PASS, confirmed] Breaking changes — zero required edits to `src/config/types.ts` or `src/registry/index.ts`

Verified directly, sub-phase by sub-phase:
- `TransportHandle` is unmodified; the host token is threaded through
  `TransportPlugin<O>.start(options: O)`'s already-generic `O` parameter (confirmed generic,
  `src/registry/index.ts:178-190`) — no interface change needed for L7.
- No new `GameEventName` member is added (Open Item 1 explicitly defers this to T2); the L4
  fallback-mapping table works within the existing closed union (confirmed against
  `src/config/types.ts:778-786` — none of `setTurn`, `stopClock`, `playSound`, `effect`,
  `custom` have an exact match, all use documented fallbacks, consistent with the plan's
  own framing).
- `register`/`resolve`/`list`/`validateConfigPlugins` (the only registry exports touched)
  are called, not edited, by `bootstrap.ts`.
- **Exception carried forward from F2**: closing F2 properly may require a small additive
  edit to `validateConfigPlugins()` in `registry/index.ts` unless the wrapper approach
  (Option a) is used. This is noted so the supplement doesn't accidentally regress this
  PASS finding.

---

### F5 — [CONCERN] `local.ts`'s static file server has no specified path-traversal containment

Item 18's "any other GET" route: "serve the matching file under `options.staticDir`
(default `dist/`) via `node:fs.readFile`" does not mention normalizing or containing the
resolved path within `staticDir`. This is a `node:http` server bound to the venue LAN
(exactly the same threat surface the host-auth token was added to defend — INNOVATE's
Medium-risk finding). A request such as `GET /../../../../etc/passwd` (or any encoded
variant) against a naive `path.join(staticDir, req.url)` implementation could read arbitrary
files off the host laptop if the resolved path isn't checked to stay inside `staticDir`.
`local.test.ts` (item 19) does not include a path-traversal scenario in its four listed
cases. **Recommended fix:** resolve the requested path with `path.resolve`, verify (via
`path.relative` or a prefix check) it stays within the resolved `staticDir`, and respond
`403`/`404` otherwise — plus add a fifth `local.test.ts` case asserting a traversal request
is rejected.

---

### F6 — [CONCERN, minor] `vite.config.ts` is outside tsconfig's `include`, and neither gate type-checks it

`tsconfig.json`'s `include: ["src/**/*", "presets/**/*"]` (confirmed by direct read) does
not cover the new root-level `vite.config.ts` (Sub-Phase 8, item 30). `npm run typecheck`
(`tsc --noEmit`) therefore never type-checks it. `npm run build` (`vite build`, item 34's
gate sequence) uses Vite's esbuild-based transpilation, which strips types without checking
them — so a type error in `vite.config.ts` would not be caught by either of the two gates
in the plan's own "must succeed" sequence. The plan's claim "tsconfig.json needs no
change... already covers every new directory" (lines 148-149) is true for the new `src/**`
subdirectories but overlooks this one root-level file. **Recommended fix:** add
`"vite.config.ts"` to tsconfig's `include` array (one-line, additive, no behavior change to
anything already covered).

---

### F7 — [CONCERN, minor] `startClock`'s `ms` semantics and resume-anchor derivation are underspecified

Item 25's resume flow: the host computes `remainingMs = questionSec*1000 -
(Date.now() - clockStartedAt)` client-side, then `POST { type:'startClock', payload:{ ms:
remainingMs } }`. Item 6's `applyIntent` description doesn't state how `clockStartedAt` is
derived from an incoming `ms` value that represents *remaining* time rather than an
absolute anchor (naively setting `clockStartedAt = Date.now()` would restart the full
`questionSec` countdown instead of resuming from where it was paused, losing already-
elapsed time). **Recommended fix (execute-agent instruction, not a design change):**
`applyIntent` for `startClock` should compute
`clockStartedAt = Date.now() - (questionSec*1000 - intent.ms)` so the client-rendered
countdown (D5's formula, `questionSec*1000 - (now - clockStartedAt)`) correctly resumes
from `ms` remaining rather than restarting.

---

### F8 — [Note, accepted low-risk] Host token comparison is not constant-time

`token !== options.hostToken` (item 18) is a plain string inequality, not a constant-time
comparison. Given the plan's own accepted local-LAN-only threat model (Risks table: "local-
LAN-only threat model, consistent with SPEC's out-of-scope line on real auth/accounts") and
a high-entropy `crypto.randomUUID()` secret (122 bits of randomness), a timing side-channel
attack recovering the token character-by-character over a live LAN during a show is not a
credible risk for this class of application. **Not blocking.** Noted for completeness per
the requested security review; no action required unless the threat model changes (e.g. if
this transport is ever exposed beyond the venue LAN, which the SPEC explicitly rules out for
T1).

---

### Test Coverage Plan (C-4 5-column form; additive to the plan's own already-thorough Test Plan / Verification Evidence tables, which are reused here rather than duplicated)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| SPEC-AC3 | Preflight catches unregistered plugin keys (transport/scoring/style-custom/lifeline/handler/widget) | Fully-Automated | `npx tsx src/registry/validateConfigPlugins.test.ts` | A |
| SPEC-AC3-gap | Preflight catches unregistered **built-in** style kinds (grid/wheel/list/tictac/hangman/trivia) | Fully-Automated | none exists — **new test required by F2's supplement** | B |
| L1 | Full phase transition truth table | Fully-Automated | `npx tsx src/engine/phase.test.ts` | A |
| Immutability | Per-intent touched-key update + untouched-key reference identity | Fully-Automated | `npx tsx src/engine/intents.test.ts` | A |
| SPEC-AC6 (single-intent) | `awardPoints` → `undo()` restores prior score, log grows not shrinks | Fully-Automated | `npx tsx src/engine/log.test.ts` | A |
| **SPEC-AC6 (host-action, F1)** | **A single host action (2-3 intents) is fully reversed by ONE `undo()` call** | Fully-Automated | **none exists — new test required by F1's supplement (both `onSelect`'s 2-intent batch and `resolveAnswer`'s 3-intent batch need a dedicated round-trip case)** | **B** |
| SPEC-AC11 | `structuredClone` isolation — post-create config mutation doesn't leak into session | Fully-Automated | `npx tsx src/engine/session.test.ts` | A |
| SPEC-AC5 | Full host-manual round, zero player devices, select→reveal→award→next to `isRoundComplete` | Fully-Automated | `npx tsx src/engine/host-manual-round.test.ts` | A |
| Style contract | Board build, availability, select intents, completion | Fully-Automated | `npx tsx src/styles/grid.test.ts` | A |
| SPEC-AC8 | Scoring purity via recursively-frozen state harness + formula correctness | Fully-Automated | `npx tsx src/scoring/flat.test.ts` | A |
| Host-auth | Token 401/200, SSE delivery, teardown | Fully-Automated | `npx tsx src/transport/local.test.ts` | A |
| **Host-auth-gap (F5)** | **Static file route rejects path-traversal requests** | Fully-Automated | **none exists — new case required in `local.test.ts` by F5's supplement** | B |
| SPEC-AC4 / AC7-data | `broadcastState` never sends answer/acceptedAnswers/hostNote/correctChoiceIndex/numericAnswer on stage/player | Fully-Automated | inside `session.test.ts` or dedicated `broadcast.test.ts` | A |
| **L9-gap (F4 dimension)** | **`handle.broadcast(...)` is called ONLY from `broadcast.ts`** | Fully-Automated | **none exists — recommend a grep script analogous to `check-stage-host-isolation.mjs` (execute-agent instruction, not a hard blocker)** | D |
| SPEC-AC7-bundle | No `src/stage/**` import reaches `src/host/**` | Fully-Automated | `node scripts/check-stage-host-isolation.mjs` | A |
| SPEC-AC12 | Whole-project typecheck + full aggregate suite green | Fully-Automated | `npm run typecheck && npm test` | A |
| **F6-gap** | **`vite.config.ts` is type-checked by some gate** | Fully-Automated | **add `"vite.config.ts"` to tsconfig `include`; then covered by `npm run typecheck`** | B |
| SPEC-AC9 (visual) | Projector legibility from back of room | Agent-Probe | manual per `ARCHITECTURE.md` §9 | A (manual gate, run at EXECUTE close) |
| Host-auth smoke | Token required, visible failure without it | Agent-Probe | manual browser network-tab check alongside `local.test.ts` | A |
| SPEC-AC5 (manual) | Full pre-show dry run, real venue network | Agent-Probe | manual per `ARCHITECTURE.md` §9 checklist | A |
| SPEC-AC10 | Buzzer fairness | Known-Gap (documented) | — | no input plugin exists until T3/T4 — correctly out of T1 scope |
| SPEC-AC9 (auto) | Visual regression on theming | Known-Gap (documented) | — | Playwright screenshot diffing is future work, correctly deferred |

gap-resolution legend: A — proven now (gate passes once EXECUTE lands). B — must be fixed
in this plan via the supplement before the row can read A. D — backlog test-building stub
(named residual; recommended but not blocking — see F4 note).

**What this coverage does NOT prove:**
- The full 5-column table above proves each row's named behavior only. It does NOT prove
  that a multi-intent host action is fully reversible in one click (F1) until the B-marked
  row for that is added and passes — this is exactly why the net gate is BLOCKED, not
  CONDITIONAL.
- `check-stage-host-isolation.mjs` proves *source-level* direct import isolation for files
  directly under `src/stage/`. It does NOT prove transitive isolation (e.g. if a shared
  `src/engine/` file some day imported from `src/host/`) and does NOT inspect the *built*
  `dist/stage/*.js` bundle contents — it is a pre-build static check only.
- `local.test.ts`'s SSE assertion proves message delivery shape, not multi-client fan-out
  behavior under load, nor reconnect-after-drop semantics beyond "the browser's native
  auto-reconnect keeps last state visible" (which is asserted structurally in `stage/main.ts`
  but not exercised by an automated test — it is implicitly covered only by the Agent-Probe
  manual dry-run).
- None of the Fully-Automated rows prove anything about concurrent host devices (two
  browsers open to `host.html` simultaneously) — not a T1 requirement per the SPEC (single
  host), but worth naming as an untested assumption.

---

### Open gaps

- F1 (FAIL) — multi-intent host actions not atomically undoable in one click. Must be
  closed via plan supplement before EXECUTE.
- F2 (CONCERN) — `validateConfigPlugins()` doesn't check built-in style kinds.
- F3 (CONCERN) — bundled default preset (`school-assembly.ts`) silently breaks under T1
  once past round 1; `server.ts`'s default argument points at it.
- F5 (CONCERN) — static file server has no path-traversal containment.
- F6 (CONCERN, minor) — `vite.config.ts` outside tsconfig `include`.
- F7 (CONCERN, minor) — `startClock` resume-anchor derivation underspecified.
- F8 (note, accepted) — non-constant-time token comparison; not blocking.

Accepted by: n/a — Gate is BLOCKED, not CONDITIONAL. No concerns have been accepted; the
FAIL (F1) has not been resolved or explicitly converted to CONDITIONAL by a user in this
session.

Gate: BLOCKED

---

## Autonomous Goal Block

```
SESSION GOAL: Ship T1 (playable core, host-manual) of the TriviaMaker game-show engine — phase machine, generic undo, grid+flat, local transport with host-auth, stage+host UI, runnable end-to-end with zero player devices.
Charter + umbrella plan: N/A — single plan, no phase-program umbrella exists for this work.
Autonomy: standard RIPER-5 gates apply. VALIDATE gate is BLOCKED — EXECUTE is not authorized until F1 (and, ideally, F2/F3/F5/F6/F7) are closed via a plan supplement and VALIDATE is re-run to PASS or an explicit user-accepted CONDITIONAL.
Hard stop conditions / safety constraints:
- Do not route to or begin EXECUTE MODE while this contract's Gate reads BLOCKED.
- Do not modify src/config/types.ts or src/registry/index.ts (settled T0 contracts) when closing F1/F2 — prefer the wrapper/payload-convention fixes named in the F1/F2 findings over any interface edit.
- The generic-undo fix (F1) must guarantee one host action = one undo() call, covering both the 2-intent onSelect() batch and the 3-intent resolveAnswer() batch, before this plan can PASS.
Next phase: PLAN supplement (vc-plan-agent, PVL-supplement mode) addressing the SUPPLEMENT REQUEST below, then re-run VALIDATE from V1.
Validate contract: inline in plan, this section (process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md).
Execute start: BLOCKED — not applicable until Gate reads PASS or an accepted CONDITIONAL. Once unblocked: `npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`; high-risk pack: no (no auth/billing/schema/migration/public-API/deploy surface — host token is a local-LAN session secret, not user auth).
```
