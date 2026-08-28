---
name: context:all-context
description: "root context router — architecture, stack, patterns, and routing to every context group"
keywords: architecture, stack, routing, overview, conventions, structure, engine, config
related: []
date: 24-08-26
---
# TriviaMaker Engine - All Context

Last updated: 2026-08-28 (T2.2 multi-round shows landed, CLEAN automated EVL, human click-through still open — see Repository Structure / Outstanding Work below)

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
      index.ts               12 plugin interfaces + registry + preflight validation -- T2.1 added
                              `SessionState.styleState`, `Intent.setStyleState`/`advanceRound`,
                              `StylePlugin.buildBoard`'s 3rd `state` param (exactly 3 edits, `src/config/types.ts` untouched)
      bootstrap.ts            registers the T1 plugin set (grid/flat/local/classic layout) + validateConfigPluginsT1 preflight
      bootstrap.test.ts
      validateConfigPlugins.test.ts
    engine/
      phase.ts / phase.test.ts        phase machine (lobby -> board -> reading -> armed -> locked -> adjudicate -> reveal -> ...)
      intents.ts / intents.test.ts    Intent union + applyIntent -- plugins return intents, never mutate state.
                                       T2.1: +setStyleState/advanceRound cases
      log.ts / log.test.ts            event log + generic host-action undo (batch-union snapshot, L2a).
                                       T2.1: INTENT_EVENT_NAMES +2 rows (1 fallback, 1 exact match) -- see D5 correction below
      session.ts / session.test.ts    dispatchHostAction, resolveRoundContent, session launch/snapshot.
                                       T2.1: createSession initialises styleState: {}
                                       T2.2: +advanceToNextRound(state, input?): Intent[] -- the round-boundary
                                       decision function (elimination/tie-handling, carryScores reset,
                                       minTeams round-skip cascade, intermission/roundIntro/board targeting),
                                       same trust level as resolveAnswer. +AdvanceRoundInput type
                                       ({ eliminateTeamId?: string })
      broadcast.ts / broadcast.test.ts  broadcastState -- the ONLY call site that redacts + serialises state per channel.
                                       T2.1: retired `as GridStyle` cast (Defect D3); pointLadder now read off
                                       `board.meta`, not round.style -- see style-author obligation below.
                                       `styleState` deliberately NOT on `BroadcastPayload` (invariant 5)
      host-manual-round.test.ts       integration test: a full host-manual round via intents/log/session together
    styles/
      grid.ts / grid.test.ts          T1's one style plugin (buildBoard, availableQuestions).
                                       T2.1: buildBoard gains unused `_state` param; publishes `meta.pointLadder`
                                       (the worked example for the new style-author obligation)
    scoring/
      flat.ts / flat.test.ts          T1's one scoring plugin (pure ScoreDelta[] output)
    transport/
      local.ts / local.test.ts        zero-dependency local HTTP+SSE transport, host-token auth, path-traversal containment
    stage/
      index.html, main.ts             projector view -- imports ONLY redacted state (enforced by check-stage-host-isolation.mjs)
    host/
      index.html, main.ts             host controller -- select/arm/pause/resume/award/undo/next
    server.ts                        glue entrypoint; boots local transport + demo-t1 preset (npm run show)
                                      T2.2: intentsForCommand gained 'advanceRound' (payload:
                                      { eliminateTeamId?: string }, delegates to advanceToNextRound) and
                                      'continue' (no payload; leaves roundIntro/intermission). endRound/next
                                      unchanged. No new dispatch mechanism -- both route through the existing
                                      single dispatchHostAction call site.
  scripts/
    run-tests.mjs             discovers and runs every src/**/*.test.ts in one process (no test framework)
    check-stage-host-isolation.mjs   static import-boundary check: stage/ must never import host-only modules
  presets/
    school-assembly.ts       worked 3-round example (grid -> double points -> wager final) -- untouched by T1
    demo-t1.ts               T1 demo preset. T2.2: BOTH rounds now playable start to finish (doc-comment
                              only change -- exported config byte-identical); round 2's board rebuild,
                              per-round overrides (point ladder, questionSec), and the reveal -> roundIntro
                              boundary are all live-verified against the real server (T2.2 EVL Drive 1)
  process/                   agent harness (this tree)
```

**T1 (playable core, host-manual) landed 2026-08-24.** 27 new files, 3 modified
(`package.json`, `tsconfig.json`, `package-lock.json`). `src/config/**`, `src/registry/index.ts`,
and `presets/school-assembly.ts` are byte-identical to pre-T1 (`git diff` empty) -- the whole
engine was built as new sibling files, per the plan's protected-file constraint.

**T2.1 (StylePlugin/Intent/SessionState contract revision) landed 2026-08-27, WITH_GAPS.** 13
files modified, 0 created/deleted. `src/registry/index.ts` gained exactly 3 members
(`styleState`, two intents, `buildBoard`'s `state` param); `src/config/types.ts` untouched. All
4 automated gates green, EVL-confirmed independently. VALIDATE was SKIPPED for this phase at
user direction -- 6 plan defects were found during EXECUTE (3 hard breaks the plan said would
not happen), none of which are outstanding (all fixed same-session). See
`process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_CLOSEOUT_24-08-26.md`
for the full process-learning record. Task folder is **kept active**, not archived -- one
Hybrid-tier gate (`INTENT_EVENT_NAMES` diff, T2 SPEC AC#12) needs human sign-off, not agent
judgment (see Outstanding Work below).

**T2.2 (multi-round shows) landed 2026-08-27, automated-CLEAN.** 12 files modified, 0
created/deleted. `advanceRound` is now bounded at two independent layers (session.ts dispatch-time
throw + intents.ts apply-time no-op backstop), the round boundary (elimination, `carryScores`
reset, `minTeams` round-skip cascade, entry-phase targeting) is one atomic `dispatchHostAction`
batch reversible by one `undo()`, and `PHASE_TRANSITIONS` gained the one edge this required
(`reveal -> roundIntro`). `src/config/types.ts` and `src/registry/index.ts` untouched. EVL ran
96/96 independent adversarial checks with zero failures and confirmed CLEAN. VALIDATE was SKIPPED
for this phase too (T2.1 precedent). Task folder is **kept active**, not archived -- the plan's own
Phase Completion Rules require a human browser click-through before VERIFIED, and the execute-agent
explicitly declined to claim that gate (see Outstanding Work below). See
`process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_CLOSEOUT_27-08-26.md`
for the full process-learning record, including the SECOND instance of a vacuous test assertion
(`tests/all-tests.md` §Weak-Assertion Review Question) and the eliminated-team score-display
product question (backlog).

Still not built: T2.3 (remaining 5 styles, grid Defect D1 fix), T2.4/T2.5 (streak/lifeline write
paths), any input plugin (buzzer/network), persistence. See
`process/general-plans/active/gameshow-engine_24-08-26/` for the T1 plan/report/closeout,
`process/general-plans/active/gameshow-engine-t2_24-08-26/` for T2's, and
`process/general-plans/active/gameshow-engine-t2.2_27-08-26/` for T2.2's -- all three task folders
are **kept active**, not archived (see Outstanding Work below).

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

**Five invariants (do not break):**
1. The stage view stays fully playable with zero players connected (`degradeToOfflineOnNetworkLoss`).
2. Content is snapshotted into the session at launch (`snapshotContentAtLaunch`) — editor
   edits must never mutate a live board.
3. Scoring plugins are pure.
4. Answers are redacted at the **transport** boundary (`redactQuestion`), never in the view layer.
5. **`styleState` is server-only; it never reaches `BroadcastPayload`.** (Locked 2026-08-27,
   post-T2.1 EVL.) `styleState` appears nowhere in `src/engine/broadcast.ts` — style-derived
   data reaches clients only via `board.meta`/`board.cells[].meta`. This is deliberate: because
   `styleState` never goes on the wire, answer-adjacent intermediates (e.g. hangman's masked-label
   computation) structurally cannot leak to the projector. Do not "helpfully" add `styleState` to
   `BroadcastPayload` in a future phase — if a client needs a specific piece of style state,
   project it through `board.meta` instead. See `CUSTOMIZATION.md` §Five invariants.

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

**T2.1 contract shape (new 2026-08-27 — read before writing a new `StylePlugin` in `src/styles/`):**

- **`SessionState.styleState: Record<string, unknown>`** — opaque per-style scratch space, the
  engine never interprets it. JSON-safe values ONLY (`Set`/`Map` silently collapse to `{}` on
  serialisation — confirmed by T2.1 EVL; this exact bug class already shipped once in T1 via
  `ReadonlySet`). Written via the `setStyleState` intent, never by mutation (keeps one host
  action reversible by one `undo()`, Design Lock L2a). See invariant 5 above — it is server-only
  and does not reach `BroadcastPayload`.
- **Two new `Intent` variants:** `setStyleState` (wholesale-replaces `styleState`) and
  `advanceRound` (increments `roundIndex`, clears `styleState`). Both proven via
  `INTENT_TOUCHED_KEYS`'s undo machinery, including the first two-key batch-union undo row in
  the codebase (`advanceRound` touches both `roundIndex` and `styleState`). Neither has a live
  dispatch call site yet — T2.2 wires the first one.
- **`StylePlugin.buildBoard(round, options, state)`** — third parameter `state: SessionState`
  is now required (read-only; styles must not mutate it). Interface compliance only for `grid`
  (unused, named `_state`) — this exists so a T2.3 style can derive per-cell data from live
  state (e.g. `styleState`) that `grid` doesn't need.
- **Style-author obligation: `board.meta.pointLadder`.** Moved from the round's style config to
  `board.meta` as the source of truth for audience point-value labels — omitting it fails
  SILENTLY (blank labels, no error). See `CUSTOMIZATION.md` §Writing a style plugin before
  authoring any of the five remaining T2.3 styles.
- **`GameEventName` accounting (D5), corrected 2026-08-27:** 19 members total; reachable 7→8
  (`advanceRound → round.started`, exact match); unreachable 12→11; fallbacks 6→7
  (`setStyleState → phase.changed`, new fallback). The T2.1 plan's original stated baseline
  (11→10 unreachable) was wrong by one; corrected via EVL, independently recomputed twice.

**T2.2 round-boundary shape (new 2026-08-27 — read before touching `session.ts`'s
`advanceToNextRound`, `server.ts`'s `advanceRound`/`continue` cases, or a `Round`'s
`intro`/`intermissionAfter`/`eliminateLowest`/`minTeams` fields):**

- **`advanceRound` is bounded at two independent layers.** Layer A (dispatch-time,
  `session.ts`'s `advanceToNextRound`): throws before any intent is built if
  `state.roundIndex >= program.rounds.length - 1` — no `dispatchHostAction` call happens, no
  `seq` is consumed. Layer B (apply-time, `intents.ts`'s `applyIntent` `advanceRound` case):
  no-ops (`return { ...state }`) if the next index would exceed the last valid round. Layer B
  is the defensive backstop for any future caller that reaches `applyIntent` directly. Both
  layers independently confirmed adversarially by EVL (no compounding on repeated out-of-range
  calls). This closes backlog item 1 from `gameshow-engine-t2.2-blockers.md`.
- **One host click = one batch = one `undo()`, even for a multi-effect round boundary.**
  `advanceToNextRound` returns a single `Intent[]` that can contain elimination
  (`Round.eliminateLowest`, ties rejected unless `input.eliminateTeamId` names a tied
  candidate), a score-reset (`program.carryScores: false`, one `awardPoints` per non-zero-score
  team — **including a team eliminated in the SAME batch**, see the eliminated-team score
  backlog decision below), one or more `advanceRound` intents (`Round.minTeams` skips rounds
  forward, cascading to `setPhase('final')` with **zero** `advanceRound` intents if every
  remaining round fails its `minTeams` check), and the final `setPhase` targeting
  `intermission`/`roundIntro`/`board`. `server.ts`'s `'advanceRound'` command delegates to this
  function directly; `'continue'` is a separate, no-payload command handling only
  `roundIntro`/`intermission` exit. `'endRound'`/`'next'` are unchanged and never call
  `advanceRound`.
- **`PHASE_TRANSITIONS` gained exactly one edge**: `reveal -> roundIntro` (needed when the
  just-completed round has no `intermissionAfter` but the next round has `intro.enabled`). Every
  other edge this design needs already existed — verified against the full table before adding
  this one (T2.2-L7).
- **`CopyStrings` reuse, not new fields** (`src/config/types.ts` stayed frozen this phase):
  `copy.host.next` covers both "next question" and "Next Round"; `copy.host.endRound` covers
  both "end this round" and "End Show" (shown only on the last round); `copy.host.skip` (unused
  before T2.2) is reused for the `roundIntro`/`intermission` "Continue" control. Disclosed
  compromise, not a clean host-facing UX — a future phase with `types.ts` in scope should add
  dedicated `nextRound`/`endShow`/`continue` copy fields.

## Environment and Configuration

No environment variables and no secrets at present — the engine is local-first and has no
external service dependencies. If a hosted transport is added later, its credentials belong
in env vars and must never be committed.

Show configuration is **not** environment configuration: it lives in typed preset files
under `presets/`, versioned in git.

## Scan Metadata

- Scanned: 2026-08-24 (T0 baseline) / updated 2026-08-24 (T1 engine core landed) / updated
  2026-08-27 (T2.1 contract revision landed, WITH_GAPS) / updated 2026-08-28 (T2.2 multi-round
  shows landed, automated-CLEAN)
- Method: vc-setup Flow A (new project) for T0; UPDATE PROCESS reconciliation against the
  T1 execute report + PLAN + SPEC for T1's update; UPDATE PROCESS reconciliation against the
  T2.1 EXECUTE report + EVL confirmation report + PLAN for T2.1's update; UPDATE PROCESS
  reconciliation against the T2.2 EXECUTE report + EVL confirmation report + PLAN for this update
  (no direct re-read of every source file — spot-verified `phase.ts`, `session.ts`, `server.ts`
  command names against the EVL report's claims)
- Source files: 6 TypeScript files at T0 (~1400 lines); 27 new files added by T1; 13 files
  modified by T2.1; 12 files modified by T2.2, 0 created/deleted each phase (see Repository
  Structure above)
- Verified: full gate sequence (`npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`)
  green from a clean `dist/` at T1 EXECUTE + independent EVL confirmation run; 12 test files
  pass. T1: 3 manual gates remain unconfirmed by a human. T2.1: all 4 automated gates
  independently re-run green by EVL (`gameshow-engine-t2-evl-iteration-001_REPORT_27-08-26.md`);
  1 Hybrid-tier gate (`INTENT_EVENT_NAMES` diff, T2 SPEC AC#12) remains unconfirmed by a human.
  T2.2: all 4 automated gates independently re-run green by EVL, plus 96/96 independent
  adversarial checks
  (`gameshow-engine-t2.2-evl-iteration-001_REPORT_27-08-26.md`); the plan's own human
  browser click-through gate remains unconfirmed — see Outstanding Work.

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

**T2 SPEC input — 4 contract gaps, resolved by T2.1 (2026-08-27):**

- No `SessionState` slot for style-owned persistent state (blocks a `tictac`-style plugin). —
  **RESOLVED**: `SessionState.styleState`.
- `StylePlugin.buildBoard` does not receive `state`. — **RESOLVED**: 3rd `state` param, required.
- No `Intent` variant touches `roundIndex` — T1 could only play round 1. — **RESOLVED**: `advanceRound`
  is now bounded at two layers and has a live dispatch site (`session.ts`'s `advanceToNextRound`,
  wired to `server.ts`'s `advanceRound`/`continue` commands, landed T2.2 2026-08-27).
- `GameEventName` closed union forcing imprecise fallbacks. — **PARTIALLY RESOLVED**: one more
  fallback added (`setStyleState`, 6→7), one more previously-unreachable member closed
  (`advanceRound → round.started`, unreachable 12→11). Net direction is the same tradeoff as
  before, now with `setStyleState` as a 7th fallback pending Hybrid-tier human sign-off
  (T2 SPEC AC#12) on whether that's acceptable.

**New style-author obligation from T2.1 (undocumented before this update; see
`CUSTOMIZATION.md` §Writing a style plugin):** a style publishing `board.meta.pointLadder`
is now required for audience point-value labels — omission fails silently (blank labels).

**Outstanding work**

- **T0 (config schema, cascade, registry, redaction) — DONE.** `src/config/**`,
  `src/registry/index.ts` contract shape frozen except for T2.1's 3 additive members.
- **T1 (playable core, host-manual) — DONE, code-complete and automated-gate-green, but NOT
  yet VERIFIED.** Phase machine, intents/log/undo, `grid` style, `flat` scoring, `local`
  transport, stage view, host controller, `demo-t1` preset, `server.ts` glue entrypoint all
  exist and pass the full gate sequence. Three manual gates remain open (see below) — the
  plan's own Phase Completion Rules require human confirmation for these, not agent judgment.
  Full detail: `process/general-plans/active/gameshow-engine_24-08-26/` (task folder kept
  active, not archived, until the manual gates close).
- **T2.1 (StylePlugin/Intent/SessionState contract revision) — CODE DONE, all 4 automated
  gates green, EVL-confirmed independently. NOT yet VERIFIED** — one Hybrid-tier gate
  (`INTENT_EVENT_NAMES` diff review, T2 SPEC AC#12) requires explicit human sign-off, not
  agent judgment. Full detail:
  `process/general-plans/active/gameshow-engine-t2_24-08-26/` (task folder kept active, not
  archived, until that sign-off lands).
- **T2.2 (multi-round shows) — CODE DONE, all 4 automated gates green, EVL-confirmed
  independently (96/96 adversarial checks). NOT yet VERIFIED** — the plan's own Phase Completion
  Rules require a human browser click-through (host UI reveal-phase controls, tie buttons, the
  `final` banner on host + stage), and the execute-agent explicitly declined to claim that gate.
  This is the CLEAN-vs-VERIFIED distinction: EVL's `closeout_classification: CLEAN` reflects the
  automated layer only; VERIFIED additionally requires the human gate below. Full detail:
  `process/general-plans/active/gameshow-engine-t2.2_27-08-26/` (task folder kept active, not
  archived, until that click-through lands).
- **Manual gates still open (need a human, not more code):**
  1. Projector legibility from the back of a room (item 23, T1) — needs a real external display.
  2. Host token visibly required, confirmed via a browser DevTools network tab (item 26, T1) —
     raw-HTTP 401 is confirmed programmatically; the browser confirmation step is not done.
  3. A full pre-show dry run on the real venue network (SPEC AC#11, T1) — not done.
  4. `INTENT_EVENT_NAMES` diff human sign-off (T2.1, T2 SPEC AC#12) — is `setStyleState →
     phase.changed` an acceptable 7th fallback? Numbers are computed and correct (see D5
     correction above); the judgment call is not resolvable by any agent.
  5. T2.2's host/stage browser click-through (5-step checklist in the T2.2 EVL report §STEP 5) —
     no DOM/browser test harness exists in this repo to automate it; see the DOM harness backlog
     decision below.
- **T2.3 (remaining 5 styles: list/trivia/wheel/tictac/hangman, + grid Defect D1 fix)** —
  blocked on T2.1 (now unblocked). Read `CUSTOMIZATION.md` §Writing a style plugin first.
- **T2.4 (streak)/T2.5 (lifelines)** — `attemptsUsed`/`TeamState.streak`/
  `TeamState.lifelinesUsed` write paths still have no owner (T2.1 Open Item 1, carried
  forward unchanged).
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
- **`advanceRound` unbounded-ness — RESOLVED 2026-08-27, T2.2.** Bounded at two independent
  layers (session.ts dispatch-time throw, intents.ts apply-time no-op backstop); 96/96
  adversarial EVL checks confirm no compounding on repeated out-of-range calls. Backlog item 1
  closed.
- **`setStyleState` adopts the caller's object by reference** (new 2026-08-27, T2.1). A caller
  that retains and later mutates the object it dispatched corrupts both live `styleState` AND
  the already-logged undo audit entry (same reference, not a snapshot). Reproduced by EVL, not
  yet guarded by a test. Recommended fix: a defensive clone in `applyIntent`'s `setStyleState`
  case — tracked in backlog.
- **`carryScores: false` zeroes the score of a team eliminated in the SAME batch** (new
  2026-08-27, T2.2). `advanceToNextRound`'s score-reset loop iterates `state.teams` unfiltered,
  so a team simultaneously eliminated by `Round.eliminateLowest` in the same batch ends the
  batch at `score: 0, eliminated: true` — the finale podium then shows an eliminated team's score
  as 0, not the score they actually earned. Implemented exactly as the plan specifies (T2.2-L4);
  empirically confirmed by EVL (score 10 → 0). Whether this is the desired host-facing behavior
  is a product decision, not an engineering defect — see the backlog note. Only bites shows that
  use `eliminateLowest`.
- **No DOM/browser test harness exists in this repo** (confirmed 2026-08-27, T2.2 EVL). No
  jsdom, happy-dom, Playwright, Puppeteer, or Testing Library in `package.json`. `src/host/main.ts`
  and `src/stage/main.ts` render branches (button labels, tie buttons, the `final` banner) have
  zero automated coverage and can only be verified by a human browser click-through. This is a
  genuine repo-wide tooling gap, not an oversight in any one phase — the gap will widen as T2.3
  adds five more styles with their own render branches. See the DOM harness backlog decision.
- **`styleState`'s unredacted-broadcast risk (R3) is a discipline requirement, not a structural
  guarantee** — no automated scan for answer-derived text in `styleState`'s contents.
  Currently dormant (styleState isn't on the wire at all — invariant 5), but becomes live the
  moment a T2.3 style both writes answer-derived text to `styleState` AND a later phase adds
  `styleState` to `BroadcastPayload` (which invariant 5 says not to do without re-deriving
  through `board.meta` instead).
