---
name: report:gameshow-engine-t2.1
description: "EXECUTE report — T2.1 contract revision (styleState, setStyleState/advanceRound intents, state-aware buildBoard, D3 cast retirement). All four gates green; 6 plan defects found and resolved."
date: 24-08-26
status: COMPLETE
feature: general
plan: process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_PLAN_24-08-26.md
phase: T2.1
metadata:
  node_type: memory
  type: report
  feature: general
  phase: T2.1
---

# EXECUTE REPORT — T2.1 Contract Revision

**Date**: 24-08-26
**Status**: COMPLETE — all 18 checklist items implemented, all four gates green
**Plan**: `gameshow-engine-t2_PLAN_24-08-26.md`
**Process note**: VALIDATE was SKIPPED at user direction. No validate-contract, no PVL
loop. The plan had no adversarial review before EXECUTE; the execute-agent was its only
reviewer. **Six plan defects were found** — see `## Plan Deviations`.

## TL;DR

18/18 checklist items done. 13 files modified, 0 created, 0 deleted. Zero edits to
`src/config/types.ts`. Zero new dependencies. All 12 existing test files pass, plus 4 new
test blocks. `rm -rf dist && npm run typecheck && npm test && node
scripts/check-stage-host-isolation.mjs && npm run build` exits 0.

Six plan defects found, two of which were hard compile/test breaks the plan asserted
would not occur.

## What Was Done

### Section A — contract (`src/registry/index.ts`, exactly 3 edits)

1. `SessionState.styleState: Record<string, unknown>` (readonly) with the full mandated
   doc comment: opaque/undo-aware, JSON-safe-values-only, unredacted-broadcast SECURITY
   warning naming the hangman masked-label trap, and reset semantics.
2. `Intent` union gains `{ type: 'setStyleState'; nextStyleState: Record<string, unknown> }`
   and `{ type: 'advanceRound' }`.
3. `StylePlugin.buildBoard(round, options, state)` — third parameter required.
   `isRoundComplete` unchanged.

### Sections B–F — plumbing

4. `INTENT_TOUCHED_KEYS`: `setStyleState: ['styleState']`, `advanceRound: ['roundIndex','styleState']`.
5. `applyIntent`: two new cases (wholesale replace / increment-and-clear). `assertNever`
   exhaustiveness untouched — it produced the intended compile error until both existed.
6. `INTENT_EVENT_NAMES`: `setStyleState: 'phase.changed'` (new fallback),
   `advanceRound: 'round.started'` (exact match).
7. `createSession` initialises `styleState: {}`.
8. `gridStyle.buildBoard` gains `_state: SessionState` (unused, interface compliance).
9–11. Defect D3: `const gridConfig = round.style as GridStyle` deleted, `GridStyle` import
   dropped, `buildBoard(round, { ...round.style, categories }, state)`, and `pointLadder`
   read via a runtime-checked narrow off `hostBoard.meta`. `grep "as GridStyle"
   src/engine/broadcast.ts` returns no match (exit 1).

### Sections G–H — tests

12–16. `styleState: {}` added to the 5 hand-built `SessionState` literals; `grid.test.ts`'s
   two `buildBoard` call sites gained a third argument.
17. `broadcast.test.ts`: `styleState` JSON round-trip (nested array + nested object,
   deep-equal after `JSON.parse(JSON.stringify(...))`), a control assertion proving a `Set`
   collapses to `{}`, and a live `broadcastState` call with a populated `styleState`
   re-running the value-based sentinel leak scan.
18. `log.test.ts`: (f) a `setStyleState` batch fully reversed by exactly one `undo()`; plus
   (g) an `advanceRound` batch rewinding BOTH `roundIndex` and `styleState` in one `undo()`
   — the first two-key `INTENT_TOUCHED_KEYS` row in the codebase (required by AC#4; see
   Plan Deviations #4).

## What Was Skipped or Deferred

Nothing in the plan's checklist was skipped. Everything the plan placed out of scope stayed
out of scope, verified by `git diff --stat`:

- No new style plugin (`list`/`trivia`/`wheel`/`tictac`/`hangman`) — T2.3.
- No round-boundary orchestration (`carryScores`, `intro`, `intermissionAfter`,
  `eliminateLowest`). `advanceRound` exists and works but is dispatched only from test code
  — no live host-action call site — T2.2.
- No grid `selection` fix (Defect D1), no `warnOnce`, no `flat.ts` edits — T2.3.
- `src/config/types.ts`: zero edits (`git diff --stat src/config/types.ts` is empty).
- Zero new runtime dependencies (`package.json` unchanged).

## Test Gate Outcomes

Command run verbatim:
`rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`

| Gate | Tier | Result |
|---|---|---|
| `npm run typecheck` (tsc --noEmit) | Fully-Automated | PASS — no output |
| `npm test` (12 files, tsx aggregate) | Fully-Automated | PASS — `12 test file(s) passed in 0.1s` |
| `node scripts/check-stage-host-isolation.mjs` | Fully-Automated | PASS — `1 stage file(s) checked, no host imports` |
| `npm run build` (vite, clean dist) | Fully-Automated | PASS — `built in 34ms`, 5 artifacts |
| `grep -n "as GridStyle" src/engine/broadcast.ts` | Fully-Automated | PASS — grep exit 1 (no match) |
| `git diff --stat src/config/types.ts` | Fully-Automated | PASS — empty output |
| `INTENT_EVENT_NAMES` before/after diff | **Hybrid — NOT SATISFIED** | Numbers computed and corrected below; the plan's Phase Completion Rules require an explicit HUMAN reviewer confirmation. Not satisfiable by this agent. |
| `styleState` redaction discipline (R3) | Known-Gap (documented) | No automated scan exists. Carried forward, not closed. |

**Chained exit code: 0.**

Per-file: `config/resolve`, `engine/broadcast`, `engine/host-manual-round`, `engine/intents`,
`engine/log`, `engine/phase`, `engine/session`, `registry/bootstrap`,
`registry/validateConfigPlugins`, `scoring/flat`, `styles/grid`, `transport/local` — all PASS.

### Defect D5 accounting (T2.1-L6 — both numbers, mixed outcome)

Computed mechanically from `src/config/types.ts` and `src/engine/log.ts`, not estimated:

- **Fallbacks: 6 → 7** (worse). New fallback: `setStyleState → 'phase.changed'`. Full
  fallback set after: `setTurn`, `stopClock`, `playSound`, `effect`, `eliminate`,
  `setStyleState`, `custom`.
- **Unreachable `GameEventName` members: 12 → 11** (better). Newly reachable:
  `'round.started'`.

**The plan's stated baseline was wrong** — it claims 11 → 10 (T2.1-L6, Open Item 6, AC#5).
`GameEventName` has 19 members; only 7 were reachable before (`phase.changed`,
`score.changed`, `question.revealed`, `question.selected`, `buzz.locked`, `question.armed`,
`round.ended`), now 8. The DIRECTION and MAGNITUDE the plan claims are right; the absolute
figure is off by one. Still unreachable (11): `session.created`, `session.started`,
`session.ended`, `player.joined`, `player.left`, `player.kicked`, `buzz.received`,
`answer.correct`, `answer.wrong`, `answer.timeout`, `lifeline.used`.

## Plan Deviations

Six plan defects. Numbers 1, 2 and 3 were hard breaks — the plan explicitly asserted they
would not occur.

### 1. `host-manual-round.test.ts` was NOT verify-only — it had to change (HARD BREAK)

- **Plan said**: Touchpoints — "VERIFY ONLY — does not hand-build a full `SessionState`
  literal (uses `createSession`); confirm it still passes unmodified". AC#9 likewise.
- **Reality**: line 81 is `return gridStyle.buildBoard(round, options)` — a two-argument
  call site. Making the third parameter required produced
  `host-manual-round.test.ts(81,20): error TS2554: Expected 3 arguments, but got 2`.
- **Fix**: `gridStyle.buildBoard(round, options, state)`. The enclosing helper already
  receives `state: SessionState`, so this is a one-token, zero-behaviour change — within
  AC#9's "or with zero-behavior-change diffs" allowance.
- **Root cause**: the plan grepped only `grid.test.ts` for `buildBoard` call sites (item
  16). A repo-wide grep would have found three.

### 2. The D3 fix broke a shipped `broadcast.test.ts` assertion (HARD BREAK)

- **Plan said**: T2.1-L7 — broadcast.test.ts "needs exactly `styleState: {}` added … no
  other change"; the Risks table says the existing redaction assertions "must still pass
  unmodified".
- **Reality**: item 11 moves the `pointLadder` source of truth from `round.style` (config)
  to `board.meta` (board). `broadcast.test.ts`'s self-contained `fixtureStyle.buildBoard`
  returns `{ kind, cells }` — **no `meta` at all**. So `pointLadder` became `[]` and every
  audience cell label became `''`. Observed failure:
  `AssertionError: stage: cell "r1:0:0" shows its point value — '' !== '100'`.
- **Fix**: the fixture board now returns `meta: { pointLadder: options.pointLadder }`,
  exactly as `grid.ts:73` already does. **No existing assertion was weakened, relaxed or
  deleted** — both label assertions (lines 189-192, 197) stand verbatim and pass.
- **Why this matters beyond the test**: this is a real, undocumented semantic change to the
  style contract. Post-T2.1, a style that wants audience point-value labels MUST publish
  `pointLadder` into `board.meta`; having it in the round's style config is no longer
  enough. The plan's T2.1-L5 acknowledged `withPointValueLabels` stays grid-shaped but did
  not surface this new obligation on style authors. **T2.3 style authors need to know
  this.**

### 3. `intents.test.ts` has a hard-coded Intent-union enumeration the plan did not name (HARD BREAK)

- **Plan said**: item 13 — add `styleState: {}` plus `applyIntent` cases.
- **Reality**: lines 197-200 hold `const EXPECTED: Array<Intent['type']> = [...]` checked
  against `Object.keys(INTENT_TOUCHED_KEYS)`. Adding two intents failed it at runtime:
  `AssertionError: every Intent type has a touched-keys row`.
- **Fix**: added `'setStyleState'` and `'advanceRound'` to `EXPECTED`. This is a good guard
  working as designed — it is the only check that `INTENT_TOUCHED_KEYS` has not silently
  drifted from the union — so it was updated, not removed.

### 4. Plan self-contradiction: item 18 does not cover what AC#4 and the Risks table require

- **Item 18** specifies only a `setStyleState` batch — an intent touching **one** key.
- **The Risks table** says of that same item 18: "exercises exactly this shape: one intent
  touching **two** keys in one batch, undone in one call". **AC#4** requires proving
  "`advanceRound` … L2a's batch-union undo correctly reverses both. (Items 4, 18.)"
- **Resolution**: implemented BOTH. Block (f) is item 18 verbatim; block (g) adds the
  `advanceRound` two-key undo that AC#4 and the Risks table actually require. Without (g),
  AC#4 would have been vacuously green — `advanceRound`'s two-key `INTENT_TOUCHED_KEYS`
  row is the single genuinely novel mechanism in this tier and the one the plan itself
  flags as the highest correctness risk.

### 5. Plan self-contradiction: `session.test.ts` is both UNCHANGED and required to assert

- **Touchpoints** marks `src/engine/session.test.ts` UNCHANGED, and no checklist item
  touches it.
- **The Test Plan** row for `session.test.ts` says it proves "`createSession`'s output
  includes `styleState: {}`", and the TDD stub list contains
  `test("createSession's returned SessionState includes styleState: {}")`. **AC#6** requires
  "`createSession` initializes `styleState: {}`".
- **Resolution**: added one line —
  `assert.deepEqual(session.styleState, {}, 'and an empty style-state bag')` — in the
  existing "initial session shape" block. Without it AC#6 is proven only by tsc, which
  establishes the field EXISTS, not that it is `{}`. That would have been a vacuous green.

### 6. Defect D5's stated baseline is off by one

Covered in full under Test Gate Outcomes. Plan says unreachable 11 → 10; the true figure is
**12 → 11**. Fallbacks 6 → 7 is correct as stated.

### Implementation-detail deviation (within blast radius)

Item 11 specifies the literal expression
`Array.isArray(hostBoard.meta?.pointLadder) ? (hostBoard.meta.pointLadder as number[]) : []`.
Implemented as a named local instead:

```ts
const rawPointLadder = hostBoard.meta?.['pointLadder']
const pointLadder = Array.isArray(rawPointLadder) ? (rawPointLadder as number[]) : []
```

Semantically identical, avoids relying on TS narrowing an optional chain across two separate
expressions, and matches the codebase's existing bracket-access convention for
`Record<string, unknown>` (`cell.meta?.['points']`). The plan's instruction to keep the
local named `pointLadder` for a minimal diff at the `withPointValueLabels` call site is
honoured.

## Test Infra Gaps Found

1. **No repo-wide guard that every `StylePlugin` implementation is exercised through the
   real contract.** `broadcast.test.ts`'s `fixtureStyle` implements `buildBoard` with two
   parameters and still type-checks (TypeScript accepts fewer parameters than the interface
   declares). The signature change therefore did NOT surface at that fixture — only its
   runtime consequence did, and only because an unrelated assertion happened to cover it.
2. **No mechanical enumeration guard for `INTENT_EVENT_NAMES`.** `INTENT_TOUCHED_KEYS` has
   one (`intents.test.ts` `EXPECTED`) and it caught a real omission this session.
   `INTENT_EVENT_NAMES` relies on `Record<Intent['type'], …>` alone, which proves
   completeness but not intent — a wrong-but-valid event name is invisible.
3. **No test asserts `withPointValueLabels`'s input contract.** A style publishing no
   `board.meta.pointLadder` silently yields blank audience labels rather than failing loudly
   — the exact "silently-empty board" failure mode `session.ts`'s error handling is designed
   to prevent elsewhere.

## Closeout Packet

- **Selected plan**: `process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_PLAN_24-08-26.md`
- **Finished**: all 18 checklist items; ACs 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14.
- **Verified**: every Fully-Automated gate, run end to end, exit 0.
- **Still unverified**: AC#5's Hybrid row — the `INTENT_EVENT_NAMES` diff review requires an
  explicit human reviewer confirmation per the plan's own Phase Completion Rules. The
  numbers are computed and corrected above; the judgment call ("is `setStyleState →
  phase.changed` an acceptable 7th fallback?") is not the agent's to make.
- **Follow-up plan stubs created**: none (no new plan files written this session).
- **CONTEXT_PARTIAL**: none.
- **Best next state**: `Keep in active/testing` — CODE DONE and gate-green, but not VERIFIED
  until the Hybrid reviewer confirmation lands. Archival should wait for that plus the EVL
  confirmation run.

## Residual Risks (carried forward, not closed)

1. **`advanceRound` has no upper bound.** `state.roundIndex + 1` can exceed
   `config.program.rounds.length - 1`, after which `currentRound()` throws inside
   `broadcastState` — i.e. the show goes down on the next broadcast, not at the intent. Not
   reachable in T2.1 (no live dispatch site exists), but **T2.2 must bound it** before
   wiring a real "next round" host action. The plan did not raise this.
2. **`setStyleState` adopts the caller's object by reference.** `applyIntent` assigns
   `intent.nextStyleState` directly, and `applyIntentsWithLog` shallow-copies intents into
   the log, so `event.payload.intents[0].nextStyleState` is the same object as
   `state.styleState`. A caller that retains and later mutates that object rewrites live
   state AND the audit record. Same class as the existing `custom` intent's `payload`
   handling. Now documented by an assertion + comment in `intents.test.ts` so any future
   defensive-clone change is deliberate. Emitters must hand over freshly-built objects.
3. **`styleState`'s unredacted-broadcast risk (R3) remains a discipline requirement, not a
   structural guarantee.** No automated scan for answer-derived text. The interface doc
   comment carries the warning naming the hangman trap. Recommended path unchanged from the
   plan's Open Item 2: a value-based sentinel scan in `broadcast.test.ts` once T2.3's first
   style actually writes to `styleState`.
4. **New undocumented style-author obligation** from Plan Deviation #2: publish
   `pointLadder` into `board.meta` or audience labels go blank. Should be captured in
   `CUSTOMIZATION.md` / `ARCHITECTURE.md` at UPDATE PROCESS.
5. **`BroadcastPayload` still does not carry `styleState`** — deliberate per the plan's
   Public Contracts. The JSON-safety property is proven on `SessionState` itself.
6. Plan Open Items 1 (`attemptsUsed`/`streak`/`lifelinesUsed` write paths), 3 (Defect D1),
   4 (no live dispatch) carry forward unchanged.

## Forward Preview

### Test Infra Found
Plain `tsx` + `node:assert/strict`, aggregated by `scripts/run-tests.mjs`. No framework. All
12 files run in ONE process in sorted order, sharing the plugin registry — test files must
register unique style keys or the registry throws. Three test files register a style:
`bootstrap.ts` (`grid`), `broadcast.test.ts` (`fixture-grid`),
`validateConfigPlugins.test.ts` (its own key).

### Blast Radius Changes
13 files modified, 0 added, 0 deleted:
`src/registry/index.ts`, `src/engine/{intents,log,session,broadcast}.ts`,
`src/styles/grid.ts`, and tests
`src/engine/{broadcast,intents,log,session,host-manual-round}.test.ts`,
`src/scoring/flat.test.ts`, `src/styles/grid.test.ts`.
Plan predicted 11 (10 + 1 verify-only); actual 13 — the two extras are Plan Deviations #1
and #5. `src/config/types.ts` untouched.

### Commands to Stay Green
`rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`

### Dependency Changes
None. `package.json` and `package-lock.json` are byte-identical to `8d0f118`.
