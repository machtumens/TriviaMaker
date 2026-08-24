---
name: report:gameshow-engine-pvl-iteration-002
description: "PVL cycle 2 — VALIDATE re-run: BLOCKED cleared to CONDITIONAL, 3 new findings"
date: 24-08-26
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 2
  domain: plan
---

# PVL Iteration 002 — VALIDATE Re-run

Last updated: 2026-08-24

## Outcome

| Field | Value |
|---|---|
| Entering | `Gate: BLOCKED` (1 FAIL, 5 CONCERN) |
| Leaving | `Gate: CONDITIONAL` (0 FAIL, 4 CONCERN) |
| F1–F8 | **Verified genuinely closed**, not accepted on the supplement's word |
| New findings | G1, G2, G3 |
| Trend | 6 gaps → 3. No plateau. Cycle 2 of 10. |

## F1 Deep Probe — the algorithm holds

The specific edge case: two intents in one batch touching the **same** key. Traced
through the real `resolveAnswer` batch where `consumeQuestion` and `setPhase` both
claim `phase`.

The union-snapshot-before-apply algorithm restores the whole pre-batch value
regardless of how many intents touched a key or in what order. That is a structural
property of "checkpoint once, replay, restore checkpoint" — it needs no per-intent
bookkeeping. F1 is closed.

## New Findings

### G2 — material, blocks Goal 1

`grid.buildBoard(round, options)` has no channel to real question content.

Verified against source: `Round` carries `bankId` and `categoryIds` — *references* —
while banks live at `config.content.banks` (`types.ts:821`). `buildBoard` receives
neither `config` nor `state` (`registry/index.ts:97`). No function in the plan
resolves the reference. The plan's own description is self-contradictory, calling
`options` both "the resolved `GridStyle` config" and "the resolved question bank",
though `GridStyle` has no content field.

**Root cause — a recurring shape, not an isolated slip.** This is the THIRD gap of
the same kind found in `StylePlugin`:

| Found by | Gap | Tier |
|---|---|---|
| INNOVATE | no `SessionState` slot for style-owned state | T2 |
| INNOVATE | `buildBoard` never receives `state` | T2 |
| VALIDATE c2 | `buildBoard` cannot reach question content | **T1, material** |

`StylePlugin`'s methods are systematically under-supplied with context. `buildBoard`
was designed assuming `Round` is self-contained; the config cascade deliberately
separates references from content so banks can be shared across rounds. Nothing
typechecked the disagreement because `O` is generic.

**T1 fix:** a local options shape (`GridStyle & { categories: Category[] }`) assembled
by a `resolveRoundContent(config, round)` helper. No contract change.
**T2 recommendation:** revisit the `StylePlugin` signature itself rather than keep
patching call sites. Carry this into the T2 SPEC.

### G1 — internal contradiction

Item 8 says `session.ts` is the sole caller of `applyIntentsWithLog`; item 28 and
Public Contracts describe `server.ts` calling it directly. Undo stays correct either
way (batching still happens), but the stated guardrail against future regressions is
undermined by being false as written.

### G3 — minor

`INTENT_TOUCHED_KEYS` lists `phase` for `consumeQuestion`/`selectQuestion`, but
neither carries a phase value and no derivation rule is given. Harmless today because
`setPhase` runs last in both real batches, but it makes item 7's test unwritable as
literally specified.

## Process Notes

- **Orchestrator error:** the cycle-2 prompt asserted the Agent tool would be
  available for a parallel fan-out. `vc-validate-agent`'s actual grant is
  Read/Grep/Glob/Bash/Write. The agent disclosed the discrepancy rather than claiming
  a fan-out it did not run — correct behaviour. Instruction dropped for cycle 3.
  Consequence: both VALIDATE passes so far have been deep-sequential. Coverage is
  evidence-backed but a genuine parallel fan-out has still never run on this plan.
- The `## Autonomous Goal Block` below the contract still reads `Gate: BLOCKED` and is
  stale; VALIDATE was scoped to the contract section and correctly left it alone.
  Handed to cycle 3.
