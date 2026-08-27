---
phase: gameshow-engine-t2.2
date: 2026-08-27
status: COMPLETE
feature: general
plan: process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_PLAN_27-08-26.md
---

# T2.2 — Multi-Round Shows: EXECUTE REPORT

## TL;DR

All 23 checklist items implemented. All four gates green from a clean `dist/`.
12 files modified, 0 created, 0 deleted — exactly the Touchpoints list.
`src/config/types.ts` and `src/registry/index.ts` untouched (verified by empty
`git diff --stat`). `demo-t1.ts` round 2 proven reachable by driving the REAL
server end to end, not by unit assertions alone. **Four plan defects found and
fixed** (one of which broke a shipped test); details below.

VALIDATE was skipped for this phase by user direction (T2.1 precedent). This
plan had no adversarial review before EXECUTE.

## What Was Done

All 23 items, in the plan's recommended dependency order (A, B, H, C, D, E, F,
G, I) — with item 19 pulled forward into the same file-write as items 16-18
(same file, its only dependency being Section B, already landed).

| Section | Items | File(s) | Status |
|---|---|---|---|
| A — phase machine | 1 | `src/engine/phase.ts` | DONE — `reveal -> roundIntro` added, one row changed |
| B — intent bound | 2 | `src/engine/intents.ts` | DONE — layer-B no-op bound |
| C — round-boundary orchestration | 3, 4, 5 | `src/engine/session.ts` | DONE — `advanceToNextRound` + `AdvanceRoundInput` |
| D — command wiring | 6, 7 | `src/server.ts` | DONE — `advanceRound`, `continue`; `endRound`/`next` unchanged |
| E — host controller | 8-12 | `src/host/main.ts` | DONE — Next Round / End Show split, tie buttons, Continue, `final` render |
| F — stage view | 13 | `src/stage/main.ts` | DONE — `final` render |
| G — preset docs | 14 | `presets/demo-t1.ts` | DONE — comment only; exported config byte-identical |
| H — existing test updates | 15-18 | `phase.test.ts`, `intents.test.ts` | DONE (+ an unplanned `log.test.ts` fix — see Deviations) |
| I — new regression tests | 19-23 | `intents/session/log/host-manual-round.test.ts` | DONE |

Undo atomicity (the phase's critical property) is proven three ways: a 5-intent
batch in `log.test.ts` case (h); a dispatched-and-undone boundary in
`session.test.ts`; and a LIVE `undo` press through the real HTTP server that
reversed elimination + score reset + round advance + phase in one press.

## What Was Skipped or Deferred

Nothing in the checklist was skipped. Out-of-scope items stayed out: no new
style plugin, no scoring engine, no lifelines/special tiles, no grid
`selection` fix, no input plugins, no `types.ts`/`registry/index.ts` edits, no
round-1 `intro` wiring (plan Open Item 1 / T2.2-L9), no `program.finale.*`
branching (Open Item 3).

## Test Gate Outcomes

Command: `rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`
Result: **exit 0**, run twice (mid-execution and final).

```
tsc --noEmit                                        -> clean
12 test file(s) passed in 0.1s                      -> all PASS
stage/host isolation: 1 stage file(s), no host imports
vite build: 5 assets, built in 40ms
```

Per-file (`npx tsx <file>` each exits 0): `phase.test.ts`, `intents.test.ts`,
`session.test.ts`, `log.test.ts`, `host-manual-round.test.ts`.

Hard-constraint gates:
- `git diff --stat src/config/types.ts src/registry/index.ts` -> **empty**.
- `git diff --stat` -> exactly the 12 Touchpoints files, 898 insertions / 86 deletions.
- `grep -n "'advanceRound'\|'continue'" src/server.ts src/host/main.ts` -> all four
  command-name literals match across the wire boundary (the plan's Test/QA
  Advocate risk).

Red-first confirmation (Mode A) was run for the load-bearing bound: with the
item-2 guard commented out, `intents.test.ts` fails
`advanceRound no-ops at the last round ... 1 !== 0`; restored, it passes.

### Agent-Probe gate — CLOSED, not deferred

The plan named `server.ts`'s command routing as the one un-automated layer
(Open Item 4), to be covered by a human browser click-through. Instead it was
driven programmatically against the REAL server over real HTTP, twice:

**Drive 1 — `demo-t1.ts`, full show.** Booted `src/server.ts presets/demo-t1.ts`,
read state off `/events/host`, POSTed to `/command`. Confirmed:
- round 1 board = `space-*/words-*/music-*` (9 tiles);
- one `advanceRound` -> `roundIndex` 1, `phase` `roundIntro`, log grew by
  exactly 1 (ONE host action);
- **round 2's board genuinely rebuilt**: `history-*/nature-*/numbers-*`, zero
  question ids shared with round 1, all 9 pickable (round 1 consumption did not
  leak), point ladder `[200,400,600]`;
- round 2's `overrides` live: `questionSec` 20 (not 30), a 200-point tile
  awarded 400 (x2 multiplier);
- `advanceRound` on the LAST round **rejected** with
  `round "r2" is the last round; call "endRound"`, and `roundIndex`/`phase`
  unmoved by the rejection;
- `endRound` -> `final`, `roundIndex` still 1;
- the logged boundary event carries the whole batch with a 3-key undo snapshot.
- Final scores: Red 9000 (= round 1 `100+200+300` x3 categories + round 2
  `(200+400+600)` x3 x2), Blue 0, Green 0.

**Drive 2 — scratch preset (`eliminateLowest` + `intermissionAfter` +
`carryScores:false`)**, covering the branches `demo-t1` cannot reach:
- blind `advanceRound` on a tie **rejected**, naming both tied teams;
- `eliminateTeamId` pointing at a team OUTSIDE the tie set **rejected**;
- `advanceRound` with a valid tied id -> ONE log event carrying
  `[eliminate, awardPoints, advanceRound, setPhase]` and a 4-key undo snapshot
  (`phase, roundIndex, styleState, teams`);
- **ONE live `undo` press** rewound the round, the phase, the elimination AND
  the score reset together;
- `continue` from `intermission` -> `roundIntro` (not straight to board);
  `continue` from `roundIntro` -> `board`; neither advanced the round again;
- `continue` from `board` **rejected** by name.

The scratch preset lives in the session scratchpad, not the repo (`git status`
shows 0 untracked files).

**Still open (honest residual):** the host/stage DOM rendering itself
(tie-button markup, the `final` banner, the Continue control) has no automated
coverage — this project has no DOM test harness. Every command those controls
send is live-verified above, and the render branches are straight-line
conditionals reviewed by eye. The plan's Phase Completion Rules require a human
browser click-through for VERIFIED status; that human gate is NOT claimed here.

## Plan Deviations

Four defects in the plan, all within blast radius, all fixed and disclosed.

### D1 (breaking) — `log.test.ts` case (g) also breaks under the new bound; the plan missed it

Plan Section H foresaw exactly this breakage class for `intents.test.ts` and
enumerated both affected blocks (items 17-18), but never checked `log.test.ts`.
Case (g) parks `roundIndex: 2` against that file's single-round `CONFIG` and
asserts the advance lands on 3. With item 2's bound it no-ops: `2 !== 3`,
`npx tsx src/engine/log.test.ts` fails. Item 21 makes the wrong claim
explicitly — its 2-round override is "scoped to this one test block, no other
block's fixture changes."

**Fix:** hoisted a shared `MULTI_ROUND_CONFIG` (4 rounds) next to `CONFIG` and
gave case (g) that config; case (h) reuses it instead of declaring a
near-duplicate two lines away. No assertion weakened — case (g) still asserts
`roundIndex` 2 -> 3 and both keys rewinding in one undo.

### D2 (breaking) — item 22's availability assertion is round-1-specific

The existing loop asserts `available.length === TOTAL_CELLS - state.consumed.size`.
`advanceRound` clears `styleState` but NOT `consumed`, so in round 2
`state.consumed.size` is already 4 while round 2's board has 4 available cells:
`4 === 4 - 4` fails. The plan's Risks section caught the sibling `guard`-scope
issue but not this one.

**Fix:** `playRound` measures consumption against its OWN board's cells
(`consumedHere`). Same assertion strength (exact equality, still proves
availability tracks consumption), correctly generalised per round.

### D3 (breaking, latent) — item 22's round-2 content spec silently widens round 1

"a distinct `id`/`bankId`-category set" is ambiguous. Implemented as extra
categories in the existing `bank`, round 1 silently grows from a 2x2 to a 2x4
board — `gridStyle.buildBoard` iterates `options.categories.length`, not
`options.columns`, and `ROUND` sets no `categoryIds` so it resolves the WHOLE
bank. That changes what this file has always tested.

**Fix:** round 2's content lives in its own `bank2`. Round 1's board is
byte-identical to before.

### D4 (unspecified) — item 22 invalidates an exact existing assertion without saying what replaces it

`hostActions === 1 + TOTAL_CELLS * 4` is an exact assertion the two-round
rewrite necessarily changes; the plan never states the new value.

**Fix:** restructured `playRound` to stop in `reveal` on the last tile and hand
the boundary decision to the caller, then asserted an explicit derived formula
(`1 + PER_ROUND + 1 + PER_ROUND`, `PER_ROUND = cells*3 + (cells-1) + 1`).
Still an exact equality, now self-documenting.

### Strengthening (not a defect) — item 19's second assertion is vacuous as written

`assert.deepEqual(after.styleState, before.styleState)` on the default fixture
compares `{}` to the SAME `{}` reference — it would pass even if a rejected
advance cleared a populated bag. Added a second block with a populated
`styleState` so "a rejected advance does not clear styleState" is actually
proven.

### Observation (implemented verbatim, flagged for product review)

T2.2-L4 / item 5 resets the score of the team eliminated in the SAME batch:
`carryScores: false` iterates `state.teams`, including the team this batch is
eliminating, so its final score is zeroed and the finale scoreboard shows it at
0. This is exactly what the plan specifies and was implemented verbatim — but
whether an eliminated team should keep its score for the podium is a product
question the plan never raises. Confirmed live in Drive 2. Recommend a decision
before a real elimination show ships.

### Cosmetic plan inconsistency

Item 20 lists 13 scenario bullets; the Test Plan table calls it "12 scenarios";
the TDD stub list has 13 `advanceToNextRound` stubs. No impact — the
implemented matrix covers all 13 plus five extra cases (already-eliminated
teams excluded from candidates; `intro.enabled:false`; `minTeams: 0`;
zero remaining teams; unknown `eliminateTeamId`).

## Test Infra Gaps Found

- **No DOM test harness.** `src/host/main.ts` and `src/stage/main.ts` render
  branches cannot be asserted; only their command-name strings and payload
  shapes are checkable statically. Confirms plan Open Item 4's shape but the
  gap is the CLIENT, not `server.ts` (which is now live-driven).
- **`presets/` invisible to `npm test`** (plan Open Item 5) — confirmed
  unchanged. `scripts/run-tests.mjs`'s `collectTests` walks `src/` only. Item
  23's preset check therefore lives in `src/engine/host-manual-round.test.ts`.
- **`SIGTERM` to an `npx tsx` wrapper does not kill the inner node process.**
  Both probe servers survived their parent's termination and had to be killed
  by PID. Worth knowing for any future scripted server drive.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_PLAN_27-08-26.md`
- **Finished:** all 23 checklist items; all four gates green from clean `dist/`;
  both hard-constraint diff checks empty/exact.
- **Verified:** every Fully-Automated row in Verification Evidence; plus the
  Agent-Probe row closed programmatically at the command layer (both drives).
- **Still unverified:** host/stage DOM rendering in a real browser (the plan's
  human click-through gate). No DOM harness exists to automate it.
- **Cleanup remaining:** UPDATE PROCESS — archive the plan, reconcile
  `process/context/` (T2.2 capability row, the five invariants note, the new
  `advanceToNextRound` public surface, the two new wire commands), and record
  the observation above about eliminated-team score reset.
- **Best next state:** `Keep in active/testing` — the human browser
  click-through named in this plan's own Phase Completion Rules has not been
  performed, so VERIFIED is not claimable. CODE DONE is fully satisfied.

## Forward Preview

### Test Infra Found
Plain `tsx` + `node:assert/strict`, aggregated by `scripts/run-tests.mjs`
(`src/**/*.test.ts`, one shared process, sorted order, shared plugin registry).
No framework, no DOM harness, no `presets/` discovery. Live server drives are
practical and cheap: boot `src/server.ts` with a `PORT` env var, scrape the
host token from stdout, read one frame off `/events/host`, POST `/command`.

### Blast Radius Changes
`src/engine/session.ts` gains a second exported decision function
(`advanceToNextRound`) alongside `resolveAnswer` — both return `Intent[]` for
ONE `dispatchHostAction`. `src/server.ts`'s `intentsForCommand` now has 10
cases. `src/host/main.ts` grew two payload-derived local types. Nothing else
changed shape.

### Commands to Stay Green
```
rm -rf dist && npm run typecheck && npm test \
  && node scripts/check-stage-host-isolation.mjs && npm run build
```

### Dependency Changes
None. `package.json` untouched, zero new runtime dependencies.
