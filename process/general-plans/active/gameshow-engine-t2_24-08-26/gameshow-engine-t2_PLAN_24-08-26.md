---
name: plan:gameshow-engine-t2.1
description: "PLAN — T2.1: StylePlugin/Intent/SessionState contract revision (styleState slot, state-aware buildBoard, mid-turn writes, roundIndex advance). Contract + plumbing only — no new styles, no round orchestration."
date: 24-08-26
feature: general
---

# PLAN — Game Show Engine T2.1 (Contract Revision)

**Date**: 24-08-26
**Status**: PLAN written, pending VALIDATE — not yet executed
**Complexity**: COMPLEX

## TL;DR

Add exactly 3 fields/members to `src/registry/index.ts` (`SessionState.styleState`,
two new `Intent` variants, `StylePlugin.buildBoard`'s third `state` param) plus
their plumbing in `intents.ts`/`log.ts`/`session.ts`/`broadcast.ts`/`grid.ts`.
This unblocks all five remaining T2.3 styles and closes Defects D3/D4/D5-mixed.
Zero edits to `src/config/types.ts`. Zero new styles, zero round-boundary
orchestration — that is T2.2/T2.3. Five existing test files need one field
added (`styleState: {}`) to keep compiling; two new regression tests are
required (SSE round-trip serialization, undo-reverses-a-setStyleState-batch).

---

## Overview

T1 shipped one style (`grid`), one scoring engine (`flat`), one round. T2's
Capability Inventory ranks the `StylePlugin`/`Intent`/`SessionState` contract
gap as the hard prerequisite for everything else in T2 — nothing in T2.2
(multi-round orchestration) or T2.3 (five remaining styles) can be built
cleanly against the T1 contract as it stands today. This plan is that
prerequisite: a coherent, minimal revision of three interfaces in
`src/registry/index.ts`, chosen and rejected-alternatives-documented in
`gameshow-engine-t2_INNOVATE_24-08-26.md` (Decisions D1–D4).

This plan does **not** build any of the five remaining styles, does not wire
multi-round orchestration, and does not fix grid's `selection` bug (Defect
D1 — that is T2.3 per the SPEC's own Capability Inventory). It fixes exactly
two defects that are direct consequences of the contract shape itself:
Defect D3 (the unconditional `round.style as GridStyle` cast in
`broadcast.ts`) and Defect D5 (the `GameEventName` fallback/unreachable
count, reported honestly as a mixed outcome, not a net win).

## Goals

1. Give every future style plugin a persistent, opaque, undo-aware state bag
   (`SessionState.styleState`) without touching `src/config/types.ts`.
2. Give `StylePlugin.buildBoard` visibility into `SessionState` so future
   styles can derive per-cell data without the `broadcast.ts`-side workaround
   T1 needed for `consumed`.
3. Give style plugins a real, undo-safe mid-turn write path
   (`setStyleState` Intent) instead of the undo-blind `custom` Intent.
4. Give the engine a real `roundIndex`-advance path (`advanceRound` Intent),
   proven mechanically, not yet wired into any live host-triggered flow.
5. Retire `broadcast.ts`'s unconditional `GridStyle` cast (Defect D3) as a
   direct consequence of Goal 2's `buildBoard` signature change.
6. Keep every T1 guarantee intact: all 12 existing test files pass, `grid` +
   `flat` behave identically for a T1-shaped show, L2a batch-undo still
   works, all four invariants still hold.

## Scope

**In scope (T2.1):**
- The 3 named contract edits in `src/registry/index.ts` (see Exact Contract
  Edits below) and their plumbing in `intents.ts`, `log.ts`, `session.ts`,
  `broadcast.ts`, `grid.ts`.
- Updating the 5 existing test files that hand-build `SessionState` literals.
- Two new regression tests (SSE round-trip serialization of `styleState`;
  undo reverses a `setStyleState` batch in one call).
- Defect D3 fix (retire the `GridStyle` cast in `broadcast.ts`).
- Defect D5 accounting (both new event-name mappings), reported honestly.

**Explicitly OUT of scope (read this before touching anything else):**
- **No new style plugin.** `list`, `trivia`, `wheel`, `tictac`, `hangman` are
  not built here — that is T2.3.
- **No round-boundary orchestration.** `Round.carryScores`, `Round.intro`,
  `Round.intermissionAfter`, `Round.eliminateLowest`, and any code path that
  actually *dispatches* `advanceRound` from a host action, are T2.2 scope.
  T2.1 proves `advanceRound`/`setStyleState` work correctly as generic
  mechanisms via direct tests — it does not wire either into a live
  host-triggered flow.
- **No grid `selection` fix (Defect D1).** Per the T2 SPEC's Capability
  Inventory, D1 is explicitly assigned to T2.3, not T2.1. Do not add a
  `warnOnce` helper, do not touch `grid.ts`'s `availableQuestions`, and do
  not touch `flat.ts` in this plan's EXECUTE pass — even though INNOVATE
  already decided the *approach* for when T2.3 implements it (see
  `gameshow-engine-t2_INNOVATE_24-08-26.md`, Defect D1).
- **No scoring engine work** (`speedWeighted`, `multiplier`, `comeback`,
  streak write path) — T2.4.
- **No lifeline/special-tile call sites** — T2.5.
- **No `attemptsUsed` write path.** D7 only rules out List's `strikesAllowed`
  as the mechanism; the write path itself stays open (Open Items below).

If EXECUTE finds itself editing `flat.ts`, `grid.ts`'s `availableQuestions`,
any file under `src/config/`, or anything that dispatches `advanceRound` from
a live host action, that is scope drift — stop and flag it.

---

## Design Locks (read before the checklist)

| Lock | Decision |
|---|---|
| **T2.1-L1 — `styleState` shape and reset discipline** | `SessionState.styleState: Record<string, unknown>`, JSON-safe values only (plain arrays/objects, never `Set`/`Map`). Reset to `{}` by `advanceRound` as an engine-level safety net. Individual styles are expected to reset their own sub-keys at `onSelect` for per-question granularity — T2.1 does not implement any style doing this (no style needs it yet), it only makes the mechanism available. See INNOVATE Decision D1. |
| **T2.1-L2 — `styleState` broadcasts unredacted** | `broadcastState` (T1's L9/L17 single redaction call site) passes `styleState` through unchanged to every channel, `stage`/`player` included — same discipline class as `consumed`. This is intentional (per-style presentation data the audience is meant to see) but creates a documented, non-structural risk: a style must never store answer-derived text in it. `SessionState.styleState`'s interface comment (item 1 below) carries this warning explicitly, naming the Hangman masked-label trap. See INNOVATE Risk R3. |
| **T2.1-L3 — `buildBoard`'s third parameter is unused by `grid` in T2.1** | `grid.ts`'s `buildBoard` gains a `_state: SessionState` parameter (underscore-prefixed, matching the file's existing convention for `onResolved`'s unused params) purely for interface compliance. Grid does not need per-cell derived data in T2.1 — this is a capability T2.3 styles will use, not one T2.1 exercises. `isRoundComplete` needs no signature change (already receives `state`; unaffected). |
| **T2.1-L4 — `advanceRound`/`setStyleState` are proven mechanically, not wired live** | Both new `Intent` variants are tested by dispatching them directly through `applyIntent`/`applyIntentsWithLog`/`dispatchHostAction` in test code — never by an actual host-action call site in `session.ts` or `server.ts`. Wiring `advanceRound` into a real round-complete flow is T2.2. See Scope, Out of scope. |
| **T2.1-L5 — Defect D3's fix retires the cast without a replacement cast on `StyleConfig`** | `broadcast.ts`'s `const gridConfig = round.style as GridStyle` is deleted entirely. The options spread becomes `{ ...round.style, categories }` (type-checks against `StylePlugin`'s default `O = Record<string, unknown>` with no cast — `resolve<StylePlugin>('style', ...)` is called without a type parameter, same as today). The `pointLadder` read becomes a runtime-checked narrow off `hostBoard.meta` (`Array.isArray(...) ? ... as number[] : []`), not a blind assertion — `board.meta` is declared `Record<string, unknown>` by design (`registry/index.ts` `BoardModel.meta`), so *some* narrowing is unavoidable when reading a specific key out of it. This narrow stays grid-specific (`withPointValueLabels` keeps assuming a `pointLadder`-shaped `meta`) — generalising board redaction across styles is explicitly T2.3 scope, not fixed here. See INNOVATE Defect D3. |
| **T2.1-L6 — `GameEventName` accounting reported as mixed, not improved** | `advanceRound → 'round.started'` (exact match, previously-unreachable member now reachable: 11→10 unreachable). `setStyleState → 'phase.changed'` (a genuine NEW 7th fallback: 6→7 fallbacks). Both numbers must appear together in the phase report — reporting only the favorable one is a protocol violation of SPEC AC#12. See INNOVATE Defect D5. |
| **T2.1-L7 — Five existing test files gain one field each, no other changes** | `src/engine/broadcast.test.ts`, `src/engine/intents.test.ts`, `src/engine/log.test.ts`, `src/scoring/flat.test.ts`, `src/styles/grid.test.ts` each hand-build one `SessionState` object literal (orchestrator-verified, one site each). Each needs exactly `styleState: {}` added next to its existing `log: []` field — no other change to these files is in scope for T2.1 (e.g. do not add new assertions to `grid.test.ts` about `selection` — that is Defect D1, T2.3). |

---

## Touchpoints

| Path | Change | Depends on |
|---|---|---|
| `src/registry/index.ts` | MODIFIED — `SessionState.styleState` (new field + doc comment), `Intent` union (`setStyleState`, `advanceRound`), `StylePlugin.buildBoard` (3rd param) | — |
| `src/engine/intents.ts` | MODIFIED — `INTENT_TOUCHED_KEYS` gains 2 entries; `applyIntent` gains 2 `case` branches | registry/index.ts |
| `src/engine/intents.test.ts` | MODIFIED — add `styleState: {}` to the hand-built `SessionState` (L7); add `applyIntent` cases for `setStyleState`/`advanceRound` | intents.ts |
| `src/engine/log.ts` | MODIFIED — `INTENT_EVENT_NAMES` gains 2 entries | registry/index.ts |
| `src/engine/log.test.ts` | MODIFIED — add `styleState: {}` (L7); add a case proving `setStyleState` reverses in one `undo()` call | log.ts |
| `src/engine/session.ts` | MODIFIED — `createSession`'s initial `SessionState` literal gains `styleState: {}` | registry/index.ts |
| `src/engine/session.test.ts` | UNCHANGED — does not hand-build a full `SessionState` literal (orchestrator-verified: only 5 files do; `session.test.ts` is not one of them) | — |
| `src/engine/broadcast.ts` | MODIFIED — retire `gridConfig` cast (Defect D3, L5); pass `state` as `buildBoard`'s 3rd arg | registry/index.ts, session.ts, grid.ts |
| `src/engine/broadcast.test.ts` | MODIFIED — add `styleState: {}` (L7); add a round-trip SSE serialization case for `styleState` | broadcast.ts |
| `src/styles/grid.ts` | MODIFIED — `buildBoard` gains 3rd `_state` param (interface compliance only, L3) | registry/index.ts |
| `src/styles/grid.test.ts` | MODIFIED — add `styleState: {}` (L7); update any direct `buildBoard(...)` call sites in the test to pass a 3rd state arg | grid.ts |
| `src/scoring/flat.test.ts` | MODIFIED — add `styleState: {}` (L7) only — `flat.ts` itself is untouched (Defect D1's `warnOnce` retrofit is T2.3, not T2.1) | — |
| `src/engine/host-manual-round.test.ts` | VERIFY ONLY — does not hand-build a full `SessionState` literal (uses `createSession`); confirm it still passes unmodified after `createSession`'s change | session.ts |
| `src/engine/phase.ts`, `src/engine/phase.test.ts` | UNCHANGED — no contract surface touched | — |
| `src/registry/bootstrap.ts`, `bootstrap.test.ts`, `validateConfigPlugins.test.ts` | UNCHANGED — no contract surface touched | — |
| `src/transport/local.ts`, `local.test.ts` | UNCHANGED — no contract surface touched | — |
| `src/config/types.ts` | **UNCHANGED — hard constraint, zero edits** | — |

## Public Contracts

- **`SessionState.styleState: Record<string, unknown>`** (new, required
  field) — every `SessionState` value in the codebase must now include it.
  Any external code (there is none outside this repo yet) constructing a
  `SessionState` literal directly would need updating; internally that is
  `createSession` (session.ts) and the 5 test files in Touchpoints.
- **`Intent` union gains `setStyleState` and `advanceRound`** — both are new,
  additive members of an already-open discriminated union; no existing
  `Intent` variant's shape changes.
- **`StylePlugin.buildBoard(round, options, state)`** — breaking signature
  change for any `StylePlugin` implementation. T1 has exactly one
  implementation (`grid.ts`); it is updated in this plan. Any future
  third-party style plugin must supply this 3rd parameter — this is the
  intended new contract shape, not a temporary compatibility shim.
- **`isRoundComplete(state, board)` is UNCHANGED** — already had `state`
  since T1; no contract break here.
- **`broadcastState`'s payload shape is unchanged** (`BroadcastPayload` gains
  no new field) — `styleState` is not currently added to the broadcast
  payload's typed shape in T2.1 (no style needs to read it client-side yet);
  it exists on `SessionState` and is proven to survive JSON round-trip via
  the new serialization test, but is not yet a named field on
  `BroadcastPayload`. Wiring it into the payload's typed surface is a T2.3
  concern once a style actually needs to ship its state to a client.

No public contract in this plan touches auth/identity, billing, schema, or
an externally-reachable API.

## Blast Radius

10 files modified (`src/registry/index.ts`, `src/engine/intents.ts`,
`src/engine/log.ts`, `src/engine/session.ts`, `src/engine/broadcast.ts`,
`src/styles/grid.ts`, plus 5 test files — `broadcast.test.ts`,
`intents.test.ts`, `log.test.ts`, `flat.test.ts`, `grid.test.ts`), 1 file
verified-unchanged (`host-manual-round.test.ts`), 0 new files, 0 files under
`src/config/`. Risk class: none of auth/identity, billing/credits,
schema/migration, or public external API — this is a pure engine-contract
extension inside an already-settled local-LAN application. Highest actual
risk is correctness of the L2a batch-undo union when `styleState` is one of
2 keys touched by a single batch (`advanceRound` touches both `roundIndex`
and `styleState`) — covered by a dedicated test (see Test Plan). Second risk
is the JSON-safety documentation-only guarantee on `styleState` (R2/R3 in
INNOVATE) — covered by the round-trip serialization test, which is a
regression guard against the mechanism breaking, not a guarantee against a
future style author violating the discipline requirement.

---

## Four Invariants — how T2.1 preserves each

| # | Invariant | How T2.1 preserves it | Where |
|---|---|---|---|
| 1 | Stage stays playable with zero players connected | No input plugin surface touched; `styleState` is presentation data flowing through the same unchanged SSE path. | Structural — no touchpoint in this plan affects the input/transport layer |
| 2 | Content snapshotted at launch | `createSession`'s `structuredClone(config)` call is untouched; only the literal's field list gains `styleState: {}`. | `session.ts`, re-proven by `session.test.ts` (unmodified, still passes) |
| 3 | Scoring plugins are pure | `flat.ts` is not touched by this plan at all. | Unaffected — `flat.test.ts` gains only the `styleState: {}` literal field |
| 4 | Answers redacted at the transport boundary | `broadcastState` remains the sole `handle.broadcast(...)` call site; `styleState` flows through unchanged (T2.1-L2, documented risk, not a redaction regression — `styleState` carries no answer text in T2.1 because no style writes to it yet). | `broadcast.ts`, re-proven by `broadcast.test.ts`'s existing redaction assertions plus the new round-trip case |

---

## Implementation Checklist

### Section A — Contract edits (`src/registry/index.ts`)

1. In `SessionState` (current lines 28–44), add a new field
   `readonly styleState: Record<string, unknown>` with a doc comment
   covering: (a) opaque/per-style-owned, undo-aware via `INTENT_TOUCHED_KEYS`;
   (b) MUST hold only JSON-safe values (plain arrays/objects, never
   `Set`/`Map`) because it is serialised into the SSE payload with no
   Set→array conversion, unlike `consumed`/`lockedOutTeamIds`; (c) a
   SECURITY/REDACTION warning that it broadcasts UNREDACTED to `stage`/
   `player` and must never carry answer-derived text, naming the Hangman
   masked-label trap as the realistic failure case; (d) reset semantics
   (`advanceRound` resets it to `{}`; individual styles are expected to
   reset their own sub-keys at `onSelect`, not implemented by any style in
   this plan).
2. In the `Intent` union (current lines 76–88), add
   `{ type: 'setStyleState'; nextStyleState: Record<string, unknown> }` and
   `{ type: 'advanceRound' }` as new members, following the existing
   variants' style (no `readonly` field modifiers, matching e.g.
   `awardPoints`).
3. In `StylePlugin<O>` (current line 97), change `buildBoard(round: Round,
   options: O): BoardModel` to `buildBoard(round: Round, options: O, state:
   SessionState): BoardModel`. Do not change `isRoundComplete`'s signature
   (line 105) — it already takes `state`.

### Section B — Intent application plumbing (`src/engine/intents.ts`)

4. In `INTENT_TOUCHED_KEYS` (current lines 33–49), add
   `setStyleState: ['styleState']` and
   `advanceRound: ['roundIndex', 'styleState']`.
5. In `applyIntent`'s `switch` (current lines 107–167), add two `case`
   branches before the `default: return assertNever(intent)` line:
   - `case 'setStyleState': return { ...state, styleState:
     intent.nextStyleState }`
   - `case 'advanceRound': return { ...state, roundIndex: state.roundIndex +
     1, styleState: {} }`
   TypeScript's exhaustiveness check via `assertNever` will fail to compile
   until both cases exist — treat that compile error as the correctness
   signal it's designed to be, do not silence it.

### Section C — Event name mapping (`src/engine/log.ts`)

6. In `INTENT_EVENT_NAMES` (current lines 30–43), add:
   - `setStyleState: 'phase.changed', // new fallback (T2.1) — no exact
     GameEventName for opaque style writes`
   - `advanceRound: 'round.started', // exact match (T2.1) — closes one of
     T1's 11 unreachable GameEventName members`
   Do not remove or alter any existing entry — this is purely additive.

### Section D — Session construction (`src/engine/session.ts`)

7. In `createSession` (current lines 103–125), add `styleState: {}` to the
   returned `SessionState` object literal, alongside the existing
   `roundIndex: 0` / `consumed: new Set<string>()` initializers.

### Section E — Style plugin interface compliance (`src/styles/grid.ts`)

8. Update `gridStyle.buildBoard`'s signature (current line 32) from
   `buildBoard(round: Round, options: GridBuildOptions): BoardModel` to
   `buildBoard(round: Round, options: GridBuildOptions, _state:
   SessionState): BoardModel` (T2.1-L3 — underscore-prefixed, unused,
   matching the file's existing `onResolved(_state, _correct)` convention).
   Import `SessionState` from `../registry/index` alongside the existing
   type imports on line 14. No change to the function body.

### Section F — Defect D3 fix (`src/engine/broadcast.ts`)

9. Delete `const gridConfig = round.style as GridStyle` (current line 128)
   and the `GridStyle` type import if it becomes unused after this change
   (check the rest of the file for other `GridStyle` references before
   removing the import — current read shows this is its only use).
10. Change the `buildBoard` call (current line 130) from
    `style.buildBoard(round, { ...gridConfig, categories })` to
    `style.buildBoard(round, { ...round.style, categories }, state)` — three
    arguments now, no cast on the options spread.
11. Change the `pointLadder` read (current line 132) from
    `gridConfig.pointLadder ?? []` to a runtime-checked narrow off
    `hostBoard.meta`: `Array.isArray(hostBoard.meta?.pointLadder) ?
    (hostBoard.meta.pointLadder as number[]) : []` (T2.1-L5 — grid.ts:73
    already writes `pointLadder` into `board.meta`, orchestrator-verified).
    Keep the resulting local variable name `pointLadder` for minimal diff to
    the surrounding `withPointValueLabels(hostBoard, pointLadder)` call.

### Section G — Existing test file updates (5 files, T2.1-L7)

12. `src/engine/broadcast.test.ts`: add `styleState: {}` next to `log: []`
    in the hand-built `SessionState` literal (current line 124).
13. `src/engine/intents.test.ts`: add `styleState: {}` next to `log: []` in
    the hand-built `SessionState` literal (current line 70).
14. `src/engine/log.test.ts`: add `styleState: {}` next to `log: []` in the
    hand-built `SessionState` literal (current line 64).
15. `src/scoring/flat.test.ts`: add `styleState: {}` next to `log: []` in
    the hand-built `SessionState` literal (current line 41).
16. `src/styles/grid.test.ts`: add `styleState: {}` next to `log: []` in the
    `makeState` helper's `SessionState` literal (current line 74). Also grep
    this file for any direct `gridStyle.buildBoard(...)` call and add a 3rd
    argument (a `makeState()`-produced `SessionState`) at each call site —
    `buildBoard`'s new required parameter will fail `tsc` otherwise.

### Section H — New regression tests (T2.1 required, not optional)

17. In `src/engine/broadcast.test.ts`, add a case that: builds a
    `SessionState` (via the file's existing helper) with a non-trivial
    `styleState` value containing a nested array and a nested plain object
    (e.g. `{ revealedSlots: ['a', 'b'], ownership: { c1: 'teamA' } }`), calls
    `broadcastState`, captures the payload argument(s) passed to the mock
    `TransportHandle.broadcast`, and asserts
    `JSON.parse(JSON.stringify(capturedPayload)).???` round-trips
    `styleState`'s shape byte-for-byte (deep-equal) for at least one
    channel's payload. This is the direct regression guard for INNOVATE Risk
    R2 — the `ReadonlySet`-class bug that a naive `Set`/`Map` in
    `styleState` would reintroduce. NOTE: `styleState` is not currently a
    named field on `BroadcastPayload` (see Public Contracts) — if the
    payload's `base` object does not carry `state.styleState` through
    today, extend the test to serialise `state` directly (not the broadcast
    payload) to prove the round-trip property on `SessionState` itself; this
    is acceptable since the test's purpose is proving the JSON-safety
    property holds for `styleState`'s declared value shape, not proving it
    is currently wired into the wire payload (it deliberately is not, in
    T2.1 — see Public Contracts).
18. In `src/engine/log.test.ts`, add a case that: builds a `SessionState`
    with a starting `styleState` value, dispatches a single-intent batch
    `[{ type: 'setStyleState', nextStyleState: { revealed: ['x'] } }]`
    through `applyIntentsWithLog`, asserts the resulting state's
    `styleState` equals the new value, then calls `undo()` and asserts the
    resulting state's `styleState` deep-equals the ORIGINAL pre-batch value
    in exactly one `undo()` call. This is the direct regression guard for
    the PLAN's required "setStyleState batch reverses in one undo" gate.

---

## Test Plan

Framework: none, per `all-tests.md` — plain `tsx` + `node:assert/strict`,
aggregated by `scripts/run-tests.mjs` (T1 Design Lock L11, unchanged in
T2.1).

| Area | Tier | Scenario | Command | Proves |
|---|---|---|---|---|
| `src/registry/index.ts` (no direct test file) | Fully-Automated | Contract compiles; `SessionState`/`Intent`/`StylePlugin` shape changes are structurally sound | `npm run typecheck` | T2 SPEC AC#1 (contract revision preserves T1 behavior) |
| `src/engine/intents.test.ts` | Fully-Automated | `applyIntent` handles `setStyleState` (replaces `styleState`, leaves other keys reference-identical) and `advanceRound` (increments `roundIndex`, resets `styleState` to `{}`) | `npx tsx src/engine/intents.test.ts` | T2.1 Design Lock T2.1-L1/L4; item 5 |
| `src/engine/log.test.ts` | Fully-Automated | Undo reverses a `setStyleState` batch in one call (new case, item 18) alongside all existing T1 cases (single/multi-intent batches) | `npx tsx src/engine/log.test.ts` | REQUIRED task item: "a test asserting a setStyleState batch reverses in one undo" |
| `src/engine/broadcast.test.ts` | Fully-Automated | `styleState` survives a JSON round-trip unchanged (new case, item 17); all existing T1 redaction assertions still pass with the new contract shape | `npx tsx src/engine/broadcast.test.ts` | REQUIRED task item: "a test asserting styleState survives a round-trip through the SSE payload serialisation"; T2.1-L2 |
| `src/styles/grid.test.ts` | Fully-Automated | `buildBoard`'s 3rd parameter is accepted; existing board-construction/availability/select/completion assertions unchanged in behavior | `npx tsx src/styles/grid.test.ts` | T2.1-L3; T2 SPEC AC#1 |
| `src/scoring/flat.test.ts` | Fully-Automated | Existing purity/formula assertions unchanged — only the `SessionState` literal grew a field | `npx tsx src/scoring/flat.test.ts` | T2 SPEC AC#1 |
| `src/engine/session.test.ts` | Fully-Automated | `createSession`'s output includes `styleState: {}`; existing `structuredClone` isolation assertion unaffected | `npx tsx src/engine/session.test.ts` | T2.1 item 7; T2 SPEC AC#1 |
| `src/engine/host-manual-round.test.ts` | Fully-Automated | Full T1-shaped host-manual round still completes end to end with the new contract shape (uses `createSession`, not a hand-built literal — should need zero edits) | `npx tsx src/engine/host-manual-round.test.ts` | T2 SPEC AC#1, invariant #2 |
| `src/engine/phase.test.ts`, `src/registry/bootstrap.test.ts`, `src/registry/validateConfigPlugins.test.ts`, `src/transport/local.test.ts` | Fully-Automated | Untouched files, regression-only — must still pass unmodified | `npm test` (full aggregate) | T2 SPEC AC#1 |
| Stage/host import isolation | Fully-Automated | Static grep for forbidden cross-imports — unaffected by this plan | `node scripts/check-stage-host-isolation.mjs` | T2 SPEC AC#11 (invariant #1 structural proof) |
| `npm run typecheck && npm test` | Fully-Automated | Whole-project type safety + full aggregate suite green | `rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build` | T2 SPEC AC#1, AC#13 |
| Defect D3 fix | Fully-Automated | `broadcast.ts` compiles with zero `as GridStyle` occurrences; `grep -n "as GridStyle" src/engine/broadcast.ts` returns no match | `grep -n "as GridStyle" src/engine/broadcast.ts; echo "exit code: $?"` (expect grep exit 1, i.e. no match) | T2 SPEC Capability Inventory, T2.1 Defects Addressed (D3) |
| Defect D5 accounting | Hybrid | Structural diff of `INTENT_EVENT_NAMES` before/after is mechanical; the "is this an acceptable fallback" judgment is a human/reviewer call recorded in the phase report, not a runtime assertion | manual diff review at UPDATE PROCESS, per T2 SPEC AC#12's own strategy tag | T2 SPEC AC#12 |
| `styleState` redaction discipline (R3) | Known-Gap (documented, not silently dropped) | No automated check exists (or is added in T2.1) that scans `styleState`'s contents for answer-derived text — this is a documented discipline requirement enforced by the interface comment and code review only | — | INNOVATE Risk R3; carried forward honestly in Open Items below, kept CONDITIONAL not silently PASS per the vacuous-green ban — see Open Items #2 for the resolution path |

### TDD stubs (Fully-Automated rows — red-first starting point for EXECUTE)

```
test("applyIntent(setStyleState) replaces styleState and leaves all other top-level keys reference-identical", () => { throw new Error("NOT IMPLEMENTED") })
test("applyIntent(advanceRound) increments roundIndex by 1 and resets styleState to {}", () => { throw new Error("NOT IMPLEMENTED") })
test("a single setStyleState host-action batch is fully reversed by exactly one undo() call, restoring the pre-batch styleState value", () => { throw new Error("NOT IMPLEMENTED") })
test("styleState containing nested arrays and plain objects survives JSON.parse(JSON.stringify(...)) unchanged (no Set/Map collapse)", () => { throw new Error("NOT IMPLEMENTED") })
test("createSession's returned SessionState includes styleState: {}", () => { throw new Error("NOT IMPLEMENTED") })
test("gridStyle.buildBoard accepts a third SessionState argument without changing its existing cell-construction output for a fixed round/options pair", () => { throw new Error("NOT IMPLEMENTED") })
test("broadcast.ts contains zero occurrences of 'as GridStyle' after the Defect D3 fix", () => { throw new Error("NOT IMPLEMENTED") })
test("a full T1-shaped host-manual round (host-manual-round.test.ts) still completes end to end after the contract revision, unmodified", () => { throw new Error("NOT IMPLEMENTED") })
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `npm run typecheck` (whole project, new contract shape) | Fully-Automated | T2 SPEC AC#1 |
| `intents.test.ts` — `setStyleState`/`advanceRound` `applyIntent` cases (item 5) | Fully-Automated | T2.1 Design Locks T2.1-L1, T2.1-L4 |
| `log.test.ts` — setStyleState batch reverses in one undo (item 18) | Fully-Automated | REQUIRED task item (undo round-trip); T2 SPEC AC#8 (mechanism half — full style-plugin exercise is T2.3) |
| `broadcast.test.ts` — styleState JSON round-trip (item 17) | Fully-Automated | REQUIRED task item (SSE serialization); INNOVATE Risk R2 |
| `broadcast.test.ts` — existing redaction assertions, unmodified pass | Fully-Automated | T2 SPEC AC#11 (invariant #4) |
| `grid.test.ts` — buildBoard 3-arg call sites | Fully-Automated | T2.1 Design Lock T2.1-L3 |
| `flat.test.ts`, `session.test.ts`, `host-manual-round.test.ts` — unmodified/minimal-diff pass | Fully-Automated | T2 SPEC AC#1 |
| Full aggregate `npm test` (12 existing + updated files) | Fully-Automated | T2 SPEC AC#1, AC#13 |
| `grep "as GridStyle" src/engine/broadcast.ts` — zero matches | Fully-Automated | T2 SPEC Capability Inventory (T2.1 Defects Addressed: D3) |
| `node scripts/check-stage-host-isolation.mjs` | Fully-Automated | T2 SPEC AC#11 (invariant #1 structural) |
| `npm run build` (clean `dist/`) | Fully-Automated | T2 SPEC AC#13 |
| `INTENT_EVENT_NAMES` before/after diff review | Hybrid | T2 SPEC AC#12 |
| `styleState` redaction discipline | Known-Gap (documented) | INNOVATE Risk R3 — kept CONDITIONAL, not silently PASS (see Open Items #2) |

---

## Acceptance Criteria

1. `SessionState` has a `readonly styleState: Record<string, unknown>` field
   with the required interface documentation (opaque/undo-aware, JSON-safety
   requirement, unredacted-broadcast security warning). (Item 1.)
2. `Intent` includes `setStyleState` and `advanceRound` variants;
   `applyIntent` handles both correctly per T2.1-L1/L4. (Items 2, 5.)
3. `StylePlugin.buildBoard` takes a required 3rd `state: SessionState`
   parameter; `gridStyle.buildBoard` complies. (Items 3, 8.)
4. `INTENT_TOUCHED_KEYS` names `styleState` for `setStyleState` and both
   `roundIndex`/`styleState` for `advanceRound` — L2a's batch-union undo
   correctly reverses both. (Items 4, 18.)
5. `INTENT_EVENT_NAMES` maps both new intents, with the accounting reported
   as mixed (T2.1-L6), not spun as improvement. (Item 6.)
6. `createSession` initializes `styleState: {}`. (Item 7.)
7. `broadcast.ts` contains zero `as GridStyle` occurrences; `pointLadder` is
   read via a runtime-checked narrow off `board.meta`, not a blind cast.
   (Items 9–11.)
8. All 5 named existing test files compile and pass with `styleState: {}`
   added to their hand-built `SessionState` literals; no other behavior
   change in those files. (Items 12–16.)
9. `src/engine/session.test.ts` and `src/engine/host-manual-round.test.ts`
   pass unmodified (or with zero-behavior-change diffs) after the contract
   revision.
10. New test: `styleState` containing nested arrays/objects survives a JSON
    round-trip unchanged. (Item 17.)
11. New test: a `setStyleState` host-action batch is fully reversed by
    exactly one `undo()` call. (Item 18.)
12. `rm -rf dist && npm run typecheck && npm test && node
    scripts/check-stage-host-isolation.mjs && npm run build` exits 0 end to
    end.
13. Zero edits exist to `src/config/types.ts` (verify via `git diff --stat
    src/config/types.ts` showing no output).
14. Zero new style plugins, zero round-boundary orchestration wiring, and
    zero grid `selection`/Defect-D1 changes exist in the diff (verify via
    `git diff --stat` showing only the files named in Touchpoints).

## Phase Completion Rules

- This plan is **CODE DONE** when every checklist item (1–18) is implemented
  and each named test file passes in isolation (`npx tsx <file>.test.ts`
  exits 0).
- This plan is **VERIFIED** only after CODE DONE **and** the full gate
  sequence (`rm -rf dist && npm run typecheck && npm test && node
  scripts/check-stage-host-isolation.mjs && npm run build`) passes with this
  plan's code included.
- The `INTENT_EVENT_NAMES` diff review (Hybrid tier) requires an explicit
  human/reviewer confirmation recorded in the phase report before this plan
  is marked VERIFIED — it is not satisfied by an agent's own judgment alone,
  consistent with T1's Phase Completion Rules precedent for Agent-Probe/
  Manual-class rows.
- The `styleState` redaction discipline row stays a documented Known-Gap.
  Per the vacuous-green ban, this Known-Gap does NOT make the plan's overall
  gate PASS-able on its own — the plan's gate is PASS only via the
  Fully-Automated and Hybrid rows above; this row is recorded, not used to
  claim the redaction concern is closed.

## Open Items / Known Limitations (carried forward honestly, not buried)

1. **Defect D2's `attemptsUsed`/`TeamState.streak`/`TeamState.lifelinesUsed`
   write-path gap is NOT closed by this plan.** INNOVATE Decision D7 only
   disambiguates List's strike concept from `attemptsUsed` — it does not add
   a write path for any of the three fields. Carried to T2.4 (streak)/T2.5
   (lifelines)/T2.3 (List's own strike counter, once List exists).
2. **`styleState`'s unredacted-broadcast risk (T2.1-L2/INNOVATE R3) is a
   documented discipline requirement, not a structural guarantee.** No
   automated test scans `styleState`'s contents for answer-derived text in
   this plan. Recommended resolution path for a future pass: a
   `broadcast.test.ts` VALUE-scan case (matching the project's own existing
   redaction-testing precedent from `all-tests.md`'s "test by VALUE, not key
   name" rule) that fails if any sentinel answer string appears anywhere in
   a serialised `styleState` payload — deferred here because no style
   writes to `styleState` yet in T2.1, so there is no real data to scan;
   revisit once T2.3's first style ships.
3. **Defect D1 (grid `selection`) is explicitly out of scope**, per the T2
   SPEC's Capability Inventory assignment to T2.3. INNOVATE already decided
   the approach (`warnOnce` helper + attempt-the-real-fix-first) for when
   T2.3 implements it — see `gameshow-engine-t2_INNOVATE_24-08-26.md`.
4. **`advanceRound`/`setStyleState` are proven mechanically but not wired
   into any live host-triggered code path.** T2.2 must add the actual
   dispatch call site(s) (e.g. a "next round" host action that fires
   `advanceRound` when `style.isRoundComplete()` is true and the host
   confirms).
5. **`BroadcastPayload` does not yet carry `styleState` as a named field.**
   It exists on `SessionState` and is proven JSON-safe by the new
   round-trip test, but no style currently needs to ship it to a client, so
   it is not added to the payload's typed shape in T2.1. T2.3's first style
   that needs client-visible per-style state should add this field then,
   with its own redaction consideration at that time (see Open Item 2).
6. **`GameEventName`'s fallback count now stands at 7 (was 6), unreachable
   count now stands at 10 (was 11).** Both numbers must be carried into the
   T2.1 phase report per T2.1-L6 — reporting only the favorable number is a
   protocol violation of T2 SPEC AC#12.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Dependencies and Sequencing

Section A (contract edits, items 1–3) must land before every other section —
B/C/D/E/F/G/H all consume the new types. Within Section A, items 1–3 have no
ordering dependency on each other (independent interface members) but must
all land together before `tsc` can pass on any downstream file. Section B
(items 4–5) depends only on Section A. Section C (item 6) depends only on
Section A (the two new `Intent['type']` members must exist for
`INTENT_EVENT_NAMES`'s `Record<Intent['type'], GameEventName>` to type-check
with the new keys). Section D (item 7) depends only on Section A. Section E
(item 8) depends only on Section A. Section F (items 9–11) depends on
Section A (buildBoard's new signature) and Section E (grid.ts must already
accept the 3rd parameter before broadcast.ts can pass it). Section G (items
12–16) depends on Section A (styleState must exist as a required field
before any hand-built literal can satisfy the type) and, for item 16
specifically, on Section E (grid.ts's new buildBoard signature). Section H
(items 17–18) depends on Sections A–G being complete, since both new tests
exercise the full plumbing chain (intents → log → session/broadcast).

## Risks

| Risk | Mitigation |
|---|---|
| `styleState` becoming a required field breaks every hand-built `SessionState` literal in the codebase simultaneously — a compile-time cliff, not a gradual migration. | Touchpoints names all 5 affected files explicitly (orchestrator-verified, one site each); this is a known, bounded, mechanical fix, not a discovery task at EXECUTE time. |
| A style author (in T2.3+) stores a `Set`/`Map` in `styleState`, silently breaking on the wire exactly like T1's `consumed`/`lockedOutTeamIds` bug. | Interface doc comment (item 1) states the JSON-safety requirement explicitly; new round-trip test (item 17) is a permanent regression guard proving the mechanism itself is JSON-safe for well-formed input — it cannot prevent a future author from violating the discipline, only prove the plumbing doesn't silently corrupt correct input. |
| A style author (in T2.3+) stores answer-derived text in `styleState`, leaking it to the audience via the unredacted broadcast path. | Interface doc comment (item 1) carries an explicit SECURITY/REDACTION warning naming the realistic trap. Documented as a discipline requirement in Open Items #2, not oversold as solved — kept CONDITIONAL per the vacuous-green ban. |
| `advanceRound`'s two-key touched-set (`roundIndex` + `styleState`) is the first multi-key batch-union case beyond what T1's `resolveAnswer` (3 intents, but each touching only 1 key) exercised — a subtle L2a bug could surface here first. | New dedicated test (item 18) exercises exactly this shape: one intent touching two keys in one batch, undone in one call. |
| Defect D3's fix changes `broadcast.ts`'s hot path (called on every mutation) — a mistake here breaks every broadcast, not just a new feature. | Existing `broadcast.test.ts` redaction assertions must still pass unmodified (Test Plan); the fix is scoped to exactly 3 lines (items 9–11), minimizing surface for a mistake. |

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_PLAN_24-08-26.md`
2. **Last completed phase or step:** PLAN written (this pass). INNOVATE
   persisted separately at
   `process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_INNOVATE_24-08-26.md`
   (transcribed by this same PLAN agent, per that file's provenance note).
3. **Validate-contract status:** pending — see `## Validate Contract`
   placeholder below; VALIDATE has not yet run.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`,
   `gameshow-engine-t2_SPEC_24-08-26.md`, `gameshow-engine-t2_RESEARCH_24-08-26.md`,
   `gameshow-engine_PLAN_24-08-26.md` (T1, for Design Lock precedent and
   format), `CUSTOMIZATION.md`, `ARCHITECTURE.md` §5, `src/registry/index.ts`
   (full read), `src/config/types.ts` (styles §6, round §11, GameEventName
   §14), `src/styles/grid.ts` (full read), `src/engine/{intents,log,session,
   broadcast,phase}.ts` (full reads), `src/scoring/flat.ts` (full read),
   the 5 target test files (grepped for exact line numbers), and the T2
   backlog note `process/general-plans/backlog/gameshow-engine-t2-styleplugin-contract.md`.
5. **Next step for a fresh agent picking up mid-execution:** confirm VALIDATE
   has produced a validate-contract section in this file (or a linked
   artifact) before starting EXECUTE. If VALIDATE has not run, do not begin
   implementing — route to `ENTER VALIDATE MODE` first. If EXECUTE is
   already in progress, check `git diff --stat` against the Touchpoints
   table above to see which sections (A–H) are already applied, and resume
   at the first unmodified file in dependency order (see Dependencies and
   Sequencing).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
