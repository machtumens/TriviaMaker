---
name: context:all-tests
description: "test runners, commands, and verification order — the tests group entrypoint/router"
keywords: test, testing, verification, typecheck, assert, coverage, regression
related: []
date: 24-08-26
---
# TriviaMaker Engine - All Tests

Last updated: 2026-08-24

Attach this file first when the task involves testing, verification, or test debugging.

This is the fast operator guide for the testing surface:

- which runner to use
- what command to start with
- how to quickly debug common failures
- which deeper file to read next

Do not load the whole `process/context/tests/` folder by default. Start here, then drill down.

---

## How This File Works

This is the `all-tests.md` entrypoint for the `tests/` context group. It follows the `all-*.md` routing convention:

1. Agents read `all-context.md` first and get routed here for testing tasks
2. This file gives quick decision rules and commands
3. For deeper details, agents follow the routing table below to specific docs

As the project grows, add deeper docs to this group (e.g., `e2e-tests.md`, `debugging-and-pitfalls.md`) and add routing entries below. This file stays the fast-start entrypoint.

---

## What This Covers

- test runner selection
- quick commands by package
- fast debugging procedures
- current testing gaps worth remembering

## Read This When

Use this file when you need to:

- run tests after implementation
- decide between test runners
- debug failing tests


## Quick Routing

| Need | Go to |
|---|---|
| run everything | `npm run typecheck && npm test` |
| config cascade behaviour | `src/config/resolve.test.ts` |
| plugin registry validation | `validateConfigPlugins()` in `src/registry/index.ts` |

## Commands

```bash
npm run typecheck     # tsc --noEmit, strict, whole project
npm test              # tsx src/config/resolve.test.ts
```

## Testing Approach

Deliberately **no test framework**. Checks are plain `tsx` scripts using
`node:assert/strict` that exit non-zero on failure. Rationale: this project has very few
moving parts that benefit from a runner, and a framework is a dependency plus config plus
a learning curve for student contributors.

Introduce Vitest only when one of these becomes true:
- more than ~8 test files (manual script listing becomes the bottleneck)
- watch mode is genuinely needed during UI work
- coverage reporting is required

## Default Verification Order

1. `npm run typecheck` — the schema is the contract; type errors are the first gate
2. `npm test` — cascade + redaction behaviour
3. Manual projector check — **required** before any live event. Nothing automated
   substitutes for reading the stage view from the back of the room.

## What Must Always Have a Test

- `deepMerge` / `resolveConfig` — load-bearing. If they break, every customisation layer
  silently collapses to defaults with no error, and you find out on stage.
- `redactQuestion` — a regression here leaks the answer key to the projector.
- Any scoring engine — purity and arithmetic both.

## Known Gaps

- No engine, UI, or integration tests yet (no engine or UI exists).
- No E2E. When the stage view exists, Playwright against the local server is the plan.
- No visual regression on the stage view.
