---
name: report:gameshow-engine-pvl-iteration-001
description: "PVL cycle 1 — closing VALIDATE's BLOCKED verdict on the T1 engine plan"
date: 24-08-26
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 1
  domain: plan
---

# PVL Iteration 001 — T1 Engine Core Plan

Last updated: 2026-08-24

## Cycle Inputs

| Field | Value |
|---|---|
| Plan | `gameshow-engine_PLAN_24-08-26.md` |
| Entering verdict | `Gate: BLOCKED` (outer-pvl, cycle 0 baseline) |
| Gaps entering | 1 FAIL, 5 CONCERN, 2 minor (8 total) |
| Supplement agent | vc-plan-agent, sonnet, supplement mode |
| Cap | 10 cycles |

## The Blocking Finding (F1)

VALIDATE found the plan's own top-named risk was real, but at a different altitude
than the plan predicted. The snapshot/diff undo mechanism is sound per intent. The
defect is **granularity**:

- `StylePlugin.onSelect()` returns 2 intents; `session.resolveAnswer()` emits 3
- `GameEvent` has no `actionId`/`groupId` binding them (verified: the interface is
  `{seq, at, name, payload, undo?}`)
- `undo()` reverses one `GameEvent` per call

Net effect: undoing one host mis-click requires 2–3 presses, and intermediate states
are visible on the projector between them. Breaks the plan's Goal 2 and SPEC AC#6.

Root cause is an interface-design error in `src/registry/index.ts`: the log was
modelled around **intents** (what plugins emit) while undo is exercised in **actions**
(what a human performs). The two granularities were never reconciled, and nothing in
the type system objected.

## Resolution

| Gap | Severity | Fix applied to plan |
|---|---|---|
| F1 undo granularity | FAIL | Design Lock **L2a**: `applyIntentsWithLog(state, intents[], seq, at)` snapshots the UNION of touched keys across the whole batch *before* applying any intent, logs exactly ONE `GameEvent` per host action. L6 updated so `resolveAnswer()` passes all 3 intents in one call. Test cases (d)/(e) prove 2- and 3-intent batches each reverse in a single `undo()`. |
| F2 preflight gap | CONCERN | `validateConfigPluginsT1()` wrapper in `bootstrap.ts` checks built-in `round.style.kind` against the style registry. No edit to `registry/index.ts`. |
| F3 preset mismatch | CONCERN | Both fixes: new `presets/demo-t1.ts` as `server.ts`'s zero-arg default (`school-assembly.ts` untouched as the full-engine example), AND `flat.score()` warns once per process on enabled-but-unimplemented streak/comeback. |
| F5 path traversal | CONCERN | `local.ts` static route path-resolves + prefix-checks against `staticDir`, 403 on escape, with a traversal test case. |
| F6 tsconfig coverage | CONCERN | `vite.config.ts` added to `include`; corrected the plan's stale "no change needed" claim. |
| F7 timer resume | minor | `clockStartedAt` derivation formula specified so resume does not restart. |
| F8 token compare | minor | Non-constant-time comparison accepted explicitly in Open Items with reasoning (local-LAN threat model, high-entropy UUID). Documented decision, not an oversight. |

**Zero contract changes.** `GameEvent.payload` and `undo` are both untyped
`Record<string, unknown>`, so a batch patch is already expressible. The loose typing
that looked sloppy at authoring time is what made this fix free.

## Verification Performed by Orchestrator

- L2a and `applyIntentsWithLog` present, including an explicit warning against the
  naive per-intent-loop that would silently reintroduce the bug
- All five gap fixes present in the plan text
- INNOVATE D2 carries a dated correction note
- `validate-plan-artifact.mjs` → 0 failures, 0 warnings; plan 693 → 1380 lines
- `## Validate Contract` still reads `Status: BLOCKED` — the plan-agent did not
  self-certify, which is the property that matters

## Outcome

Supplement complete. **This does not clear the gate.** VALIDATE re-runs from V1
against the supplemented plan and independently re-derives the verdict.

## Process Notes

- Cycle-0 VALIDATE ran without the Agent tool, so its two-layer fan-out was sequential
  cross-checking rather than true parallel. Findings were file:line evidence-backed and
  the orchestrator re-verified each, so they stand — but the re-run should attempt the
  textbook parallel fan-out for broader coverage.
- Orchestrator process gap: the post-VALIDATE state was not committed before the
  supplement ran, so there was no clean baseline to diff the contract against. Commit at
  every cycle boundary going forward.
