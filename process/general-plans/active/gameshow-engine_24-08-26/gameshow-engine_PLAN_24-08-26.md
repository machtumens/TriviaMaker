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
supersedes: 2026-08-24 (outer-pvl) — cycle-0 baseline contract (`Gate: BLOCKED`, F1 FAIL) is
superseded by this independently re-derived cycle-2 verdict, run against the 24-08-26
PVL-supplemented plan (F1/F2/F3/F5/F6/F7 fixes applied, see
`gameshow-engine-pvl-iteration-001_REPORT_24-08-26.md`).

Parallel strategy: sequential (single-session direct-evidence cross-checks)
Rationale: The task instructions for this cycle stated the Agent/Task tool would be available
for a true parallel fan-out. It was **not** present in this agent's actual tool grant (Read,
Bash, Write only — no Agent/Task tool). This is disclosed explicitly rather than silently
claiming a fan-out that didn't happen. What *was* delivered instead: full sequential coverage
of all 4 Layer-1 dimensions and all 9 Layer-2 sub-phase sections in one session, each backed
by direct `Read`/`grep` evidence against the real source files (not inference), plus a
dedicated regression hunt across the 693→1380-line supplement diff and a hard probe of the
F1/L2a undo algorithm (same rigor bar the task asked for). Signal count: 1/7 (single package,
no schema/auth/API/billing surface, single plan). A textbook parallel fan-out remains the
correct strategy once Agent/Task tool access is actually available to this validate role —
flagging this again for the next cycle, as cycle-0's own contract did.

---

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | **PASS** — F5 (path-traversal containment) and F6 (`vite.config.ts` outside tsconfig `include`) both verified closed. No new infra-level gaps found. |
| Test coverage | **CONCERN** — F1's dedicated undo-batch tests (log.test.ts cases (d)/(e)) verified sound and close the original FAIL. Two new coverage gaps found this cycle: G2 (grid board content resolution has no test because it has no *implementation path* yet — see below) and G3 (intents.test.ts's per-intent-type assertion is ambiguous for two intent types). |
| Breaking changes | **PASS** — independently re-verified zero required edits to `src/config/types.ts` or `src/registry/index.ts` across all 9 sub-phases, including confirming `StylePlugin<O>`'s `O` type param is a free generic (the exact mechanism G2's recommended fix depends on). |
| Security surface | **PASS** — F5 (path traversal) closed with a sound fix, traced through both the raw and encoded-traversal test cases; F8 (non-constant-time token compare) remains an accepted, documented low-risk residual, reasoning re-confirmed sound against the stated local-LAN-only threat model. |

| Layer 2 sections | Status |
|---|---|
| Sub-Phase 0 — validateConfigPlugins test coverage | PASS |
| Sub-Phase 1 — Phase machine | PASS |
| Sub-Phase 2 — Intent application + event log + generic undo | **CONCERN** — F1 (FAIL) verified CLOSED (see below). Two new CONCERNs found in this same sub-phase: G1 (item 8 vs item 28 contradict each other on who calls `applyIntentsWithLog`) and G3 (`INTENT_TOUCHED_KEYS` claims `consumeQuestion`/`selectQuestion` touch `phase`, but neither intent carries a phase value and `applyIntent`'s own spec gives no instruction for it). |
| Sub-Phase 3 — grid style + flat scoring | **CONCERN** — F3 verified CLOSED. New finding: G2 — `grid.buildBoard(round, options)` has no specified way to receive the actual question-bank content it needs to build real cells; the plan's own sentence describing this is self-contradictory. This is the most material finding of this cycle. |
| Sub-Phase 4 — local transport + auth | PASS — F5 verified CLOSED (traversal fix sound); F7 verified effectively closed (very small residual noted, non-blocking); F8 remains an accepted note. |
| Sub-Phase 5 — Stage view | PASS — re-checked, no new issues. |
| Sub-Phase 6 — Host controller | PASS — re-checked, no new issues. |
| Sub-Phase 7 — Integration entrypoint | **CONCERN** — F3's default-preset fix verified CLOSED here (items 27b/28). G1's sole-caller contradiction also lives here (item 28's dispatch wording). |
| Sub-Phase 8 — Cross-cutting gates | PASS — F6 verified CLOSED (tsconfig `include` addition). |

**Totals: 0 FAIL / 4 CONCERN rows / 9 PASS rows** (13 total rows; F1's original FAIL row is now
counted among the closed items below, not in this cycle's totals).

**→ Net Gate: CONDITIONAL**

Zero unresolved FAILs. Three new, real, file:line-verified CONCERNs (G1, G2, G3) were found by
this cycle's deliberately broader coverage — none of them require touching
`src/config/types.ts` or `src/registry/index.ts` to fix (the bar that made F1 a FAIL), so none
of them individually justify BLOCKED. But G2 in particular is material enough (it blocks Goal 1
— a real grid board cannot be built as specified) that this is not a clean PASS either. Per
`orchestration.md`'s "first-pass CONDITIONAL is not terminal" rule, this routes to one more
plan supplement (PVL cycle 3), not to EXECUTE.

---

### Cycle-1 Supplement Verification — F1 through F8

| Finding | Cycle-0 severity | This cycle's verdict | Evidence |
|---|---|---|---|
| **F1** — undo granularity | FAIL | **CLOSED, verified sound** | See full trace below — the batch-union-snapshot algorithm was stress-tested against the exact scenario requested (two intents touching the same key within one batch) and holds. |
| F2 — built-in style kinds unchecked | CONCERN | **CLOSED** | `validateConfigPluginsT1()` (item 27) uses the exported `list('style')` function — mechanically buildable with zero `registry/index.ts` edits, confirmed by direct read of `list()` (`src/registry/index.ts:257-259`). One minor citation nit noted below (non-blocking). |
| F3 — bundled demo preset breaks under T1 | CONCERN | **CLOSED** | Confirmed `presets/school-assembly.ts` round 2 (`streak.enabled:true`, line 104) and `final` round (`kind:'trivia'`, line 119) are exactly as cycle-0 described. Fix (new `presets/demo-t1.ts` as the zero-arg default + `flat.score()` warn-once) is complete and mechanically sound. |
| F5 — static file path traversal | CONCERN | **CLOSED** | `path.resolve` + prefix-containment check (item 18) is a correct, standard pattern; traced both a raw `../` request and a `%2e%2e`-encoded variant through `decodeURIComponent` → `path.resolve` → containment check and confirmed both are caught. |
| F6 — `vite.config.ts` outside tsconfig `include` | CONCERN (minor) | **CLOSED** | Confirmed current `tsconfig.json:13` is `["src/**/*","presets/**/*"]` (missing `vite.config.ts`); item 30 adds it. |
| F7 — `startClock` resume-anchor formula unspecified | CONCERN (minor) | **Effectively closed** | Formula specified (item 6) is correct for the common case. One very small residual noted below (non-blocking — `questionSec: number \| null` per the schema, formula doesn't guard the `null` case, but no T1 preset or default sets it to `null`). |
| F8 — non-constant-time token compare | Note, accepted | **Unchanged, still accepted** | Reasoning re-confirmed: 122-bit `crypto.randomUUID()` secret + local-LAN-only threat model. No new information changes this. |

---

### F1 deep-probe — the specific hazard requested this cycle

**Verdict: CLOSED. The L2a batch-union-snapshot algorithm is correct, including for the exact
edge case requested — two intents in one batch touching the *same* key.**

Traced the algorithm (item 8) against three questions:

**1. Does the union-before-apply snapshot handle two same-batch intents touching the same
key correctly?** Yes, and the reasoning generalizes further than the specific hypothetical
asked for. Because the snapshot is taken **once**, from the state as it was *before any intent
in the batch runs*, and undo simply restores the whole snapshotted value for each touched key,
it does not matter how many intents in the batch wrote to that key, in what order, or what
intermediate values existed — undo restores exactly the pre-batch value. Concretely: `teams`
is touched only by `awardPoints` in T1's two real batches, but a hypothetical batch with *two*
`awardPoints` intents against the same team (e.g. `+50` then `+30`) would still undo correctly
in one call, because `event.undo.teams` is the whole original array captured before either
delta applied — restoring it discards both deltas at once, not just the last one. This is a
structural property of "checkpoint-then-replay-then-restore-checkpoint," not something that
needs per-intent bookkeeping.

There is also a **real instance** of two same-batch intents touching the same key in T1's own
code, not just a hypothetical: `consumeQuestion` and `setPhase` both claim to touch `phase`
(per `INTENT_TOUCHED_KEYS`, item 6) and both appear in `resolveAnswer`'s 3-intent batch. Traced
through: union = `{teams, consumed, phase}`; snapshot taken once from pre-batch state; `phase`
ends up set to whatever `setPhase` (which always runs *last* in every batch this plan defines)
assigns; undo restores all three keys to their pre-batch values in one call. Confirmed correct
— and this is exactly what test case (e) (item 10) asserts.

**2. Is `session.ts` genuinely the only caller, and is that enforceable or merely asserted?**
**Not enforceable as written, and the plan's own text is internally inconsistent about it.**
See **G1** below — this is a real, separate finding, not folded into F1's re-close because the
underlying undo mechanism itself is unaffected by *which file* calls it, only by whether the
caller batches correctly. F1 stays closed; G1 is the sole-caller-discipline gap.

**3. Does `undo()` still behave correctly given L3's append-only reversal-marker design?**
Traced `undo()`'s scan logic (item 9) through two consecutive `undo()` calls: call 1 reverses
event N, appends reversal event N+1 (tagged `payload.reversalOf = N`). Call 2's scan correctly
skips N+1 (it has `payload.reversalOf` set, so the "not itself a reversal" filter excludes it)
and correctly skips N (it now has a *later* event with `payload.reversalOf === N`, so the
"not already reversed" filter excludes it too) — landing on event N-1, the next real host
action back. This is the expected "keep pressing undo to go further back" behavior and is
internally consistent. No bug found here.

**Conclusion: F1 is closed. The fix is architecturally sound.** The two new findings below
(G1, G2) are real but are not re-openings of F1 — they are new gaps this cycle's broader
coverage surfaced.

---

### G1 — [CONCERN] Plan text contradicts itself on who calls `applyIntentsWithLog`

**Item 8 (Sub-Phase 2)** states, twice, that `session.ts` is the sole caller: *"`session.ts` is
the ONLY caller of `applyIntentsWithLog`... never a per-intent loop of individual log calls."*
This claim is what the plan leans on to guarantee F1 stays fixed as the codebase grows.

**Item 28 (Sub-Phase 7, `server.ts`)** describes something different: *"wires `onCommand` to
dispatch each host command's resulting `Intent[]` (from `onSelect`, `resolveAnswer`, or a
single-intent pause/resume call) as ONE array to ONE `applyIntentsWithLog` call."* Read
literally, this has `server.ts` itself calling `applyIntentsWithLog` — not routing through a
`session.ts` wrapper. The Public Contracts section (line ~220) reinforces this reading:
*"`applyIntentsWithLog`... used by `server.ts` and (indirectly, via HTTP) the host
controller"* — explicitly naming `server.ts` as a direct user of the function.

**Why this matters, precisely:** it doesn't currently break undo correctness — whichever file
calls `applyIntentsWithLog`, as long as it always passes the *whole* host-action `Intent[]` in
one call (which item 28's own wording says it does), F1's fix still holds. The problem is that
the plan states a "sole caller = `session.ts`" invariant as the thing that PREVENTS a future
regression, and then a different part of the same plan (also written/touched by this same
supplement pass) directly contradicts it. If an EXECUTE agent follows item 28 literally
(`server.ts` importing `log.ts` directly), the "session.ts is the only caller" sentence in item
8 becomes false the moment T1 ships — which then makes it an unreliable guardrail for whoever
adds the *next* call site later (T2+), since the actual discipline that matters ("always batch,
never loop") isn't stated as the enforced invariant anywhere; the (now-false) "one file only"
framing is.

**Recommended fix (pick one, either closes it):**
- **(a)** Have `session.ts` export a thin wrapper (e.g. `session.dispatchHostAction(state, intents, seq, at)`) that internally calls `applyIntentsWithLog`, and have `server.ts`'s `onCommand` call *that* instead of the log module directly — this makes the "session.ts is the sole caller" sentence literally true again.
- **(b)** Keep `server.ts` as a legitimate second call site, but rewrite item 8's invariant to state the thing that actually matters: *"every call site passes the whole host action's `Intent[]` to ONE `applyIntentsWithLog` call — never a per-intent loop — regardless of which file the call site lives in."* Drop the "sole caller = session.ts" framing.

Either is a small, mechanical plan-text fix. No source-file behavior needs to differ between
the two options except where the wrapper function lives.

---

### G2 — [CONCERN, material] `grid.buildBoard` has no specified path to real question content

**This is the most significant new finding this cycle.**

Item 12 (Sub-Phase 3) specifies `grid.ts`'s `buildBoard(round, options)`: *"one `BoardModel`
cell per (row, col) where row indexes `options.pointLadder` and col indexes the round's
questions-per-category (derive from `round.categoryIds` + **the resolved question bank passed
in via `options`** — options is **the resolved `GridStyle` config object itself**, per the
registry's generic `O` type param)."*

That single sentence is self-contradictory, verified directly against both interfaces:

- `StylePlugin<O>.buildBoard(round: Round, options: O): BoardModel` (`src/registry/index.ts:97`) — receives only `round` and `options`. No `config`, no `content.banks`, nothing else.
- `GridStyle` (`src/config/types.ts:318-331`) — `kind, columns, rows, pointLadder, selection, showCategoryHeaders, consumedStyle, dramaticCategoryReveal`. **No field holds a question bank, category list, or question array.**
- `Round` (`src/config/types.ts:633-662`) — has `bankId?: string` and `categoryIds?: string[]`, which are **references** (IDs) into `GameShowConfig.content.banks: QuestionBank[]`, not the actual `Category`/`Question` objects.

So the claim "the resolved question bank [is] passed in via `options`" is false given `options`
is *also* claimed to be exactly `GridStyle` — `GridStyle` has nowhere to put it. Searched the
entire plan for any other function that resolves `round.bankId`/`round.categoryIds` against
`config.content.banks` before calling `buildBoard` — there is none. No `session.ts` or
`server.ts` step is described as hydrating a round's content before the style plugin needs it.

**Concretely, an EXECUTE agent following item 12 literally has no path to build a `BoardModel`
with real `questionId`s, `label`s, or points** — the two inputs it's given (`round`, a mostly
ID-shaped object, and `options`, a `GridStyle` with no content fields) don't contain the
content. This blocks Goal 1 ("a host can... run a complete `grid`-style round end-to-end") at
its most basic level: there is no board to render without this.

**Why this is CONCERN and not FAIL:** unlike F1, this does **not** require touching
`src/registry/index.ts` or `src/config/types.ts` to fix. `StylePlugin<O>`'s `O` is a free,
unconstrained generic type parameter (confirmed: nothing in the interface or in `register`/
`resolve`'s signatures pins `O` to any specific shape) — T1 is free to define its *own* richer
options shape for the `'grid'` registration (e.g. `GridStyle` plus the round's resolved
`Category[]`/`Question[]`), assembled by whichever caller has access to the full
`GameShowConfig` (almost certainly `session.ts`, since it already holds `state.config` per
L10's `structuredClone`). This is buildable within the plan's own stated constraints — it's a
missing design decision, not a missing capability.

**Recommended fix for the supplement:** add an explicit step (Sub-Phase 2 or 3) that:
1. Defines a T1-local `GridBuildOptions` type (or similar), living in `src/styles/grid.ts` or
   a small shared helper, shaped as `GridStyle & { categories: Category[] }` (or equivalent) —
   no edit to `types.ts` required, since `Category`/`Question` are already exported types there.
2. Specifies exactly where the resolution from `round.bankId`/`round.categoryIds` +
   `state.config.content.banks` into that shape happens (most naturally: a small pure function
   in `session.ts`, called once when a round starts / board is built, e.g.
   `resolveRoundContent(config, round)`).
3. Updates item 12's text to remove the self-contradictory "options is the resolved GridStyle
   config object itself" clause and replace it with the actual, richer shape.
4. Updates item 13's test (currently only asserting cell *count*) to also assert at least one
   cell's `questionId`/`label` matches real fixture content, so this integration point is
   actually exercised by an automated gate, not just cell-count arithmetic.

---

### G3 — [CONCERN, minor] `INTENT_TOUCHED_KEYS` claims two intents touch `phase` with no way to derive it

`consumeQuestion` (`{type:'consumeQuestion', questionId}`) and `selectQuestion`
(`{type:'selectQuestion', questionId}`) are both listed in item 6's `INTENT_TOUCHED_KEYS` table
as touching `phase`, in addition to their own obvious key (`consumed` / `currentQuestionId`
respectively). Neither `Intent` variant carries any phase-related field
(`src/registry/index.ts:76-88`, confirmed), and item 6's own prose description of `applyIntent`
gives no instruction for what value `phase` should take for either of these two intent types.

**Empirically this is currently harmless** — see the F1 deep-probe above: in both of T1's
actual batches (`grid.onSelect` and `resolveAnswer`), a `setPhase` intent is always present and
always runs *last*, so whatever (if anything) `consumeQuestion`/`selectQuestion`'s `applyIntent`
branch does to `phase` gets overwritten by the trailing `setPhase` before the batch finishes —
and this is exactly what test cases (d)/(e) exercise and pass on. So this is not an undo-
correctness bug today.

**Where it does bite:** item 7 (`intents.test.ts`) instructs, per intent type, to *"assert the
touched key(s) changed."* Taken literally for `consumeQuestion`/`selectQuestion` in isolation
(single-intent, not as part of a batch — which is what `intents.test.ts` tests, as opposed to
`log.test.ts`'s batch-level tests), this requires `applyIntent` to change `phase` for these two
intent types even when called alone, but item 6 gives no rule for what to change it *to*. An
EXECUTE agent implementing this test literally would have to invent unspecified behavior to
make it pass.

**Recommended fix:** either (a) remove `phase` from `consumeQuestion`'s and `selectQuestion`'s
rows in the `INTENT_TOUCHED_KEYS` table (since `setPhase` is the sole owner of phase
transitions per the batches as designed), and note that the union-snapshot is deliberately
over-inclusive-safe but these two entries were not meant to imply a value-write; or (b) if a
future style plugin could plausibly emit `consumeQuestion`/`selectQuestion` *without* a
trailing `setPhase`, specify the phase-derivation rule explicitly now rather than leaving it
implicit. (a) is the lower-effort, more honest fix given no such call site exists today.

---

### Residual notes (non-blocking, no action required to reach PASS)

- **F2 citation nit.** Item 27 states the new built-in-style-kind check pushes an error "in the
  SAME format as the registry's own `check()` helper" and gives the template
  `"${where}: unknown style plugin \"${kind}\". Registered: ${known}"`. Direct read of `check()`
  (`src/registry/index.ts:264-269`) shows its actual format is
  `` `${where}: unknown ${kind} plugin "${key}"` `` — **no** `"Registered: ..."` suffix. That
  suffix is actually `resolve()`'s format (`src/registry/index.ts:250-252`), not `check()`'s.
  The literal template given in item 27 is fine and buildable as written (and arguably more
  useful than `check()`'s real bare format) — only the citation ("same format as `check()`") is
  wrong. Cosmetic; does not affect item 27a's test expectations, which match the *given*
  template correctly.
- **F7 residual.** `TimerRules.questionSec` is typed `number | null` (`null` = untimed,
  `src/config/types.ts:452`). Item 6's resume formula
  (`clockStartedAt = Date.now() - (questionSec * 1000 - intent.ms)`) doesn't guard the `null`
  case (JS would coerce `null * 1000` to `0`, producing a nonsense future-dated
  `clockStartedAt`). Confirmed no T1 default or preset sets `questionSec: null`
  (`src/config/defaults.ts:52` default is `30`) and a pause/resume control on an untimed
  question is a plausible UI gap regardless of this formula. Not blocking; worth a one-line
  guard (`if (questionSec == null) return state` or similar) if the supplement is touching
  this area anyway, but not required to reach PASS.
- **Sub-Phase 5/6 parallelism wording.** The plan's TL;DR says *"Sub-Phases 3 and 4 are
  parallel-safe; everything else is a straight dependency chain,"* but the Dependencies and
  Sequencing section's own notation (`{5, 6, both depend on 3 and 4}`) uses the same
  curly-brace grouping it uses for the explicitly-parallel `{3, 4}` pair. Given stage/host have
  no cross-imports (the isolation invariant guarantees this), 5 and 6 are very likely also
  parallel-safe — the TL;DR undersells this. Purely cosmetic; the per-sub-phase checklist
  headers themselves are unambiguous ("depends on 3, 4" for both, independently), so this
  doesn't block or mislead EXECUTE.

---

### Test Coverage Plan (C-4 5-column form — updated this cycle)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| SPEC-AC3 | Preflight catches unregistered plugin keys | Fully-Automated | `npx tsx src/registry/validateConfigPlugins.test.ts` | A |
| SPEC-AC3-gap (F2) | Preflight catches unregistered **built-in** style kinds | Fully-Automated | `npx tsx src/registry/bootstrap.test.ts` | **A — closed this cycle** |
| L1 | Full phase transition truth table | Fully-Automated | `npx tsx src/engine/phase.test.ts` | A |
| Immutability | Per-intent touched-key update + untouched-key identity | Fully-Automated | `npx tsx src/engine/intents.test.ts` | A (see G3 — passes, but table ambiguity noted) |
| SPEC-AC6 (single-intent) | `awardPoints` → `undo()` round trip | Fully-Automated | `npx tsx src/engine/log.test.ts` | A |
| **SPEC-AC6 (host-action, F1)** | Single host action (2-3 intents) fully reversed by ONE `undo()` | Fully-Automated | `npx tsx src/engine/log.test.ts` cases (d)/(e) | **A — closed this cycle, verified correct including same-key-touched-twice case** |
| SPEC-AC11 | `structuredClone` isolation | Fully-Automated | `npx tsx src/engine/session.test.ts` | A |
| SPEC-AC5 | Full host-manual round, zero players | Fully-Automated | `npx tsx src/engine/host-manual-round.test.ts` | A |
| Style contract | Board build, availability, select intents, completion | Fully-Automated | `npx tsx src/styles/grid.test.ts` | A (cell count) |
| **G2-gap (NEW)** | **`grid.buildBoard` produces cells with real content, not just correct count** | Fully-Automated | none exists — **new test + new implementation path required by G2's supplement** | **B** |
| SPEC-AC8 | Scoring purity + formula + streak/comeback warn-once | Fully-Automated | `npx tsx src/scoring/flat.test.ts` | A |
| Host-auth | Token 401/200, SSE delivery, teardown | Fully-Automated | `npx tsx src/transport/local.test.ts` | A |
| Host-auth-gap (F5) | Static file route rejects path-traversal | Fully-Automated | `npx tsx src/transport/local.test.ts` case (e) | **A — closed this cycle** |
| SPEC-AC4 / AC7-data | `broadcastState` never leaks answer fields | Fully-Automated | inside `session.test.ts` / `broadcast.test.ts` | A |
| L9-gap (single-caller enforcement) | `handle.broadcast(...)` called ONLY from `broadcast.ts` | Fully-Automated | none exists — recommended grep script (execute-agent instruction, not blocking) | D |
| **G1-gap (NEW, analogous to L9-gap)** | **`applyIntentsWithLog` has exactly one disciplined caller path** | Fully-Automated | none exists — recommended grep script analogous to `check-stage-host-isolation.mjs`, OR resolve via the session.ts-wrapper fix (see G1) | **D** |
| SPEC-AC7-bundle | No `src/stage/**` import reaches `src/host/**` | Fully-Automated | `node scripts/check-stage-host-isolation.mjs` | A |
| SPEC-AC12 | Whole-project typecheck + suite green | Fully-Automated | `npm run typecheck && npm test` | A |
| F6-gap | `vite.config.ts` type-checked | Fully-Automated | `tsconfig.json` `include` addition | **A — closed this cycle** |
| SPEC-AC9 (visual) | Projector legibility | Agent-Probe | manual per `ARCHITECTURE.md` §9 | A (manual gate) |
| Host-auth smoke | Token required, visible failure | Agent-Probe | manual browser check | A |
| SPEC-AC5 (manual) | Full pre-show dry run | Agent-Probe | manual per `ARCHITECTURE.md` §9 | A |
| SPEC-AC10 | Buzzer fairness | Known-Gap | — | correctly out of T1 scope |
| SPEC-AC9 (auto) | Visual regression | Known-Gap | — | correctly deferred |

gap-resolution legend: A — proven now / closed this cycle. B — must be fixed in this plan via
the next supplement before the row reads A. D — backlog test-building stub (named residual;
recommended but not blocking).

**Legacy line form:**
- G2 (grid board content): `[known-gap-until-supplement: no implementation path specified for grid.buildBoard's content resolution — blocks Goal 1]`
- G1 (sole-caller discipline): `[agent-probe/backlog: recommend a grep script analogous to check-stage-host-isolation.mjs, or resolve via a session.ts wrapper]`
- All F1-F8 rows: `[Fully-automated: npx tsx src/engine/log.test.ts / src/registry/bootstrap.test.ts / src/transport/local.test.ts — all closed this cycle]`

**What this coverage does NOT prove:**
- The updated table above proves each row's named behavior only once the B-marked rows (G2)
  are added and pass. Until then, it does NOT prove a real, playable grid board can be built
  from a real preset — the plan's own worked example (`presets/demo-t1.ts`) cannot be verified
  end-to-end as specified, which is exactly why the net gate is CONDITIONAL, not PASS.
- `intents.test.ts` (once written per item 7) will prove per-intent-type key updates only for
  whatever behavior the supplement settles on for `consumeQuestion`/`selectQuestion`'s `phase`
  handling (G3) — it does not currently have a defined target to test against.
- Everything already true of cycle-0's own "does not prove" list (import-isolation is
  source-level only, not built-bundle; SSE proves message shape, not multi-client/reconnect
  load behavior) still holds unchanged.

---

### Open gaps

- G2 (CONCERN, material) — `grid.buildBoard`'s content-resolution path is unspecified and the
  plan's own description of it is self-contradictory. Must be closed via plan supplement
  before EXECUTE — this blocks Goal 1.
- G1 (CONCERN) — plan text contradicts itself on whether `session.ts` or `server.ts` is the
  sole caller of `applyIntentsWithLog`. Recommend closing via supplement for architectural
  clarity; does not block undo correctness on its own.
- G3 (CONCERN, minor) — `INTENT_TOUCHED_KEYS` lists `phase` for `consumeQuestion`/
  `selectQuestion` with no corresponding `applyIntent` instruction. Recommend closing via
  supplement (removing the ambiguous table entries) for `intents.test.ts` (item 7) to be
  writable as literally specified; does not affect undo correctness today.
- F7 residual (non-blocking) — `startClock`'s resume formula doesn't guard `questionSec: null`;
  no current preset hits this, optional cleanup only.
- F2 citation nit (non-blocking) — item 27's "same format as `check()`" claim is factually
  wrong (it actually matches `resolve()`'s format); the literal template given is fine as-is.

Accepted by: n/a — no user is present in this autonomous VALIDATE cycle to accept these
residuals. Per `orchestration.md`'s "first-pass CONDITIONAL is not terminal" rule, G1/G2/G3
route to one more plan supplement (PVL cycle 3) before EXECUTE is authorized. If a human
reviewer instead chooses to accept G1/G2/G3 as documented, non-blocking residuals (e.g. by
descoping G2 to "grid board content is stubbed with placeholder text for T1's initial
EXECUTE pass, real content wiring is a fast-follow"), that acceptance must be recorded here
by name before EXECUTE proceeds — this contract does not make that call unilaterally, because
G2 concretely blocks Goal 1 as currently specified.

Gate: CONDITIONAL

---

### SUPPLEMENT REQUEST

```
SUPPLEMENT REQUEST:
- Gap 1: Section "Sub-Phase 3 — grid style + flat scoring" (item 12) | Concern: grid.buildBoard(round, options) has no specified channel to receive real question-bank content — options is claimed to be both "the resolved GridStyle config object" (no bank field) and "the resolved question bank" in the same sentence; no other function in the plan resolves round.bankId/categoryIds against config.content.banks before buildBoard needs it | Severity: CONCERN (material — blocks Goal 1) | Suggested addition: define a richer T1-local options shape for the 'grid' registration (e.g. GridStyle & { categories: Category[] }), specify exactly where it is assembled (recommend a small pure resolveRoundContent(config, round) helper called from session.ts before buildBoard), and update item 13's test to assert real cell content, not just cell count.
- Gap 2: Section "Sub-Phase 2 — Intent application + event log + generic undo" (item 8) vs Section "Sub-Phase 7 — Integration entrypoint" (item 28) | Concern: item 8 states session.ts is the ONLY caller of applyIntentsWithLog; item 28 and the Public Contracts section both describe server.ts calling it directly, which is a different, unreconciled claim | Severity: CONCERN | Suggested addition: either add a session.ts wrapper (e.g. dispatchHostAction) that server.ts calls instead of log.ts directly, making the "sole caller" claim literally true, or rewrite item 8's invariant to state the actual load-bearing rule ("every call site batches the whole host action into one applyIntentsWithLog call, never a per-intent loop") regardless of file.
- Gap 3: Section "Sub-Phase 2 — Intent application + event log + generic undo" (item 6) | Concern: INTENT_TOUCHED_KEYS lists consumeQuestion and selectQuestion as touching `phase`, but neither Intent variant carries a phase value and applyIntent's own description gives no rule for deriving one — item 7's test-writing instruction ("assert the touched key(s) changed") is then unwritable as specified for these two intent types | Severity: CONCERN (minor) | Suggested addition: remove `phase` from consumeQuestion's and selectQuestion's INTENT_TOUCHED_KEYS rows (setPhase is the sole owner of phase transitions in every currently-defined batch) and add a one-line note explaining why the union-snapshot design is deliberately over-inclusive-safe without those two rows.
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
