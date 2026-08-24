---
name: context:all-context
description: "root context router — architecture, stack, patterns, and routing to every context group"
keywords: architecture, stack, routing, overview, conventions, structure, engine, config
related: []
date: 24-08-26
---
# TriviaMaker Engine - All Context

Last updated: 2026-08-24

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
  src/
    config/
      types.ts               COMPLETE customisation surface (~850 lines) — the contract
      defaults.ts            base layer of the cascade; safe-for-live-event defaults
      resolve.ts             cascade merge, theme→CSS vars, host-only redaction
      resolve.test.ts        self-check for the cascade (node:assert, no framework)
    registry/
      index.ts               12 plugin interfaces + registry + preflight validation
  presets/
    school-assembly.ts       worked 3-round example (grid → double points → wager final)
  process/                   agent harness (this tree)
```

Not yet built: engine core (phase machine, intent application, event log), any UI,
any concrete plugins. See the active phase program for sequencing.

## Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 7.x, `strict` + `noUncheckedIndexedAccess` | schema-first; types are the contract |
| Runtime | Node (ESM) | `"type": "module"` — do not reintroduce CJS |
| Test | `tsx` + `node:assert/strict` | deliberately no framework; checks are plain scripts |
| Build (planned) | Vite, vanilla TS — no UI framework | stage view is token/CSS-driven; a framework buys little |
| Transport (planned) | local LAN server first; pluggable for hosted later | `runtime.transport.driver` registry key |
| Deployment | **local-first** — runs off a laptop on the venue LAN | internet is never a runtime dependency |

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

## Environment and Configuration

No environment variables and no secrets at present — the engine is local-first and has no
external service dependencies. If a hosted transport is added later, its credentials belong
in env vars and must never be committed.

Show configuration is **not** environment configuration: it lives in typed preset files
under `presets/`, versioned in git.

## Scan Metadata

- Scanned: 2026-08-24
- Method: vc-setup Flow A (new project), full manual read of all 6 source files
- Source files: 6 TypeScript files, ~1400 lines total
- Verified: `npm run typecheck` clean, `npm test` passing at scan time

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
- **Test framework.** Currently plain `tsx` scripts. Migration trigger documented in
  `tests/all-tests.md`; not yet met.

**Outstanding work (nothing below is built yet)**

- Engine core: phase machine, intent application, event log, undo
- Concrete plugins: no style, scoring, input, or transport implementation exists
- All UI: stage view, host controller, player view
- Persistence and session resume
- Any automated test beyond the config cascade

**Known risks**

- The config schema is broad and entirely unexercised by a running engine. Expect the first
  real style implementation to reveal gaps in `src/config/types.ts`.
- No live-event rehearsal has occurred. Projector legibility is unverified.
