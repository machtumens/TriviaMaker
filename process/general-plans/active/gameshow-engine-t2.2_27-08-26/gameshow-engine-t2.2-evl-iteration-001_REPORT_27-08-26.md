---
name: report:gameshow-engine-t2.2-evl-iteration-001
description: "EVL confirmation run for T2.2 (multi-round shows) — independent re-run of gates, hard constraints, and adversarial atomicity/bound verification"
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: general
  phase: T2.2-EVL
---

# T2.2 — EVL Confirmation Run (Cycle 0, no fix needed)

## TL;DR

**EVL PASSES.** All 4 gates green from clean, all hard constraints held, no
weakened tests, all five invariants intact. 96 independent adversarial
assertions (68 + 25 + 3 via live HTTP/direct-engine drives, all outside the
phase's own test suite) confirm round-boundary atomicity, the bound, tie
handling, minTeams multi-round skip chaining, and real round-2 content
rebuild — zero failures. One vacuous-test defect (item 19) was found by the
execute-agent and independently verified genuinely fixed. Two residuals
confirmed precisely as disclosed: DOM rendering has zero automated coverage
(no harness exists in this repo at all — not a testing gap, a tooling gap),
and `carryScores:false` zeroes an eliminated team's own score in the same
batch (empirically demonstrated, product decision not made here).

## STEP 1 — Gates from clean

`rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build`

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0, clean |
| `npm test` | exit 0, 12/12 test files PASS |
| `node scripts/check-stage-host-isolation.mjs` | exit 0, "1 stage file(s) checked, no host imports" |
| `npm run build` | exit 0, vite build, 5 assets |

All four gates independently re-run and green.

## STEP 2 — Hard constraints vs 06a9725 baseline

| Constraint | Result |
|---|---|
| (a) `git diff 06a9725 HEAD -- src/config/types.ts src/registry/index.ts` | empty — CONFIRMED |
| (b) `package.json`/`package-lock.json` diff | empty — CONFIRMED, no new deps |
| (c) File change count | 13 changed (12 Touchpoints source files + 1 new process report file, which is the expected execute-report artifact, not code) — matches plan exactly |
| (d) No test weakened | CONFIRMED — every touched test file diffed line-by-line against baseline (below) |
| (e) Five invariants | CONFIRMED — `buildBoard` exactly 1 non-test call site (`broadcast.ts:129`); `.broadcast(` only in `broadcast.ts` (non-test); `styleState` absent from `broadcast.ts`/`BroadcastPayload` |

### (d) detail — per-file diff review

- `phase.test.ts`: purely additive (1 new named assertion).
- `intents.test.ts`: additive fixture (`CONFIG_MULTI_ROUND`) + 2 existing blocks updated to supply it (required because the new bound makes the default 1-round config a no-op fixture, not a weakening) + 2 new blocks (bound no-op + the item-19 strengthening). No assertion removed or loosened.
- `log.test.ts`: additive fixture (`MULTI_ROUND_CONFIG`) + new case (h), a 5-intent/7-effect batch with exact-value assertions before AND after one `undo()`. No assertion removed.
- `session.test.ts`: import list extended only; every other change is a new test block with `assert.deepEqual` against literal expected arrays (strong, not tautological).
- `host-manual-round.test.ts`: restructured to 2 rounds. Verified the four defects the execute-agent disclosed (D1–D4) are genuine fixes, not weakenings — in particular the `hostActions` exact-equality formula and the `available.length` formula both remain EXACT equalities, just correctly re-derived for 2 rounds instead of 1 (not turned into a looser bound).

### Item 19 strengthening — independently verified genuine

Old (baseline) assertion pattern would have compared `before.styleState` (default `{}`) to `after.styleState` — since the no-op returns `{...state}` (same object reference for unchanged fields), this passed trivially regardless of correctness. The new block uses a **populated** `styleState: { revealed: ['x'] }` before the rejected advance; a buggy implementation that incorrectly cleared `styleState` on a no-op would produce `{}` ≠ `{revealed:['x']}` and fail. Confirmed by reading the fixture: genuinely fixed, not merely differently worded.

## STEP 3 — Adversarial verification (own scripts, not the phase's own tests)

Three independent scripts, all outside `src/**/*.test.ts`:

1. **Layer-B direct engine call** (bypasses `session.ts`'s `advanceToNextRound` entirely, hand-constructs a state parked OUT OF RANGE) — 3/3 checks pass: no-op at last valid index with `styleState` preserved by reference; roundIndex artificially set 1-past-range does NOT compound (stays put, doesn't become +1 further); two rapid `applyIntent` calls from the last round are both idempotent no-ops.
2. **Live HTTP drive against a purpose-built scratch preset** (5 rounds: `eliminateLowest` + `carryScores:false` + two chained `minTeams:4` skip rounds + a later tie scenario + a last-round bound test) — 68/68 checks pass, including:
   - A single `advanceRound` command produced a 7-intent batch (eliminate + 3×score-reset + 2×`advanceRound` [skipping both `minTeams:4` rounds] + `setPhase`) as **ONE** log event; **ONE** `undo()` reversed all of it (roundIndex, all 3 scores, the elimination, and the phase) together.
   - A genuine 3-way tie (A=B=C=0 after the carryScores reset) rejected a blind `advanceRound`, naming all three teams.
   - An `eliminateTeamId` pointing at an **already-eliminated** team (D, eliminated in round 1) was rejected identically to an unknown id — never silently honoured.
   - A valid tied candidate resolved the tie in ONE action, reversible by ONE undo.
   - On the last round (index 4), `advanceRound` was rejected twice in a row (simulating a rapid double-click) with **identical** resulting state both times — no compounding, no drift.
   - The show correctly reached `final` via `endRound` with `roundIndex` still valid (never overshot).
3. **Live HTTP drive against the real `presets/demo-t1.ts`** — 25/25 checks pass, including:
   - Round 2's board is a **genuinely different** 9-tile set (`history-*`/`nature-*`/`numbers-*`), zero question ids shared with round 1.
   - Round 2's per-round overrides are **live**, not just authored: point ladder `[200,400,600]` (vs round 1's `[100,200,300]`), `questionSec` 20 (vs the default 30), and a 200-point tile marked correct actually banked **400** (the ×2 multiplier applied).
   - Round 1's `styleState` was cleared (empty `{}`) after crossing the boundary — no bleed-through.
   - `roundIndex`/`phase` correctly moved to `1`/`roundIntro` in exactly one host action, with scores untouched (this preset has `carryScores:true`, no elimination).

**All three scripts' servers were confirmed killed by PID (process-group `SIGKILL`, not `SIGTERM` to the `npx tsx` wrapper) — verified via `ss -ltnp` showing both ports free after each run.**

**Total: 96/96 independent adversarial assertions pass. Zero failures.** The original failure mode ("the intent succeeded silently and the NEXT `broadcastState` threw") is structurally closed: `currentRound` (the function that throws on an out-of-range index) is never called with an out-of-range index now, because Layer A (dispatch-time) rejects before any intent is built, and Layer B (apply-time) independently no-ops even if reached directly — confirmed both layers hold on their own, not just in combination.

## STEP 4 — Weak-test scan

Scanned every test block added or modified this phase (all 6 touched test files) for the vacuous pattern (an assertion that would still pass if the named behavior were broken). Found:

- **Item 19 (intents.test.ts)**: the ONE vacuous assertion the execute-agent flagged and fixed — independently confirmed genuinely strengthened (see STEP 2 detail above).
- **No other instance found.** Every other new/modified assertion in `session.test.ts`, `log.test.ts`, `phase.test.ts`, and `host-manual-round.test.ts` either compares against a literal expected value/array (`assert.deepEqual` against a hand-written expected structure) or a value that would provably differ under the broken-behavior case (e.g., the item-19-adjacent second block, the log.test.ts case-(h) exact score/phase/eliminated assertions before AND after undo).

This is disclosed as a recurring risk per the task's framing — the scan found the ONE known instance and no new ones, but the class of bug (comparing a value to itself post-no-op) is worth a standing checklist item in future PVL/EVL passes for this project.

## STEP 5 — Residuals

### Host/stage DOM rendering — confirmed genuinely untested, not merely deferred

`package.json` `devDependencies` contains only `@types/node` and `vite` — **no DOM/browser test tooling exists in this repository at all** (no jsdom, happy-dom, Playwright, Puppeteer, or Testing Library). No test file imports `src/host/main.ts` or `src/stage/main.ts`. This is a genuine repo-wide tooling gap, not laziness in this phase — building it would require adding a new devDependency and test infrastructure, out of scope for an engine-capability phase.

**What a human must click through** (reading the actual shipped code, `src/host/main.ts`):
1. Boot `npm run show` (or the scratch/demo-t1 preset), reach `reveal` on a non-last, non-tied round → confirm a **"Next Round"** button appears (line ~207, `copy.host.next` reused).
2. Reach `reveal` on a round with a manufactured tie → confirm one **"Eliminate {name} & continue"** button per tied team appears (line ~220ish), and clicking one actually advances.
3. Reach `reveal` on the **last** round → confirm the button reads **"End Show"** (`copy.host.endRound` reused, line ~213), not "Next Round".
4. Reach `roundIntro` or `intermission` → confirm a **"Continue"/Skip** button appears (line 176-177, `copy.host.skip` reused) and clicking it lands on `board` (or `roundIntro` if coming from `intermission` with an intro round next).
5. Reach `final` → confirm the host view shows the **"Show complete — final scores below."** banner (line 299) instead of a stale board, and that the Scores section still renders below it; confirm the equivalent on the stage view (`"Show Complete"` title card, `src/stage/main.ts`).

None of this is closed by this EVL run — it remains the plan's own named Agent-Probe/Manual gate, not silently claimed.

### `carryScores: false` zeroes an eliminated team's own score — confirmed precisely, empirically

Constructed a fresh fixture (2 teams, `carryScores:false`, `eliminateLowest:true`, team B lowest at a **nonzero** score of 10) and drove `advanceToNextRound` + `dispatchHostAction` directly. Result: the batch contains an `awardPoints` intent for team B (the team simultaneously being eliminated) alongside its `eliminate` intent, because the score-reset loop iterates `state.teams` unfiltered. Final state: **team B ends the batch at `score: 0`, `eliminated: true`** — confirmed byte-for-byte. This is exactly the code's behavior as written and matches the plan's own design (T2.2-L4 iterates all teams, no elimination-exclusion). No judgment is made here on whether this is desirable — that is a product decision.

## Verdict

No fix cycle needed. EVL confirmation run is CLOSED at cycle 0.

## Unresolved Questions

1. Should an eliminated team's pre-elimination score be preserved for the finale podium instead of zeroed by the same-batch `carryScores:false` reset? (Product decision, not evaluated here — see STEP 5.)
2. Should this repo adopt a DOM/browser test harness (jsdom or Playwright) so `host/main.ts`/`stage/main.ts` render branches stop being Agent-Probe/Manual-only? (Cross-phase tooling decision, out of scope for T2.2 itself.)
