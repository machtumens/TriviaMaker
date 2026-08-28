---
name: context:all-tests
description: "test runners, commands, and verification order — the tests group entrypoint/router"
keywords: test, testing, verification, typecheck, assert, coverage, regression, gate, evl, manual gates
related: []
date: 24-08-26
---
# TriviaMaker Engine - All Tests

Last updated: 2026-08-28 (T2.2 multi-round shows — same 12 files, new test blocks for the round boundary; DOM harness gap confirmed genuine; standing weak-assertion review question added)

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
- the manual (human-required) verification gates that no automated test replaces

## Read This When

Use this file when you need to:

- run tests after implementation
- decide between test runners
- debug failing tests
- decide whether a plan/phase is ready to archive (manual gates below block archival — see `planning/all-planning.md`)

## Quick Routing

| Need | Go to |
|---|---|
| run everything (the full gate sequence) | see Commands below |
| config cascade behaviour | `src/config/resolve.test.ts` |
| plugin registry validation | `src/registry/validateConfigPlugins.test.ts`, `src/registry/bootstrap.test.ts` |
| phase machine | `src/engine/phase.test.ts` |
| intents / applyIntent | `src/engine/intents.test.ts` |
| event log + undo | `src/engine/log.test.ts` |
| session (dispatchHostAction, resolveRoundContent) | `src/engine/session.test.ts` |
| broadcast / redaction / serialisation | `src/engine/broadcast.test.ts` |
| a full host-manual round, engine layers together | `src/engine/host-manual-round.test.ts` |
| `grid` style plugin | `src/styles/grid.test.ts` |
| `flat` scoring plugin | `src/scoring/flat.test.ts` |
| local HTTP+SSE transport, host-token auth, path traversal | `src/transport/local.test.ts` |
| stage/host bundle import isolation | `scripts/check-stage-host-isolation.mjs` |

## Commands

```bash
npm run typecheck     # tsc --noEmit, strict, whole project
npm test              # tsx scripts/run-tests.mjs — discovers and runs every src/**/*.test.ts in one process
npm run build          # vite build — stage + host bundles
node scripts/check-stage-host-isolation.mjs   # static import-boundary check
npm run show           # tsx src/server.ts — boots the demo on :8080 (PORT env to override)
```

**The full gate sequence** (what EVL / CI-equivalent runs — always from a clean `dist/`):

```bash
rm -rf dist && npm run typecheck && npm test \
  && node scripts/check-stage-host-isolation.mjs && npm run build
```

All four steps must exit 0. This is the plan's own Sub-Phase 8 gate and the exact command
the T1 execute report and the independent EVL confirmation run both used.

## Test File Map (12 files — same count since T1; T2.1 added blocks within existing files, not new files)

| Area | File | What it proves |
|---|---|---|
| Config cascade | `src/config/resolve.test.ts` | deep-merge cascade, array-replace, theme→CSS, redaction (pre-T1, unchanged) |
| Plugin preflight | `src/registry/validateConfigPlugins.test.ts` | unregistered-plugin-key errors are specific, name alternatives |
| T1 bootstrap | `src/registry/bootstrap.test.ts` | T1 plugin set registers cleanly; `validateConfigPluginsT1` preflight |
| Phase machine | `src/engine/phase.test.ts` | phase transition table correctness |
| Intents | `src/engine/intents.test.ts` | `applyIntent` behaviour per `Intent` variant. **T2.1**: `setStyleState`/`advanceRound` cases added; `EXPECTED` union-completeness list (checked against `INTENT_TOUCHED_KEYS`) extended — this is the guard that caught the plan's own missing `EXPECTED` entries (Plan Deviation #3). **T2.2**: `advanceRound` now bounded — a `CONFIG_MULTI_ROUND` fixture added; two existing blocks updated to use it (the default 1-round config now makes a plain advance a no-op); new boundary no-op test (item 19), whose second assertion was found vacuous (comparing `{}` to the same `{}` reference) and strengthened with a populated `styleState` fixture — see §Weak-Assertion Review Question below |
| Event log + undo | `src/engine/log.test.ts` | batch-union snapshot (L2a), reversal-without-deletion, depth bounding, empty-log no-op, 2/3-intent host-action batches. **T2.1** blocks (f)/(g): a `setStyleState` batch fully reversed by one `undo()`; an `advanceRound` batch reversing BOTH `roundIndex` AND `styleState` in one `undo()` — the first two-key `INTENT_TOUCHED_KEYS` row in the codebase. **T2.2** block (h): a 5-intent round-boundary batch (eliminate + 2×score-reset + advanceRound + setPhase) reverses in exactly one `undo()` — the direct regression guard for "one host action = one undo," and the first place a batch dispatches the SAME intent type more than once (`minTeams` multi-round skip) |
| Session | `src/engine/session.test.ts` | `dispatchHostAction`, `resolveRoundContent`. **T2.1**: +1 assertion that `createSession`'s returned `SessionState.styleState` is `{}`. **T2.2**: new `advanceToNextRound` branch-matrix block (13+ scenarios) — phase guard, last-round guard, `eliminateLowest` tie handling, `carryScores` reset, `minTeams` cascade including full-cascade show-end, entry-phase targeting |
| Broadcast/redaction | `src/engine/broadcast.test.ts` | per-channel redaction by VALUE (not key name), Set→array serialisation, derived `cells[].consumed`. **T2.1**: `styleState` JSON round-trip (nested array + nested object, deep-equal after `JSON.parse(JSON.stringify(...))`); a control assertion proving a `Set` collapses to `{}`; re-run of the value-based sentinel leak scan with a populated `styleState`. Fixture `buildBoard` also gained `meta: { pointLadder }` — required after the D3 fix moved `pointLadder`'s source of truth to `board.meta` (see Plan Deviations #2 in the T2.1 execute report) |
| Integration | `src/engine/host-manual-round.test.ts` | a full host-manual round through phase+intents+log+session together. **T2.1**: its `gridStyle.buildBoard` call site gained the required 3rd `state` argument (Plan Deviation #1 — the plan wrongly called this file VERIFY-ONLY). **T2.2**: extended to 2 rounds, proving `demo-t1`-shaped round 2 is reachable end to end through `reveal -> roundIntro -> board`; a second, independent block imports the REAL `presets/demo-t1.ts` and asserts both rounds' content resolves without throwing |
| Style plugin | `src/styles/grid.test.ts` | `grid.buildBoard`, `availableQuestions`. **T2.1**: both `buildBoard` call sites gained a 3rd argument |
| Scoring plugin | `src/scoring/flat.test.ts` | pure `ScoreDelta[]` output, no `-0` regression. **T2.1**: hand-built `SessionState` literal gained `styleState: {}` |
| Transport | `src/transport/local.test.ts` | host-token 401s, path-traversal 403s, SSE retained-frame-on-connect |

## Testing Approach

Deliberately **no test framework** — checks are plain `tsx` scripts using
`node:assert/strict` that exit non-zero on failure, aggregated by `scripts/run-tests.mjs`
(auto-discovers every `src/**/*.test.ts` and runs them in one Node process). Rationale:
this project has very few moving parts that benefit from a runner, and a framework is a
dependency plus config plus a learning curve for student contributors.

**Shared-process caveat (new since T1):** because `run-tests.mjs` imports every test file
into one process, the plugin registry is shared across all 12 files. Test files MUST
register unique plugin keys (e.g. `vcp-test-*` prefixes) — the registry throws on
duplicate keys, and that throw is the intended signal of a naming collision, not a bug in
the aggregator.

### 8-file Vitest-migration trigger — status: BREACHED, deliberately not acted on yet

This file previously said "introduce Vitest at more than ~8 test files." **T1 added 8 new
test files, bringing the total to 12 — the trigger's file-count condition is met.**
Vitest was NOT introduced. Reasoning, recorded here rather than silently letting a
documented trigger go stale:

- The zero-new-runtime-dependency constraint was a hard design lock for T1 (see the T1 plan's
  Design Locks and the execute report's "Hard constraints" table). Adding Vitest mid-T1 would
  have violated that lock for no T1-scoped benefit.
- `scripts/run-tests.mjs`'s discovery-based aggregation scales past 12 files without any
  aggregator change — the trigger's original pain point (manual script listing becoming a
  bottleneck) has NOT materialized, because discovery is automatic, not manually maintained.
- The other two trigger conditions — watch mode during UI iteration, and coverage reporting
  — are still both false. Neither has been needed yet.

**Reassess at T2.** T2 adds the remaining 5 styles + 3 scoring engines + lifelines/special
tiles, which will push the file count well past 12 and is exactly when "UI iteration in
earnest" (the watch-mode trigger) becomes likely. Treat this as a live open question for the
next UPDATE PROCESS pass, not a settled "never migrate" decision.

## Default Verification Order

1. `npm run typecheck` — the schema is the contract; type errors are the first gate
2. `npm test` — all 12 test files (cascade, engine, plugins, transport)
3. `node scripts/check-stage-host-isolation.mjs` — stage bundle must never import host-only code
4. `npm run build` — `vite build`; a clean build is part of the gate, not a separate step
5. Manual gates — **required** before any live event. Nothing automated substitutes for
   these; see "Manual Gates" below.

## Weak-Assertion Review Question (standing check — new 2026-08-28)

This project has now shipped the SAME class of vacuous test **twice**, caught both times by an
agent reading critically rather than by any automated gate:

1. **T1** — a redaction test scanned the serialised broadcast payload by KEY NAME, not by value.
   It looked correct (the config also has a legitimate `copy.answer` field) but would have missed
   a genuine answer-key leak through `content.banks` for 5 PVL cycles. See §What Must Always Have
   a Test above.
2. **T2.2** — `intents.test.ts` item 19's second assertion compared `after.styleState` to
   `before.styleState` on the DEFAULT fixture, where both were the SAME empty-object reference
   (`{}`). It would have passed even if a rejected `advanceRound` incorrectly cleared a populated
   `styleState` — the assertion was structurally incapable of catching the bug it named. Fixed by
   using a POPULATED `styleState` fixture instead (see the intents.test.ts row above).

**Before considering any new or modified assertion done, ask: "would this assertion still pass if
the behaviour it names were broken?"** Concretely:

- Comparing a value to itself (same object reference, or two literals guaranteed equal
  regardless of the code path under test) is not a test — it is decoration.
- A no-op/rejection/rejected-branch test needs a fixture where the "nothing changed" claim is
  actually falsifiable (i.e., something WAS present beforehand that could have been wrongly
  cleared, mutated, or added).
- A redaction/leak test must scan by VALUE, not by field/key name — see §What Must Always Have a
  Test.

Apply this question deliberately during every future PVL (plan review) and EVL (execute
verification) pass for this project, not just when a defect happens to surface. Treat it as a
standing item in the weak-test scan step of EVL, not a one-off learning.

## What Must Always Have a Test

- `deepMerge` / `resolveConfig` — load-bearing. If they break, every customisation layer
  silently collapses to defaults with no error, and you find out on stage.
- `redactQuestion` / `broadcastState` — a regression here leaks the answer key to the
  projector. **Test by VALUE (sentinel strings scanned in the serialised payload), never by
  key name** — `SessionState.config` has a legitimate `copy.answer` field, so a key-name
  scan passes even when `content.banks` (every question and answer) leaks. This is not a
  style preference — a key-name redaction test genuinely missed this gap for 5 PVL cycles
  during T1 (see `all-context.md` T1 engine patterns / the closeout packet's Learnings).
- Any scoring engine — purity and arithmetic both (including `-0` edge cases — `flat.ts` had
  one, see the T1 execute report).
- The event log / undo path — batch granularity, not per-Intent granularity (see
  `all-context.md` T1 engine patterns).
- Any transport auth path — both the missing-token and wrong-token cases, plus both
  path-traversal encodings (literal `../` and `%2e%2e`) — `fetch`/WHATWG-URL silently
  normalises the literal form client-side, so a traversal test built on `fetch` can pass
  without the server's containment check ever being exercised. Use raw `node:http` requests.
- **`styleState` JSON-safety (new since T2.1).** Any value stored in `SessionState.styleState`
  must survive `JSON.parse(JSON.stringify(...))` unchanged. `Set`/`Map` silently collapse to
  `{}` — confirmed by `broadcast.test.ts`'s control assertion. This is not a hypothetical: a
  `ReadonlySet` shipped in exactly this position once already in T1.

## Manual Gates (never satisfied by an automated test — human confirmation required)

These are Agent-Probe/Manual by design, per the T1 plan's Phase Completion Rules: *"the
manual gates are never marked VERIFIED without an explicit human confirmation recorded in
the phase report — an agent judgment call alone does not satisfy these rows."* As of
2026-08-24 (T1 EXECUTE), all three remain open:

| Gate | Status | What would close it |
|---|---|---|
| Projector legibility from the back of a room | NOT DONE | Run the stage view on a real external display, read from the back row |
| Host token requirement visibly confirmed via a browser DevTools network tab | PARTIALLY DONE — raw-HTTP 401 confirmed for both missing and forged tokens | Open the host controller in a browser, inspect the actual network request in DevTools |
| Full pre-show dry run on the real venue network (SPEC AC#11) | NOT DONE | Run a complete show end-to-end on the actual venue LAN before a live event |
| `INTENT_EVENT_NAMES` diff review — is `setStyleState → phase.changed` an acceptable 7th fallback? (T2.1, T2 SPEC AC#12) | NOT DONE — numbers computed and independently confirmed twice (19 members, unreachable 12→11, fallbacks 6→7); the judgment call itself is not agent-resolvable | A human reviewer reads the `INTENT_EVENT_NAMES` diff and records sign-off in the phase report |
| T2.2 host/stage browser click-through — Next Round / Eliminate-tie buttons / End Show / Continue / `final` banner on both host and stage | NOT DONE — `server.ts`'s command layer was live-verified twice via direct HTTP drives (96/96 adversarial checks pass), but the DOM rendering itself has zero automated coverage; no DOM harness exists to close it | A human opens `npm run show` in a browser and works through the 5-step checklist in `gameshow-engine-t2.2-evl-iteration-001_REPORT_27-08-26.md` §STEP 5, recording the outcome in the phase report |

A plan/phase with any of these still open is `Keep in active/testing`, not archivable — see
`planning/all-planning.md`.

## Known Gaps

- **No DOM/browser test harness exists in this repo at all (confirmed genuine, 2026-08-27, T2.2
  EVL).** `package.json` `devDependencies` contains only `@types/node` and `vite` — no jsdom,
  happy-dom, Playwright, Puppeteer, or Testing Library. No test file imports
  `src/host/main.ts` or `src/stage/main.ts`. This is not an oversight in T2.2 specifically — it is
  a repo-wide tooling absence that makes every host/stage render branch (button labels, tie
  buttons, phase-gated banners) permanently Agent-Probe/Manual-only until a harness is adopted.
  Confirmed empirically, not inferred: EVL grepped `package.json` and the whole test suite for
  DOM-testing imports and found none. The gap will widen every phase that adds host/stage UI
  branches (T2.3's five styles each need their own render logic). Whether to adopt jsdom or
  Playwright is a cross-phase tooling decision — see the backlog note
  (`process/general-plans/backlog/gameshow-engine-dom-test-harness.md`).
- **No CI.** `npm run typecheck && npm test` (and the full gate sequence) is still a
  local-only check. No `.github/` workflow exists. Recommended near-term follow-up.
- **Import isolation is source-level only.** `check-stage-host-isolation.mjs` reads import
  specifiers; it would not catch a transitive import through a third module. A stronger
  check — scanning the built bundle content for answer strings/host-only field names — was
  done manually once during T1 EXECUTE (`grep` on `dist/assets/stage-*.js`) and is
  recommended as a scripted follow-up (`scripts/check-bundle-content.mjs`, not yet built).
- **No E2E.** When more of the stage/host UI exists, Playwright against the local server is
  still the plan.
- **No visual regression on the stage view.**
- **`applyIntentsWithLog([])` (empty-batch path) is untested.** Confirmed unreachable from
  any live `server.ts` command during T1; non-blocking, but a `log.test.ts` case for it is a
  cheap follow-up.
- **No test asserts `withPointValueLabels`'s input contract (new since T2.1).** A style that
  forgets `board.meta.pointLadder` fails SILENTLY (blank audience labels) rather than loudly.
  Reproduced by both the T2.1 execute-agent and EVL. Recommended follow-up: a guard test or
  runtime warning, not required to close T2.1.
- **No mechanical enumeration guard for `INTENT_EVENT_NAMES` (new since T2.1).**
  `INTENT_TOUCHED_KEYS` has one (`intents.test.ts`'s `EXPECTED` list) and it caught a real
  omission this session (Plan Deviation #3). `INTENT_EVENT_NAMES` relies on
  `Record<Intent['type'], GameEventName>` alone, which proves completeness but not intent — a
  wrong-but-valid event name is invisible to any test.
- **No fixture-level guard that every `StylePlugin` implementation is exercised through the
  real 3-arg contract (new since T2.1).** TypeScript accepts a `buildBoard` implementation
  with fewer parameters than the interface declares, so `broadcast.test.ts`'s `fixtureStyle`
  silently type-checked through the T2.1 signature change — only its runtime consequence
  (blank `pointLadder`) surfaced, and only because an unrelated assertion happened to cover
  it.
- **`setStyleState` reference-adoption corruption path is reproduced but not test-guarded
  (new since T2.1).** `applyIntent` assigns `intent.nextStyleState` directly — a caller that
  retains and mutates the object after dispatch corrupts both live state and the logged undo
  entry. See `all-context.md` Known risks. Recommended follow-up: a defensive-clone change
  plus a regression test for the corruption path itself.
