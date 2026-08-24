---
name: context:all-context
description: "root context router — architecture, stack, patterns, and routing to every context group"
keywords: architecture, stack, routing, overview, conventions, structure, engine, config
related: []
date: 24-08-26
---
# TriviaMaker Engine - All Context

Last updated: 2026-08-24 (T1 engine core landed — see Repository Structure / Outstanding Work below)

This file is the root context entrypoint for the repo.

Use it for two things:

1. quick routing to the right context pack or root file
2. broad architecture and repository understanding

Start here before loading deeper context files.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick router for that domain. This root file (`all-context.md`) is the top-level router. Context groups each have their own `all-{group}.md` entrypoint.

**The pattern:**

```
process/context/
  all-context.md                      <-- THIS FILE: root router
  planning/
    all-planning.md                   <-- group router for planning
    example-simple-prd.md             <-- deep doc within the group
    example-complex-prd.md            <-- deep doc within the group
  tests/
    all-tests.md                      <-- group router for tests
    debugging-and-pitfalls.md         <-- deep doc within the group
    e2e-tests.md                      <-- deep doc within the group
  database/
    all-database.md                   <-- group router for database
    schema-guide.md                   <-- deep doc within the group
    migration-procedures.md           <-- deep doc within the group
```

**How agents use it:**

1. Agent reads `all-context.md` first (this file)
2. Finds the relevant context group from the routing tables below
3. Reads that group's `all-{group}.md` entrypoint
4. Only then loads the specific deep doc needed

This layered routing keeps context windows small. Never load the whole `process/context/` tree.

**What each `all-{group}.md` must contain:**

- Scope (what the group covers and does NOT cover)
- Read-when rules (when an agent should load this group)
- Quick procedures or decision rules
- Source paths (list of deeper docs in the group)
- Update triggers (when to refresh this group's content)
- Routing to deeper docs within the group

---

## Quick Start

For most substantial tasks:

1. read this file first
2. choose the smallest relevant root file or context group from the tables below
3. only then load deeper files

---

## Current Root Entry Points

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/planning/all-planning.md` | plan artifacts, task folders, and phase programs — the planning group entrypoint/router |
| `process/context/tests/all-tests.md` | test runners, commands, and verification order — the tests group entrypoint/router |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `planning/` | `process/context/planning/all-planning.md` | plan artifacts, task folders, and phase programs — the planning group entrypoint/router |
| `tests/` | `process/context/tests/all-tests.md` | test runners, commands, and verification order — the tests group entrypoint/router |
<!-- /GENERATED:routing -->

## Task Routing Table

| If the task involves... | Load first | Then load |
|---|---|---|
| architecture or stack questions | `all-context.md` | `ARCHITECTURE.md` (repo root) |
| the configuration schema or any customisation surface | `all-context.md` | `CUSTOMIZATION.md`, then `src/config/types.ts` |
| adding a game style, scoring engine, input, or transport | `all-context.md` | `src/registry/index.ts` (plugin interfaces) |
| config layering, merge, or theme→CSS behaviour | `all-context.md` | `src/config/resolve.ts` + `resolve.test.ts` |
| testing or verification | `all-context.md`, `tests/all-tests.md` | the specific test file |
| creating a new plan | `all-context.md`, `planning/all-planning.md` | active task folder under `process/general-plans/active/` |
| live-event behaviour, failure modes, buzzer fairness | `all-context.md` | `ARCHITECTURE.md` §6 and §9 |
| the phase machine, intents, undo, or session/broadcast logic | `all-context.md` | `src/engine/` (read `phase.ts`, `intents.ts`, `log.ts`, `session.ts`, `broadcast.ts` in that order) |
| the transport layer or host-token auth | `all-context.md` | `src/transport/local.ts` + `local.test.ts` |
| adding/changing a style or scoring plugin | `all-context.md` | `src/styles/grid.ts` / `src/scoring/flat.ts` as the T1 worked examples, then the T2 SPEC input backlog note before touching the `StylePlugin` contract |
| context maintenance | `all-context.md` | run `vc-audit-context` after edits |

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- a topic has 3+ durable docs
- a single doc exceeds roughly 800 lines with separable subtopics
- multiple agents repeatedly need only one slice of a large context file
- the topic maps to a stable operational domain (tests, infra, database, auth, UI, workflows, etc.)

Do not create a group when:

- the content is a temporary report
- the content is a plan or execution artifact
- the topic is feature-specific and belongs in `process/features/...`

Move or split one group at a time. Use `all-{group}.md` entrypoints. Run the `audit-context` skill after every context organization change.

## Naming Convention

There are no `README.md` files inside `process/context/`.

Canonical entrypoints use `all-*.md`:

- root: `process/context/all-context.md`
- group: `process/context/{group}/all-{group}.md`

Each `all-{group}.md` file should act as the attachable quick router for that domain:

- tell the agent what the group covers
- give quick procedures and decision rules
- route to smaller deeper files

## Context Update Protocol

When durable project knowledge changes:

1. update the smallest relevant context file
2. update this file if routing, ownership, naming, or groups changed
3. update the owning `all-{group}.md` entrypoint when a group exists
4. run `audit-context`

---


## Repository Structure

```
/
  ARCHITECTURE.md            teardown of the game-show-software category + build plan
  CUSTOMIZATION.md           how the customisation system works (cascade, registries, invariants)
  package.json               ESM ("type": "module")
  tsconfig.json              strict + noUncheckedIndexedAccess
  vite.config.ts             build config — stage + host as separate entry bundles
  src/
    config/
      types.ts               COMPLETE customisation surface (~850 lines) — the contract (untouched by T1)
      defaults.ts            base layer of the cascade; safe-for-live-event defaults (untouched by T1)
      resolve.ts             cascade merge, theme→CSS vars, host-only redaction (untouched by T1)
      resolve.test.ts        self-check for the cascade (node:assert, no framework)
    registry/
      index.ts               12 plugin interfaces + registry + preflight validation (untouched by T1)
      bootstrap.ts            registers the T1 plugin set (grid/flat/local/classic layout) + validateConfigPluginsT1 preflight
      bootstrap.test.ts
      validateConfigPlugins.test.ts
    engine/
      phase.ts / phase.test.ts        phase machine (lobby -> board -> reading -> armed -> locked -> adjudicate -> reveal -> ...)
      intents.ts / intents.test.ts    Intent union + applyIntent -- plugins return intents, never mutate state
      log.ts / log.test.ts            event log + generic host-action undo (batch-union snapshot, L2a)
      session.ts / session.test.ts    dispatchHostAction, resolveRoundContent, session launch/snapshot
      broadcast.ts / broadcast.test.ts  broadcastState -- the ONLY call site that redacts + serialises state per channel
      host-manual-round.test.ts       integration test: a full host-manual round via intents/log/session together
    styles/
      grid.ts / grid.test.ts          T1's one style plugin (buildBoard, availableQuestions)
    scoring/
      flat.ts / flat.test.ts          T1's one scoring plugin (pure ScoreDelta[] output)
    transport/
      local.ts / local.test.ts        zero-dependency local HTTP+SSE transport, host-token auth, path-traversal containment
    stage/
      index.html, main.ts             projector view -- imports ONLY redacted state (enforced by check-stage-host-isolation.mjs)
    host/
      index.html, main.ts             host controller -- select/arm/pause/resume/award/undo/next
    server.ts                        glue entrypoint; boots local transport + demo-t1 preset (npm run show)
  scripts/
    run-tests.mjs             discovers and runs every src/**/*.test.ts in one process (no test framework)
    check-stage-host-isolation.mjs   static import-boundary check: stage/ must never import host-only modules
  presets/
    school-assembly.ts       worked 3-round example (grid -> double points -> wager final) -- untouched by T1
    demo-t1.ts               T1 demo preset (two rounds; only round 1 is currently playable -- see Outstanding Work)
  process/                   agent harness (this tree)
```

**T1 (playable core, host-manual) landed 2026-08-24.** 27 new files, 3 modified
(`package.json`, `tsconfig.json`, `package-lock.json`). `src/config/**`, `src/registry/index.ts`,
and `presets/school-assembly.ts` are byte-identical to pre-T1 (`git diff` empty) -- the whole
engine was built as new sibling files, per the plan's protected-file constraint.

Still not built: T2+ (remaining 5 styles, remaining scoring engines, lifelines, special
tiles, multi-round play), any input plugin (buzzer/network), persistence. See
`process/general-plans/active/gameshow-engine_24-08-26/` for the full plan, execute
report, and closeout packet -- the task folder is **kept active**, not archived, because
three manual verification gates are still open (see Outstanding Work below).

## Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 7.x, `strict` + `noUncheckedIndexedAccess` | schema-first; types are the contract |
| Runtime | Node (ESM) | `"type": "module"` -- do not reintroduce CJS |
| Test | `tsx` + `node:assert/strict`, aggregated by `scripts/run-tests.mjs` | deliberately no framework; see `tests/all-tests.md` for the 8-file trigger reassessment |
| Build | Vite `^8.2.2` (devDependency only), vanilla TS -- no UI framework | two entry bundles: `stage` and `host`; `npm run build` |
| Transport | zero-dependency local HTTP+SSE server (`src/transport/local.ts`), host-token auth | pluggable for hosted later via `runtime.transport.driver` registry key; nothing hosted yet |
| Deployment | **local-first** -- runs off a laptop on the venue LAN | internet is never a runtime dependency |

Commands:
- `npm test` -- runs `tsx scripts/run-tests.mjs` (all 12 test files)
- `npm run typecheck` -- `tsc --noEmit`
- `npm run build` -- `vite build` (stage + host bundles)
- `npm run show` -- `tsx src/server.ts`, boots the demo on `:8080` (`PORT` env to override)
- Full gate sequence (what CI/EVL runs): `npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`
Commands: `npm test`, `npm run typecheck`.

## Key Patterns and Conventions

**The governing principle.** Anything a host might want to CHANGE is *data* (`src/config/types.ts`).
Anything that changes how the machine STEPS is a *plugin* (`src/registry/index.ts`).
If you want to write `if (config.someSpecialCase)` in the engine, you have found a plugin
seam, not a config flag.

**The config cascade.** `defaults → preset(extends) → event → round → question`, deep-merged,
later wins. Authors write `DeepPartial`; the engine always reads a fully-resolved object.
No `??` chains in engine code. Arrays REPLACE, never concatenate.

**Intents, not mutations.** Plugins take read-only `SessionState` and return `Intent[]`.
The engine applies and logs them. Undo, reconnect, and score-dispute auditing all derive
from this. `ScoringPlugin.score()` MUST be pure — impurity breaks undo silently.

**Four invariants (do not break):**
1. The stage view stays fully playable with zero players connected (`degradeToOfflineOnNetworkLoss`).
2. Content is snapshotted into the session at launch (`snapshotContentAtLaunch`) — editor
   edits must never mutate a live board.
3. Scoring plugins are pure.
4. Answers are redacted at the **transport** boundary (`redactQuestion`), never in the view layer.

**Style conventions.** Many small files over few large ones. Named constants over magic
numbers. Explicit error handling. Immutable updates.

**T1 engine patterns (new 2026-08-24 — read before touching `src/engine/`, `src/styles/`, or `src/transport/`):**

- **Phase transition table as data, not a switch statement.** `src/engine/phase.ts` encodes
  the phase machine as a lookup table (`from-phase -> event -> to-phase`), not an
  `if`/`switch` chain. Adding a phase or transition is a table edit, not a control-flow edit
  — consistent with the "special case = missing plugin seam" governing principle above.
- **Intents batched per host action, not per Intent (undo granularity — Design Lock L2a).**
  A single host click (e.g. "mark correct") can emit several `Intent`s (score + consumption +
  phase change). Undo must reverse the whole batch in one host action, not one `Intent` at a
  time. `src/engine/log.ts` snapshots a batch-union diff BEFORE applying, and one undo replays
  that whole batch. This was a real gap: the plan was originally written around per-Intent undo
  and VALIDATE only caught the mismatch by tracing a host click end to end (see Learnings below).
- **`broadcastState` is the sole redaction call site (Design Lock L9/L17).** No other file may
  call the transport's `.broadcast(...)`, and no other file may call a style plugin's
  `buildBoard(...)`. This is enforced by convention + `grep` checks in the execute report, not
  by a lint rule yet — do not add a second call site without updating both invariants.
- **Serialise for the wire explicitly; do not broadcast `SessionState` as-is.**
  `SessionState` holds `ReadonlySet<string>` fields (`consumed`, `lockedOutTeamIds`) that
  `JSON.stringify` silently collapses to `{}`. `broadcast.ts`'s `BroadcastPayload` is a
  hand-written JSON-safe view that converts Sets to arrays and derives `cells[].consumed`
  server-side (styles' `buildBoard` never receives `state`, so it cannot compute this itself
  — a known T2 gap, see Outstanding Work).
- **Redaction must be tested by VALUE, not by key name.** `SessionState.config` (the full
  resolved show config) is reachable from state and contains `content.banks` — every question
  AND every answer. A key-name redaction scan looks clean because the config also has a
  legitimate `copy.answer` field; the only correct test scans the serialised payload for
  sentinel VALUES. See Learnings below — this was found by building, not by design review.

## Environment and Configuration

No environment variables and no secrets at present — the engine is local-first and has no
external service dependencies. If a hosted transport is added later, its credentials belong
in env vars and must never be committed.

Show configuration is **not** environment configuration: it lives in typed preset files
under `presets/`, versioned in git.

## Scan Metadata

- Scanned: 2026-08-24 (T0 baseline) / updated 2026-08-24 (T1 engine core landed)
- Method: vc-setup Flow A (new project) for T0; UPDATE PROCESS reconciliation against the
  T1 execute report + PLAN + SPEC for this update (no direct re-read of every source file —
  see the execute report's own verified `git diff` evidence)
- Source files: 6 TypeScript files at T0 (~1400 lines); 27 new files added by T1 (see
  Repository Structure above)
- Verified: full gate sequence (`npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`)
  green from a clean `dist/` at T1 EXECUTE + independent EVL confirmation run; 12 test files
  pass. 3 manual gates remain unconfirmed by a human — see Outstanding Work.

## Source References

Authoritative documents this context summarises. Read the source, not this summary, before
making operational changes.

| Topic | Source |
|---|---|
| Category teardown, buzzer fairness, live-event failure modes | `ARCHITECTURE.md` |
| Customisation system: cascade, registries, invariants | `CUSTOMIZATION.md` |
| The customisation surface itself (authoritative) | `src/config/types.ts` |
| Plugin contracts (authoritative) | `src/registry/index.ts` |
| RIPER-5 workflow protocol | `process/development-protocols/all-development-protocols.md` |
| Plan storage and lifecycle | `process/context/planning/all-planning.md` |
| Competitor behaviour (verified 2026-08-24) | `ARCHITECTURE.md` §Appendix |

## Open Questions and Outstanding Work

**Open decisions**

- **Harness vendoring.** The agent harness lives at `~/.claude/` (user-level), not in this
  repo. Context validators expect a vendored `.claude/` + `CLAUDE.md` + `AGENTS.md` and
  report them missing. Decide whether to vendor the harness so the project is portable and
  the protocol is committed alongside the code.
- **Test framework.** 12 test files now exist (past `tests/all-tests.md`'s documented
  8-file migration trigger). Deliberately NOT migrated to Vitest yet — see `tests/all-tests.md`
  for the honest reasoning and the reassessment condition.
- **Git branch mismatch.** The repo's actual branch is `master` (from `git init`'s default),
  while root `CLAUDE.md` names `main` as this project's working branch. Not fixed here — flag
  only, per the orchestrator note in the closeout packet
  (`process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_CLOSEOUT_24-08-26.md`).
  Do not rename the branch without explicit user instruction.

**T2 SPEC input — 4 contract gaps to evaluate together, not patch individually** (see the
backlog note `process/general-plans/backlog/gameshow-engine-t2-styleplugin-contract.md` for
full detail; do not start T2 PLAN work without reading it first):

- No `SessionState` slot for style-owned persistent state (blocks a `tictac`-style plugin).
- `StylePlugin.buildBoard` does not receive `state` (this is why T1 has to derive
  `cells[].consumed` in `broadcastState` instead of in the style plugin itself).
- No `Intent` variant touches `roundIndex` — **T1 can only play round 1 of a multi-round
  show**; this is a contract gap, not an implementation shortcut.
- `GameEventName` is a closed union, forcing 5 imprecise intent-to-event-name fallbacks
  (`setTurn`, `stopClock`, `playSound`, `effect`, `custom`).

**Outstanding work**

- **T0 (config schema, cascade, registry, redaction) — DONE.** `src/config/**`,
  `src/registry/index.ts`, unchanged since T0.
- **T1 (playable core, host-manual) — DONE, code-complete and automated-gate-green, but NOT
  yet VERIFIED.** Phase machine, intents/log/undo, `grid` style, `flat` scoring, `local`
  transport, stage view, host controller, `demo-t1` preset, `server.ts` glue entrypoint all
  exist and pass the full gate sequence. Three manual gates remain open (see below) — the
  plan's own Phase Completion Rules require human confirmation for these, not agent judgment.
  Full detail: `process/general-plans/active/gameshow-engine_24-08-26/` (task folder kept
  active, not archived, until the manual gates close).
- **Manual gates still open (need a human, not more code):**
  1. Projector legibility from the back of a room (item 23) — needs a real external display.
  2. Host token visibly required, confirmed via a browser DevTools network tab (item 26) —
     raw-HTTP 401 is confirmed programmatically; the browser confirmation step is not done.
  3. A full pre-show dry run on the real venue network (SPEC AC#11) — not done.
- **T2+ (remaining styles/scoring/lifelines/special tiles/multi-round play)** — outstanding,
  blocked in part on the 4 contract gaps above being resolved as one coherent T2 SPEC/PLAN
  pass, not four individual patches.
- **T3 (hardware buzzer input), T4 (network/player participation), T5 (polish/persistence)**
  — outstanding, unchanged from the SPEC's tier sequencing.
- **No CI.** `npm run typecheck && npm test` is still a local-only gate; recommended as a
  near-term follow-up (see backlog).

**Known risks**

- The config schema is broad; T1 exercised only the `grid`/`flat`/`local` slice of it. Expect
  the next style/scoring plugin to reveal further gaps in `src/config/types.ts` or in the
  `StylePlugin` contract specifically (see T2 SPEC input above).
- No live-event rehearsal has occurred. Projector legibility is unverified (manual gate 1
  above).
- `SessionState.config` is reachable from broadcast state and contains the full answer key
  (`content.banks`). This is currently handled correctly (`broadcast.ts` strips it, tested by
  value), but it is a sharp edge for any future call site that touches `state.config` directly
  — see the T1 engine pattern note above.
- Host token comparison (`local.ts`) is not constant-time — accepted for T1's local-LAN-only
  threat model (plan Open Item 4); must be revisited if this transport is ever exposed beyond
  the venue LAN.
