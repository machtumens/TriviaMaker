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
per-item checklist notes below for exactly what changed. **A second,
cycle-3 PVL supplement (24-08-26)** closed three new CONCERNs VALIDATE's
cycle-2 re-run found (G1 — `applyIntentsWithLog`'s sole-caller claim was
self-contradictory; G2, material, blocked Goal 1 — `grid.buildBoard` had no
channel to real question content; G3 — an unwritable `intents.test.ts`
assertion) plus two non-blocking residuals (F2 citation, F7 null-guard) —
see Design Lock L16, item 11a, and the per-item notes below.

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
| **L16 — `session.ts` dispatch wrapper + grid content resolution (PVL supplement, cycle 3, 24-08-26, closes VALIDATE G1 + G2)** | `session.ts` exports `resolveRoundContent(config, round): Category[]` (resolves `round.bankId`/`categoryIds` against `config.content.banks`, throws descriptive errors on a missing bank or unknown category — item 11a) and `dispatchHostAction(state, intents, seq, at)` (a thin wrapper around `log.ts`'s `applyIntentsWithLog` — the ONLY call site for it anywhere in the codebase, item 11a). `grid.ts` defines a T1-local `GridBuildOptions = GridStyle & { categories: Category[] }` (item 12) so `buildBoard` receives real, caller-resolved content instead of a bare `GridStyle`. Zero edits to `src/config/types.ts`/`src/registry/index.ts` — both fixes use already-exported types and `StylePlugin<O>`'s free generic. |

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
  host action's `Intent[]` into one `GameEvent`), `dispatchHostAction` (L16,
  item 11a, PVL supplement, cycle 3, closes VALIDATE G1 — a thin wrapper
  around `applyIntentsWithLog`; `session.ts` is the ONLY caller of
  `applyIntentsWithLog` anywhere in the codebase), `resolveRoundContent`
  (L16, item 11a, closes VALIDATE G2 — resolves a round's
  `bankId`/`categoryIds` against `config.content.banks` into `Category[]`
  before `buildBoard` needs it), `undo`, `resolveAnswer`. `server.ts`
  (item 28) and, indirectly via HTTP, the host controller call
  `dispatchHostAction` — NEVER `applyIntentsWithLog` directly (corrected
  from the plan's previous self-contradicting wording, which this same
  bullet was part of — closes VALIDATE G1). This is the new internal API
  surface EXECUTE and later tiers build on.
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
   | `consumeQuestion` | `consumed` |
   | `selectQuestion` | `currentQuestionId` |
   | `setTurn` | `turnTeamId` |
   | `lockout` | `lockedOutTeamIds` |
   | `startClock` | `clockStartedAt` |
   | `stopClock` | `clockStartedAt` |
   | `playSound` | *(none — presentation-only, no state touched)* |
   | `effect` | *(none)* |
   | `eliminate` | `teams` |
   | `custom` | *(none by default — no generic way to know; document as a known limitation, see Open Items)* |

   **`phase` removed from `consumeQuestion`'s and `selectQuestion`'s rows
   (PVL supplement, cycle 3, closes VALIDATE G3).** `setPhase` is the sole
   owner of phase transitions in every batch this plan defines — both
   `grid.onSelect`'s 2-intent batch and `resolveAnswer`'s 3-intent batch
   always include a trailing `setPhase` — and neither the `consumeQuestion`
   nor `selectQuestion` `Intent` variant carries a phase-related field to
   derive a value from (confirmed against `src/registry/index.ts:76-88`).
   The union-snapshot algorithm (L2a) is deliberately over-inclusive-safe —
   listing an extra key costs nothing — but these two entries implied
   `applyIntent` must WRITE a `phase` value with no rule for what value,
   which is a genuine spec gap, not intentional safety margin. Removing
   them makes item 7's `intents.test.ts` writable exactly as specified,
   with no invented behavior.

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
   `state.config` for the round containing `state.currentQuestionId`.
   **Null guard (PVL supplement, cycle 3, closes VALIDATE F7 residual):**
   `TimerRules.questionSec` is typed `number | null`
   (`src/config/types.ts:452`; `null` means an untimed question). If the
   resolved `questionSec` is `null`, skip the resume-anchor arithmetic
   entirely and set `clockStartedAt = null` instead — an untimed question
   has no countdown to resume, so this is equivalent to a no-op
   pause/resume. Without this guard, `null * 1000` coerces to `0` in JS,
   producing a nonsense future-dated `clockStartedAt`. This makes the
   client-rendered countdown (`questionSec*1000 - (now -
   clockStartedAt)`, item 22) correctly resume from `intent.ms` remaining
   rather than restarting, for every timed question, and correctly no-ops
   for untimed ones. This is an EXECUTE-time instruction, not a
   design change — no new field or interface is introduced.
7. Create `src/engine/intents.test.ts`. One assertion block per intent type
   in the table above: apply, assert the touched key(s) changed and every
   OTHER top-level key is reference-equal (`===`) to the input state's value
   (proves untouched keys are never copied/reallocated). Assert `setPhase`
   with an illegal target throws via `assertTransition`. (PVL supplement,
   cycle 3, closes VALIDATE G3: after the `INTENT_TOUCHED_KEYS` fix above,
   `consumeQuestion` and `selectQuestion` each have exactly one touched key
   to assert — `consumed` and `currentQuestionId` respectively — so this
   item is writable exactly as specified with no invented `phase` value.)
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
   item 9, unchanged). The actual exported wrapper enforcing this is
   `session.ts`'s `dispatchHostAction` (item 11a, L16 — PVL supplement,
   cycle 3, closes VALIDATE G1); every other file, including `server.ts`
   (item 28), calls `dispatchHostAction`, never `applyIntentsWithLog`
   directly — this is what makes "session.ts is the ONLY caller" literally
   true rather than merely asserted.

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

11a. Create `src/engine/session.ts`'s `dispatchHostAction` and
    `resolveRoundContent` exports (L16, PVL supplement, cycle 3, closes
    VALIDATE G1 + G2). Full `session.ts` creation (`createSession`,
    `applyIntent` usage, `resolveAnswer`, etc.) is already covered by its
    existing Touchpoints/Public Contracts entries; this item specifies the
    two exports the cycle-2 VALIDATE findings require:
    - `dispatchHostAction(state: SessionState, intents: Intent[], seq: number, at: number): { state: SessionState; event: GameEvent }`
      — a thin wrapper whose entire body is
      `return applyIntentsWithLog(state, intents, seq, at)` (imported from
      `log.ts`, item 8/9). This is the ONLY place in the whole codebase
      that calls `applyIntentsWithLog` — `server.ts`'s `onCommand`
      (item 28) and any future call site call `session.dispatchHostAction(...)`,
      never `log.ts` directly. This makes item 8's "session.ts is the ONLY
      caller of `applyIntentsWithLog`" invariant literally true (closes
      VALIDATE G1 — Option (a) from the G1 finding — and resolves the
      item 8 vs item 28 vs Public Contracts contradiction VALIDATE found).
    - `resolveRoundContent(config: GameShowConfig, round: Round): Category[]`
      — resolves `round.bankId`/`round.categoryIds` against
      `config.content.banks` into the actual `Category[]` a style needs
      (closes VALIDATE G2). Must be called before any `buildBoard` call for
      that round — the natural call site is session.ts's own
      round-start/round-transition handling, per the `lobby -> board` /
      `reveal -> board` edges in L1's transition table. Exact behavior, in
      this order (input-validation cases at a trust boundary — not left to
      EXECUTE's judgement):
      1. If `round.bankId` is absent (`undefined`): throw
         `Error('[session] round "${round.id}": no bankId set; a grid-style round requires round.bankId')`.
      2. Look up `config.content.banks.find(b => b.id === round.bankId)`.
         If not found: throw
         `Error('[session] round "${round.id}": bankId "${round.bankId}" not found in content.banks. Known banks: ${config.content.banks.map(b => b.id).join(', ') || '(none)'}')`.
      3. If `round.categoryIds` is absent (`undefined`): return the found
         bank's full `categories` array, unfiltered, in the bank's own order.
      4. If `round.categoryIds` is present: for each id in
         `round.categoryIds`, find the matching `Category` in the bank. If
         ANY id has no match: throw
         `Error('[session] round "${round.id}": categoryIds references unknown category "${badId}" in bank "${round.bankId}". Known categories: ${bank.categories.map(c => c.id).join(', ')}')`
         (fail on the FIRST unmatched id found — do not silently drop it).
         If all ids match: return the categories in `categoryIds`'s given
         order (the show author's explicit ordering wins over bank order),
         one `Category` per id.
      `GridBuildOptions` (L16, item 12) is then assembled by the caller as
      `{ ...round.style, categories: resolveRoundContent(config, round) }`
      before invoking `grid.buildBoard(round, options)`.
      `dispatchHostAction`/`resolveRoundContent` are internal to
      `session.ts`; no `src/registry/index.ts` or `src/config/types.ts`
      edit is required for either (`GameShowConfig`, `Round`, `Category`
      are all already-exported types).

### Sub-Phase 3 — `grid` style + `flat` scoring (depends on 2; parallel-safe with 4)

12. Create `src/styles/grid.ts`. Define
    `type GridBuildOptions = GridStyle & { categories: Category[] }` (L16,
    PVL supplement, cycle 3, closes VALIDATE G2 — `GridStyle`/`Category` are
    already-exported types from `src/config/types.ts`; `StylePlugin<O>`'s
    `O` is a free, unconstrained generic per `src/registry/index.ts:94`, so
    no interface edit is required). Implement `StylePlugin<GridBuildOptions>`
    with `key: 'grid'`. `buildBoard(round, options)`: one `BoardModel` cell
    per `(row, col)` where `row` indexes `options.pointLadder` and `col`
    indexes `options.categories` — the round's resolved `Category[]`,
    assembled by the CALLER (`session.ts`'s `resolveRoundContent`,
    item 11a) and passed in as part of `options` BEFORE `buildBoard` is
    invoked; `grid.ts` itself never resolves `round.bankId`/`categoryIds`
    (this corrects the plan's previous self-contradictory description —
    `options` is `GridBuildOptions`, not the bare `GridStyle` config
    object, and it carries real resolved content rather than a
    claimed-but-absent "resolved question bank"). Each cell's `questionId`
    and `label` come from `options.categories[col].questions[row]` (show
    authors are expected to order each category's `questions[]` to match
    `pointLadder`'s row order; T1 does not validate this ordering at
    runtime — a documented limitation, not new scope for this supplement).
    `cells[].consumed` is computed from `state.consumed`, NOT stored
    separately. `availableQuestions(state, board)`: cell `questionId`s
    where `!state.consumed.has(id)`. `onSelect(state, questionId)`:
    return `[{type:'selectQuestion', questionId}, {type:'setPhase', phase:'reading'}]`
    (these two intents are applied and logged as ONE `GameEvent` by
    `session.ts`'s single `dispatchHostAction`/`applyIntentsWithLog` call —
    L2a/L16 — closing VALIDATE F1; `grid.ts` itself has no knowledge of
    batching). `onResolved(state, correct)`: return `[]` per L6 — grid has
    no style-specific extra consequences in T1. `isRoundComplete(state, board)`:
    true iff every cell's `questionId` is in `state.consumed`. Set
    `stageComponent`/`hostComponent` to placeholder string keys
    (`'grid-board'`/`'grid-host-board'`) — Sub-Phases 5/6 render by
    switching on these strings.
13. Create `src/styles/grid.test.ts`. Build a fixture `Category[]` (2
    categories x 3 questions each, `questions[]` pre-ordered to match a
    3-row `pointLadder`) and assemble
    `options: GridBuildOptions = { ...fixtureGridStyle, categories: fixtureCategories }`
    (PVL supplement, cycle 3, closes VALIDATE G2's test-coverage half).
    Assert `buildBoard` cell count equals `columns * rows`; assert AT LEAST
    ONE cell's `questionId` and `label` match a specific fixture question's
    real `id`/`prompt` — not merely a correct count, which is exactly what
    VALIDATE flagged as passing against an empty/placeholder board; assert
    `availableQuestions` excludes a pre-consumed id; assert `onSelect`
    returns exactly the two intents above in order; assert
    `isRoundComplete` is false with one cell unconsumed and true when all
    are consumed.
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
    using the literal template
    (`"${where}: unknown style plugin \"${kind}\". Registered: ${known}"`)
    when it is not registered. (Citation correction, PVL supplement, cycle
    3, closes VALIDATE residual F2 citation nit: this template is NOT the
    same format as the registry's `check()` helper — `check()`'s actual
    format is `` `${where}: unknown ${kind} plugin "${key}"` ``, with no
    `Registered: ...` suffix, confirmed at `src/registry/index.ts:264-269`.
    The `Registered: ...` suffix actually belongs to `resolve()`'s format
    — `src/registry/index.ts:250-252`. The literal template given here is
    a deliberate hybrid of both and is fine and buildable exactly as
    written; only the prior "same format as check()" citation was wrong.
    Does not affect item 27a's test expectations, which match this
    template correctly.) This lives entirely in `bootstrap.ts`, not
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
    to ONE `session.dispatchHostAction(...)` call (L16, item 11a, PVL
    supplement, cycle 3, closes VALIDATE G1 — `server.ts` never imports
    `log.ts`/`applyIntentsWithLog` directly; L2a's batching guarantee still
    closes VALIDATE F1 unchanged, only the call path is corrected), then
    `undo` on the undo command, and re-call
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
| `src/styles/grid.ts` | Fully-Automated | Board build w/ real fixture content (closes VALIDATE G2, L16 — not just cell count), availability, select intents, completion | `npx tsx src/styles/grid.test.ts` | Style contract correctness |
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
| `grid.test.ts` | Fully-Automated | Style contract compliance; real fixture-content assertion (closes VALIDATE G2, L16) |
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
16. Running `npx tsx src/styles/grid.test.ts` passes with real fixture
    content: at least one built cell's `questionId`/`label` matches actual
    fixture question data, not merely a correct cell count. (Closes
    VALIDATE G2 — `grid.buildBoard` now has a real content-resolution
    channel via `resolveRoundContent`/`GridBuildOptions`, L16; this
    directly unblocks Goal 1.)

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
5. **Recurring `StylePlugin` under-context pattern** (root-cause note added
   by the PVL supplement, cycle 3, per VALIDATE G2's finding). G2 (`grid.buildBoard`
   had no channel to real question content, closed via L16/item 11a) is the
   THIRD gap of the same shape found in `StylePlugin`: (i) INNOVATE found no
   `SessionState` slot for style-owned persistent state; (ii) INNOVATE found
   `buildBoard` never receives `state`; (iii) VALIDATE cycle 2 found
   `buildBoard` cannot reach question content without an external
   resolution step. Each was individually patchable at the T1-local call
   site without touching `src/registry/index.ts`, but three instances of
   the same shape is a signal, not a coincidence. Recommend T2 revisit the
   `StylePlugin` signature itself (e.g. passing one richer per-style
   context object covering state + resolved content, rather than
   continuing to patch individual call sites with T1-local option types)
   as a design item for the T2 SPEC/INNOVATE pass. Do NOT attempt this
   signature revisit inside T1 EXECUTE even if it looks tempting mid-build
   — that is out of scope for this plan (see Open Item 2 above, unchanged).

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
and 27/27a (for the `validateConfigPluginsT1` preflight call). Item 11a
(`session.ts`'s `dispatchHostAction`/`resolveRoundContent`, PVL supplement,
cycle 3) depends on item 8/9 (`log.ts`) for `dispatchHostAction` and on the
registry/config types only for `resolveRoundContent`; it must complete
before item 12 (`grid.ts`'s `GridBuildOptions` usage, Sub-Phase 3) and
item 28 (`server.ts`, Sub-Phase 7) — both now consume its exports.

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

Status: CONDITIONAL
Date: 24-08-26
date: 2026-08-24
generated-by: outer-pvl
supersedes: 2026-08-24 (outer-pvl) — cycle-2's contract (`Gate: CONDITIONAL`, G1/G2/G3) is
superseded by this independently re-derived cycle-4 verdict, run against the twice-supplemented
plan (F1-F8 closed cycle 1; G1/G2/G3 closed cycle 3 — see
`gameshow-engine-pvl-iteration-001/002/003_REPORT_24-08-26.md`).

Parallel strategy: sequential (single-session direct-evidence cross-checks)
Rationale: Tool grant for this cycle is Read/Grep/Glob/Bash/Write only — no Agent/Task tool, so
no true multi-agent fan-out was available or attempted. This is disclosed explicitly rather than
claiming a fan-out that didn't happen (same disclosure cycle 2 made). What was delivered instead:
sequential coverage of all 4 Layer-1 dimensions and all 9 Layer-2 sub-phase sections, each
cross-checked against the actual source files (`src/registry/index.ts`, `src/config/types.ts`,
`src/config/resolve.ts`, `src/config/defaults.ts`, `presets/school-assembly.ts`, `package.json`)
by direct `Read`/`grep`, plus a full-text regression sweep of the 1380→1503-line supplement diff
and a traced dependency-chain probe of every consumer of `resolveRoundContent`'s output. Signal
count: 1/7 (single package, no schema/auth/API/billing surface, single plan).

---

### TL;DR

G1 and G3 are genuinely closed (verified against source, not just plan text). G2 is closed for
the narrow thing it fixed (`buildBoard`'s **input** channel to content) but that same trace
surfaced a new, structurally-identical gap one step further down the pipe: **nothing in the plan
ever calls `buildBoard` or gets its output to the stage/host UIs (H1)** — this blocks Goal 1 the
same way G2 did, and by the plan's own precedent (missing wiring, not a missing capability, no
protected-file edit required) it is CONCERN-tier, not FAIL. Two smaller items also verified:
a stale Design Lock (H2) and untested edge cases in `resolveRoundContent` (H3). Net: **CONDITIONAL,
one more supplement recommended** — not a rubber stamp, but also not manufactured busywork; H1 is
real and material by the plan's own stated bar for materiality.

---

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | **PASS** — no new infra-level gaps; F5/F6 remain closed. |
| Test coverage | **CONCERN** — G2's real-content assertion (item 13) verified sound for the case it covers. New gaps: H1 (no test can exist for board delivery because no implementation path is specified yet — same shape as G2 was in cycle 2) and H3 (empty/duplicate `categoryIds` paths in `resolveRoundContent` are unvalidated and untested). |
| Breaking changes | **PASS** — re-verified zero required edits to `src/config/types.ts`/`src/registry/index.ts` across all 9 sub-phases, including H1's likely fix (uses already-exported `resolve('style', …)`, `buildBoard`, `resolveRoundContent` — no new interface needed). |
| Security surface | **PASS** — `redactQuestion` (`src/config/resolve.ts:128-133`) confirmed to strip only `answer`/`acceptedAnswers`/`hostNote`/`correctChoiceIndex`/`numericAnswer`; `prompt` is never stripped by design. H1's board-wiring gap is a *gameplay-integrity* risk (unselected tiles' prompts could leak to the audience pre-selection if a board payload is added naively) — it does not touch any of the five fields the codebase's redaction contract actually protects, so it is not classified as a security-surface FAIL. Flagged as a design point the H1 supplement must settle explicitly (see H1 below), not left as a silent assumption. |

| Layer 2 sections | Status |
|---|---|
| Sub-Phase 0 — validateConfigPlugins test coverage | PASS |
| Sub-Phase 1 — Phase machine | PASS |
| Sub-Phase 2 — Intent application + event log + generic undo | **CONCERN (minor)** — G1 and G3 verified CLOSED (see below). New: H2 — Design Lock L6 (the `resolveAnswer` batch description) still says the batch goes "to a single `applyIntentsWithLog` call," unchanged from before cycle 3's `dispatchHostAction` fix; item 8/11a's own text was updated, L6's wasn't. |
| Sub-Phase 3 — grid style + flat scoring | **CONCERN (material)** — G2 verified CLOSED for `buildBoard`'s *input* side (real fixture content, item 13). New: H1 (see below — this is where `buildBoard` itself lives) and H3 (empty-array / zero-category-bank / duplicate-`categoryIds` edge cases in `resolveRoundContent`, item 11a, are unvalidated and untested). |
| Sub-Phase 4 — local transport + redaction wiring + auth | **CONCERN (material)** — was PASS in cycle 2; now CONCERN because `broadcast.ts` (item 17, lives in this sub-phase) is where H1's board-delivery gap and the "how does `broadcastState` obtain `currentQuestion: Question` from `state.currentQuestionId`" gap both surface. Auth/traversal fixes (F5/F8) remain independently sound and unaffected. |
| Sub-Phase 5 — Stage view | **CONCERN (material)** — was PASS in cycle 2; now CONCERN because item 22 ("render the board … via `grid.stageComponent` key dispatch") has no specified source for the board data it renders — this is H1. |
| Sub-Phase 6 — Host controller | **CONCERN (material)** — was PASS in cycle 2; now CONCERN because item 25 calls `grid.availableQuestions(state, board)`, which requires a `board: BoardModel` the plan never says how the host bundle obtains — H1 again. |
| Sub-Phase 7 — Integration entrypoint | **CONCERN** — G1 verified CLOSED here (item 28's dispatch wording now correctly names `dispatchHostAction`). H1 also touches this sub-phase: `server.ts`'s "re-call `broadcastState` after every mutation" (item 28) inherits the same board-delivery gap. |
| Sub-Phase 8 — Cross-cutting gates | PASS — F6 remains closed. |

**Totals: 0 FAIL / 7 CONCERN rows (1 minor, 6 material-or-tied-to-H1) / 6 PASS rows** (13 total rows).

**→ Net Gate: CONDITIONAL**

Zero FAILs. H1 is the one finding that matters for the PASS/CONDITIONAL line — it is material
(blocks Goal 1, the same bar G2 was judged against) but, by the plan's own established
FAIL-vs-CONCERN calibration (F1 was FAIL because it needed a genuine mechanism redesign; G2 was
CONCERN because the fix stays inside already-exported types with no protected-file edit), H1 is
CONCERN, not FAIL. Recommendation below.

---

### Cycle-3 Supplement Verification — G1, G2, G3

| Finding | Cycle-2 severity | This cycle's verdict | Evidence |
|---|---|---|---|
| **G1** — sole-caller contradiction (item 8 vs item 28) | CONCERN | **CLOSED, verified** | `session.ts` now exports `dispatchHostAction` (item 11a); item 8's closing paragraph, item 28's dispatch wording, and the Public Contracts bullet were all updated in lockstep to say "`dispatchHostAction` — NEVER `applyIntentsWithLog` directly." No remaining contradiction between those three locations. (H2, below, is a *separate* stale reference the same fix should have — but didn't — reach.) |
| **G2** — `grid.buildBoard` has no content channel | CONCERN, material | **CLOSED for the input side; a new gap (H1) found one step further down the same pipe** | `GridBuildOptions = GridStyle & { categories: Category[] }` typechecks cleanly against `StylePlugin<O>` — confirmed `O` is a free, unconstrained generic (`export interface StylePlugin<O = Record<string, unknown>>`, `src/registry/index.ts:94`; `buildBoard(round: Round, options: O)`, line 97). `resolveRoundContent`'s bankId/unknown-bank/unknown-category error paths (item 11a steps 1-4) are complete and correctly ordered. Item 13's test (real cell content, not just count) is sound for the fixture it exercises. **But**: nothing in the plan calls `resolveRoundContent`/`buildBoard` at runtime, or gets `BoardModel` to the stage/host bundles — see H1. |
| **G3** — `INTENT_TOUCHED_KEYS` phase ambiguity | CONCERN, minor | **CLOSED, verified** | `consumeQuestion` row now lists only `consumed`; `selectQuestion` row now lists only `currentQuestionId` (item 6 table, re-read against the live plan text). Item 7's instruction is now literally writable — no invented `phase` value required. |

Residual non-blocking notes from cycle 2 (F2 citation, F7 null-guard) were independently
re-verified this cycle and remain correctly closed — no regression found in either.

---

### H1 — [CONCERN, material] `buildBoard`'s output is never wired to the running system

**This is the most significant finding this cycle, and it directly continues where G2 left off.**

G2 fixed how `buildBoard` receives content. It did not establish who *calls* `buildBoard`, or how
its `BoardModel` result reaches the stage view or host controller. Traced every consumer:

- `SessionState` (`src/registry/index.ts:29-42`, confirmed by direct read) has **no `board` field**
  — a `BoardModel` is never part of session state.
- `broadcast.ts` (item 17) builds three payload shapes from `state` but never mentions `board` or
  `BoardModel` anywhere in its description.
- `server.ts` (item 28) generates the host token, starts the transport, dispatches host commands,
  and re-calls `broadcastState` after mutations — it never calls `grid.buildBoard` or
  `resolve('style', …).buildBoard(…)`.
- `stage/main.ts` (item 22) says "render the board (grid cells, via `grid.stageComponent` key
  dispatch — a local `switch` on `stageComponent`)" — this only describes dispatching on the
  `stageComponent` string to pick a renderer; it does not say where the cell **data** comes from.
- `host/main.ts` (item 25) explicitly calls `grid.availableQuestions(state, board)` — this
  signature *requires* a `board: BoardModel` argument, and nothing in the plan says how the
  browser-side host bundle obtains one.

Grepped the entire 1503-line plan for every occurrence of `BoardModel`/`board` (case-sensitive and
case-insensitive) outside the phase-machine's `Phase` enum value `'board'` — confirmed there is no
sixth location. This is a genuine gap, not a missed cross-reference.

**Why CONCERN and not FAIL** (same bar the plan itself uses for G2): the fix does not require
touching `src/config/types.ts` or `src/registry/index.ts`. All the pieces already exist:
`resolve('style', round.style.kind)` returns the registered `StylePlugin` (unmodified registry
function), `resolveRoundContent(config, round)` (item 11a) resolves content,
`GridBuildOptions`/`buildBoard` (item 12) build the model. What's missing is the PLAN decision of
*where* this assembly happens and *what shape* carries `BoardModel` into the broadcast payload —
exactly the class of "missing design decision, not missing capability" that made G2 CONCERN.

**A second, coupled question the supplement must also settle (not a separate blocking finding,
but must be decided in the same pass):** `BoardModel.cells[].label` is specified (item 12, and
locked in by item 13's cycle-3 test) to equal real question content (`options.categories[col]
.questions[row]`'s prompt-shaped data). `redactQuestion` (`src/config/resolve.ts:128-133`,
confirmed by direct read) never strips `prompt` — it only strips `answer`/`acceptedAnswers`/
`hostNote`/`correctChoiceIndex`/`numericAnswer`. If a `BoardModel` for the *whole* board (including
cells the host has not yet selected) were broadcast to the `'stage'`/`'player'` channels as-is,
every unselected tile's prompt would be visible to the audience before selection — not a violation
of the five fields the codebase's own redaction contract protects, but a real Jeopardy-format
gameplay-integrity gap. This is not classified as its own CONCERN row (it is a design question
inside H1's fix, not a second independent defect), but the supplement closing H1 must state
explicitly whether/how per-cell content is withheld pre-selection, the same way L9 states exactly
one call site for `handle.broadcast(...)`.

**Recommended fix shape (for the supplement to choose, not prescribing the only option):**
1. Add an explicit step (most naturally inside `broadcast.ts`/`broadcastState`, since L9 already
   makes it the one call site that assembles outgoing payloads) that: resolves the current round's
   `StylePlugin` via `resolve('style', round.style.kind)`, assembles `GridBuildOptions` via
   `resolveRoundContent`, calls `buildBoard(round, options)`, and includes the resulting
   `BoardModel` in the `'stage'`/`'host'`/`'player'` payload shapes.
2. Decide and state explicitly whether unselected cells carry their real `label` or a redacted
   placeholder for the `'stage'`/`'player'` channels (host always gets the full board, per L9's
   existing host/stage/player split).
3. Update item 22 (stage) and item 25 (host) to say explicitly that the board comes from the SSE
   payload (not a client-side `buildBoard` call) — this also keeps `grid.ts`'s `buildBoard` on the
   server side only, consistent with L9's "one call site" discipline.

---

### H2 — [CONCERN, minor] Design Lock L6 was not updated by the G1 fix

Item 8's closing paragraph and item 28 were both updated by cycle 3 to say `resolveAnswer`'s
3-intent batch goes through `dispatchHostAction`. **Design Lock L6** (in the Design Locks table,
above the checklist) was not: it still reads *"passed together as ONE `Intent[]` array to a
single `applyIntentsWithLog` call (L2a)"* — the pre-G1 wording. Item 11a states unambiguously that
`dispatchHostAction` is "the ONLY place in the whole codebase that calls `applyIntentsWithLog`,"
which covers intra-file callers inside `session.ts` (like `resolveAnswer`) as much as `server.ts`.
L6, read in isolation — and Design Locks are explicitly meant to be read "before the checklist,
referenced by short name" — still points an EXECUTE agent at the wrong function name.

**Not a functional bug**: `dispatchHostAction`'s entire body is `return applyIntentsWithLog(...)`,
so behavior is identical either way; only the "sole caller" invariant's textual consistency is at
stake, and item 11a's more detailed, more recently written text is far more likely to be followed
than the older L6 line. Cheap one-line fix: update L6 to say `dispatchHostAction` (or "…via
`dispatchHostAction`, L16") in place of the bare `applyIntentsWithLog` reference.

---

### H3 — [CONCERN, minor] `resolveRoundContent`'s empty/duplicate paths are unvalidated and untested

Traced item 11a's four-step algorithm against three edge cases the task asked for directly:

| Case | Traced behavior | Verdict |
|---|---|---|
| `round.categoryIds` present but `[]` (empty, distinct from absent) | Step 4's "for each id in `categoryIds`" loop runs zero times → returns `[]` silently, no error. | Unvalidated — a round with an accidentally-emptied `categoryIds` array produces a silent zero-column board instead of a descriptive error, unlike the "unknown bank"/"unknown category" cases which do throw. |
| Bank found via `bankId`, but `bank.categories` is `[]` | Step 3 (categoryIds absent) returns `bank.categories` unfiltered = `[]`. Same silent-empty outcome. | Same class of gap. |
| `categoryIds` contains a duplicate id (e.g. `['cat1','cat1']`) | Step 4 finds `cat1` twice and pushes the same `Category` object into the result twice — no error. Two board columns would then share every `questionId` in that category; `state.consumed` (tracked by `questionId`, not by cell) means selecting one duplicate column's tile marks the *other* duplicate column's identical tile consumed too, with no explanation to the host. | Unvalidated; would look like a bug to a host, not just an authoring mistake caught early. |

None of these three paths are covered by item 13's test (which uses a clean, correctly-shaped
2-category fixture) or by any other checklist item. This is the same "silently-degenerate input,
no test" shape as F7's original null-guard gap (already accepted there as non-blocking) — I am
applying the same severity bar here: **non-blocking**, but real and worth a cheap fix (a
one-line early throw for the empty-array/empty-bank case is the obvious close; duplicates are
lower-priority since the plan doesn't explicitly forbid re-using a category across two round
"slots" and doing so is at worst confusing, never crashing).

Related but not itself blocking: `GridStyle.columns` (the config schema field, `src/config/types.ts
:318-331`) is never reconciled against `options.categories.length` — item 12 says "col indexes
`options.categories`" (i.e. column count is driven by the resolved category count), so `columns`
as an explicit author-facing field is effectively decorative/unenforced for T1's grid style if it
doesn't match the actual category count. Item 13's test asserts cell count via `columns * rows`
using a fixture where both happen to agree, so this never surfaces in test. Non-blocking, worth a
one-line note in Open Items if the supplement is already touching this area.

---

### F1 spot-recheck (not a full re-probe — cycle 2 already did the deep trace)

Re-confirmed `applyIntentsWithLog`'s union-snapshot-before-apply ordering (item 8) is unchanged
from cycle 2's fully-probed version, and `dispatchHostAction` (item 11a) is a pure pass-through
with no logic of its own that could reintroduce per-intent snapshotting. F1 remains closed.

---

### Convergence Assessment (honest, per this cycle's explicit brief)

| Cycle | New findings | Shape |
|---|---|---|
| 0 | F1 (FAIL) + 5 CONCERN + 1 note | Fundamental undo-granularity defect + surface-level gaps |
| 2 | G1, G2, G3 | G2 in particular was one level deeper than cycle 0's coverage reached — a genuine new layer |
| 4 (this cycle) | H1, H2, H3 | H1 is **not** a new independent layer — it is the direct continuation of G2, one hop further down the same call chain G2 already opened up. H2/H3 are small, cheap, non-blocking. |

This is not "each pass finds an unrelated new problem" (which would be a real signal the plan
isn't converging) — H1 is the natural next link in a chain G2 started tracing (content resolution
→ board construction → board delivery), and every item on that chain has now been walked to its
actual endpoint (the browser). There is no known further link past H1: once H1's supplement wires
`BoardModel` into the broadcast payload and states the pre-selection redaction decision, every
consumer named in the plan (stage, host, `session.ts`, `broadcast.ts`) has a concrete data source.
**Recommendation: one more supplement cycle (cycle 5), scoped narrowly to H1 (plus bundling the
cheap H2/H3 fixes), is the right call — not accepting H1 as a known-gap.** H1 concretely blocks
Goal 1 exactly as G2 did, and "the board never reaches the screen a host is looking at" is not a
residual a live show can tolerate. This is the last hop in the chain, not the start of a new one —
diminishing-returns caution is warranted for *future* cycles past this one, not for closing this
specific, traced, terminal gap now.

---

### Invariants & Zero-Contract-Changes Re-Confirmation

| # | Invariant | Still holds as designed? |
|---|---|---|
| 1 | Stage stays playable with zero players connected | Structurally still true (no input plugin exists); H1's fix does not change this — it only adds a data channel the stage already needs regardless. |
| 2 | Content snapshotted at launch (`structuredClone`) | Unaffected by this cycle's findings — `session.ts`/`createSession` design (L10) unchanged. |
| 3 | Scoring plugins are pure | Unaffected — `flat.ts` design (L5/L13) unchanged. |
| 4 | Answers redacted at the transport boundary | `redactQuestion`'s five protected fields (confirmed via direct read, `src/config/resolve.ts:128-133`) are unaffected by H1. The **adjacent** pre-selection-prompt question raised inside H1 is explicitly a *new* design point the H1 supplement must resolve — see H1 above — it does not currently violate this invariant because no board payload exists yet to violate it with. |

**Zero-contract-changes**: re-confirmed no files exist yet under `src/engine/`, `src/styles/`,
`src/scoring/`, `src/transport/`, `src/stage/`, `src/host/` (`ls` against the live repo, this
cycle) — the plan remains pre-EXECUTE, matching its own Resume/Handoff section. `package.json`
still only has the pre-T1 `test`/`typecheck` scripts (`tsx src/config/resolve.test.ts`,
`tsc --noEmit`) — `vite`/`build`/`show` are not yet added, consistent with items 29/31 being
unexecuted checklist items, not evidence of drift.

---

### Test Gate Commands — Runnability Confirmation

`tsx@^4.23.12` is already a `package.json` dependency (confirmed by direct read) — every
`npx tsx <file>.test.ts` gate command below is syntactically valid and will run once EXECUTE
creates the named file; none currently exist (expected — pre-EXECUTE). `npm run typecheck`
(`tsc --noEmit`) is already wired. `npm run build`/`npm test` (post-T1 forms) and
`node scripts/check-stage-host-isolation.mjs` require items 29/31/33 to run first — this is
correctly sequenced by Sub-Phase 8 running last (Dependencies and Sequencing section, unchanged).
No command references a file path that doesn't match its own Touchpoints entry.

---

### Test Coverage Plan (C-4 5-column form — updated this cycle)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| SPEC-AC3 | Preflight catches unregistered plugin keys | Fully-Automated | `npx tsx src/registry/validateConfigPlugins.test.ts` | A |
| SPEC-AC3-gap (F2) | Preflight catches unregistered built-in style kinds | Fully-Automated | `npx tsx src/registry/bootstrap.test.ts` | A |
| L1 | Full phase transition truth table | Fully-Automated | `npx tsx src/engine/phase.test.ts` | A |
| Immutability | Per-intent touched-key update + untouched-key identity | Fully-Automated | `npx tsx src/engine/intents.test.ts` | A — G3 closed, table now unambiguous |
| SPEC-AC6 (single-intent) | `awardPoints` → `undo()` round trip | Fully-Automated | `npx tsx src/engine/log.test.ts` | A |
| SPEC-AC6 (host-action, F1) | One host action fully reversed by ONE `undo()` | Fully-Automated | `npx tsx src/engine/log.test.ts` cases (d)/(e) | A |
| SPEC-AC11 | `structuredClone` isolation | Fully-Automated | `npx tsx src/engine/session.test.ts` | A |
| SPEC-AC5 | Full host-manual round, zero players | Fully-Automated | `npx tsx src/engine/host-manual-round.test.ts` | A — but see H1-gap row below; this test still needs the same board-delivery wiring to be meaningful end-to-end |
| Style contract (G2) | Board build w/ real fixture content, availability, select intents, completion | Fully-Automated | `npx tsx src/styles/grid.test.ts` | A — closed cycle 3 |
| **H1-gap (NEW)** | **`BoardModel` reaches the stage/host bundle via the broadcast payload; pre-selection content-exposure decision stated** | Fully-Automated / Hybrid | none exists — **new implementation path + new test required by H1's supplement** | **B** |
| **H3-gap (NEW, minor)** | **`resolveRoundContent` rejects (or explicitly documents accepting) empty/duplicate `categoryIds`** | Fully-Automated | none exists — optional hardening | **D** |
| SPEC-AC8 | Scoring purity + formula + streak/comeback warn-once | Fully-Automated | `npx tsx src/scoring/flat.test.ts` | A |
| Host-auth | Token 401/200, SSE delivery, teardown | Fully-Automated | `npx tsx src/transport/local.test.ts` | A |
| Host-auth-gap (F5) | Static file route rejects path-traversal | Fully-Automated | `npx tsx src/transport/local.test.ts` case (e) | A |
| SPEC-AC4 / AC7-data | `broadcastState` never leaks answer fields | Fully-Automated | inside `session.test.ts` / `broadcast.test.ts` | A — for the currently-specified single-question redaction path; H1's board-payload decision adds a second surface this same test class must cover once H1 lands |
| G1-gap | `applyIntentsWithLog` has exactly one disciplined caller | Fully-Automated | closed structurally via `dispatchHostAction` (item 11a) — recommended grep script analogous to `check-stage-host-isolation.mjs` remains optional hardening, not required | D |
| SPEC-AC7-bundle | No `src/stage/**` import reaches `src/host/**` | Fully-Automated | `node scripts/check-stage-host-isolation.mjs` | A |
| SPEC-AC12 | Whole-project typecheck + suite green | Fully-Automated | `npm run typecheck && npm test` | A |
| F6-gap | `vite.config.ts` type-checked | Fully-Automated | `tsconfig.json` `include` addition | A |
| SPEC-AC9 (visual) | Projector legibility | Agent-Probe | manual per `ARCHITECTURE.md` §9 | A (manual gate) |
| Host-auth smoke | Token required, visible failure | Agent-Probe | manual browser check | A |
| SPEC-AC5 (manual) | Full pre-show dry run | Agent-Probe | manual per `ARCHITECTURE.md` §9 | A |
| SPEC-AC10 | Buzzer fairness | Known-Gap | — | correctly out of T1 scope |
| SPEC-AC9 (auto) | Visual regression | Known-Gap | — | correctly deferred |

gap-resolution legend: A — proven now / closed this cycle. B — must be fixed in this plan via
the next supplement before the row reads A. D — backlog test-building stub (named residual;
recommended but not blocking).

C-4 reconciliation: `strategy` above carries only Fully-Automated/Hybrid/Agent-Probe. Known-Gap
rows (SPEC-AC10, SPEC-AC9 auto) are named residuals, not proving strategies.

**What This Coverage Does NOT Prove:**
- Until H1's B-marked row is closed, the coverage table does NOT prove a host can actually see or
  select a board on stage or the host controller — `host-manual-round.test.ts` and `grid.test.ts`
  prove the *engine-level* mechanics (state transitions, board construction from given options)
  but neither proves the board ever reaches a browser, because no code path connects them yet.
  This is exactly why the net gate is CONDITIONAL, not PASS — same shape as cycle 2's G2 call.
- `intents.test.ts` and `log.test.ts` continue to prove exactly what they proved in cycle 2 —
  G3's fix doesn't change their proof surface, only removes an ambiguity in how to write them.
- H3's edge cases (empty/duplicate `categoryIds`) are, by design, NOT proven by anything in this
  table unless the optional D-tier hardening is picked up.
- Everything already true of cycle 0/2's own "does not prove" lists (import-isolation is
  source-level only; SSE proves message shape, not multi-client/reconnect load behavior) still
  holds unchanged.

---

### Open gaps

- H1 (CONCERN, material) — `buildBoard`'s output (`BoardModel`) has no specified path to the
  stage or host bundle; no code path in the plan ever calls it. Must be closed via one more plan
  supplement before EXECUTE — this blocks Goal 1, same bar as G2 was judged against.
- H2 (CONCERN, minor) — Design Lock L6 still names `applyIntentsWithLog` instead of
  `dispatchHostAction`; cheap one-line fix, recommend bundling into the H1 supplement pass.
- H3 (CONCERN, minor) — `resolveRoundContent`'s empty-array/empty-bank/duplicate-id paths are
  unvalidated and untested; recommend bundling a one-line empty-array/empty-bank guard into the
  same supplement pass (duplicates are lower priority, optional).
- G1/G2/G3 (from cycle 2) — all verified CLOSED this cycle; no longer open.
- F1-F8 (from cycle 0) — all verified CLOSED across cycles 1-2; no longer open.
- F7 residual, F2 citation nit, Sub-Phase 5/6 parallelism wording (cycle 2's non-blocking
  residuals) — independently re-verified this cycle, still correctly closed/non-blocking.

Accepted by: n/a — no user is present in this autonomous VALIDATE cycle to accept H1 as a
documented residual. Given H1 concretely blocks Goal 1 (a host cannot see a board without it) and
is judged CONCERN, not FAIL, using the plan's own established bar, this contract does not
unilaterally accept it — a human reviewer or the autonomous orchestrator may instead choose to
accept H1 as a documented, descoped known-gap (e.g. "T1's initial EXECUTE pass ships with a
placeholder/static board on stage, real board wiring is a fast-follow"), but that acceptance must
be recorded here by name before EXECUTE proceeds on that basis.

Gate: CONDITIONAL

---

### SUPPLEMENT REQUEST

```
SUPPLEMENT REQUEST:
- Gap 1: Section "Sub-Phase 4 — local transport + redaction wiring + host-auth token" (item 17) and Section "Sub-Phase 5 — Stage view" (item 22) and Section "Sub-Phase 6 — Host controller" (item 25) and Section "Sub-Phase 7 — Integration entrypoint" (item 28) | Concern: nothing in the plan specifies who calls grid.buildBoard(round, options) at runtime or how the resulting BoardModel reaches the stage/host bundles — SessionState has no board field, broadcastState's payload shapes (item 17) never mention board/BoardModel, server.ts (item 28) never calls buildBoard, stage/main.ts (item 22) only dispatches on stageComponent without naming a data source, and host/main.ts (item 25) calls grid.availableQuestions(state, board) with no specified source for `board` | Severity: CONCERN (material — blocks Goal 1, same bar as cycle-2's G2) | Suggested addition: have broadcastState (or a sibling helper in broadcast.ts, keeping L9's one-call-site discipline) resolve the round's StylePlugin via resolve('style', round.style.kind), assemble GridBuildOptions via resolveRoundContent, call buildBoard, and include the resulting BoardModel in the stage/host/player payload shapes; explicitly state whether unselected cells' real label content is withheld from the stage/player payload pre-selection (redactQuestion does not strip `prompt`, so this needs an explicit decision, not a silent assumption); update items 22/25 to say the board comes from the SSE payload, not a client-side buildBoard call.
- Gap 2: Design Locks table, entry L6 | Concern: L6 still describes resolveAnswer's 3-intent batch going "to a single applyIntentsWithLog call," unchanged from before the cycle-3 G1 fix; item 8/11a/28/Public Contracts were all updated to say dispatchHostAction, L6 was missed | Severity: CONCERN (minor, cosmetic — no functional impact since dispatchHostAction is a pure pass-through) | Suggested addition: update L6's text to say "…to a single dispatchHostAction call (L2a/L16)" in place of the bare applyIntentsWithLog reference.
- Gap 3: Section "Sub-Phase 2 — Intent application + event log + generic undo" (item 11a, resolveRoundContent) | Concern: a present-but-empty categoryIds array, or a bank whose categories array is itself empty, both silently return an empty Category[] with no error — unlike the already-guarded missing-bankId/unknown-bank/unknown-category-id cases | Severity: CONCERN (minor, non-blocking) | Suggested addition: add a fifth guard — if the resolved category list would be empty, throw a descriptive error naming the round and bank, analogous to the existing three error cases; optional — document duplicate categoryIds as an accepted, non-crashing authoring quirk if not worth guarding.
```

## Autonomous Goal Block

```
SESSION GOAL: Ship T1 (playable core, host-manual) of the TriviaMaker game-show engine — phase machine, generic undo, grid+flat, local transport with host-auth, stage+host UI, runnable end-to-end with zero player devices.
Charter + umbrella plan: N/A — single plan, no phase-program umbrella exists for this work.
Autonomy: standard RIPER-5 gates apply. VALIDATE cycle 2 gate reads CONDITIONAL (0 FAIL, 3 CONCERN: G1/G2/G3 — see Validate Contract section above). This PLAN has now been PVL-supplemented a second time (cycle 3, 24-08-26) to close G1/G2/G3. EXECUTE is not authorized until VALIDATE re-runs from V1 against this cycle-3-supplemented plan and returns Gate: PASS or an explicit user-accepted CONDITIONAL — this supplement's own edits are not self-certifying.
Hard stop conditions / safety constraints:
- Do not route to or begin EXECUTE MODE until VALIDATE re-runs against this cycle-3 supplement and confirms Gate: PASS or an accepted CONDITIONAL.
- Do not modify src/config/types.ts or src/registry/index.ts (settled T0 contracts) when closing G1/G2/G3 — the fixes stay T1-local (GridBuildOptions in grid.ts; resolveRoundContent + dispatchHostAction in session.ts, item 11a/L16; the INTENT_TOUCHED_KEYS table edit in intents.ts).
- The grid content-resolution fix (G2, L16) must give `buildBoard` a real, non-placeholder channel to question content, proven by a real-content test assertion (item 13, AC#16) — not just a correct cell count — before this plan can PASS. G2 blocks Goal 1.
- The generic-undo fix (F1, still closed and re-verified this cycle) must continue to guarantee one host action = one undo() call, covering both the 2-intent onSelect() batch and the 3-intent resolveAnswer() batch.
Next phase: VALIDATE (vc-validate-agent), re-run from V1 against this cycle-3-supplemented plan — PVL cycle 3.
Validate contract: inline in plan, this section (process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md).
Execute start: BLOCKED — not applicable until Gate reads PASS or an accepted CONDITIONAL. Once unblocked: `npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`; high-risk pack: no (no auth/billing/schema/migration/public-API/deploy surface — host token is a local-LAN session secret, not user auth).
```
