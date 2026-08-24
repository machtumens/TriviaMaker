---
name: report:gameshow-engine-pvl-iteration-005
description: "PVL cycle 5 — final supplement; H1/H2/H3 closed, loop terminated by user decision"
date: 24-08-26
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 5
  domain: plan
  terminal: true
---

# PVL Iteration 005 — Final Supplement

Last updated: 2026-08-24

## Loop Termination

The user reviewed the loop state at cycle 4 and authorised: close H1, then EXECUTE
directly. **No cycle-6 VALIDATE re-run.** EXECUTE legality rests on two of the three
conditions in `orchestration.md` §PVL routing: `results.tsv` records completed fix
cycles (≥3 lines), and the user explicitly accepted the CONDITIONAL residuals this
session.

## Fixes

| Gap | Fix |
|---|---|
| **H1** (material) | Design Lock **L17**. `broadcastState` (`src/engine/broadcast.ts`) is the sole place `BoardModel` is built and delivered. Rebuilt fresh every call — deliberately uncached, since `buildBoard` is a pure `columns × rows` construction and caching would demand invalidation logic for no gain. `SessionState` gains no `board` field. New item 17a specs a self-contained `broadcast.test.ts` with its own fixture plugin, keeping Sub-Phase 4 parallel-safe with Sub-Phase 3. New AC17. |
| **H2** (cosmetic) | L6 now references `dispatchHostAction`, not the stale `applyIntentsWithLog`. |
| **H3** (minor) | `resolveRoundContent` now throws on empty `categoryIds` and on a bank with zero categories, matching its sibling error style. New AC18. Duplicate `categoryIds` accepted as a documented known-gap. |

## The Redaction Property (the one that mattered)

H1's risk was that fixing board delivery would introduce a second broadcast path
bypassing L9's single redaction call site — leaking the answer key to the projector via
an unrelated fix. It did not.

- `'host'` board: `cells[].label` unchanged (real prompt, host preview)
- `'stage'`/`'player'` board: every label replaced with `String(pointLadder[cell.row])`,
  regardless of `cell.consumed` — a real prompt never reaches those channels via the board
- The currently-read question's prompt travels the separate, pre-existing
  `redactQuestion(q, 'stage'|'player')` path
- Neither client bundle calls `buildBoard` itself

The design and the security property coincide: a grid tile displays a point value
anyway, so redacting it costs nothing visually.

## Orchestrator Verification

- L17 present and precise; no second `handle.broadcast` call site in the plan
- Stage/player label substitution specified unambiguously, including the consumed case
- `broadcast.test.ts` asserts host-real / stage-redacted / no leaked answer fields
- `## Validate Contract` untouched — still the cycle-4 `Status: CONDITIONAL` record
- Validator → 0 failures / 0 warnings; plan 1473 → 1591 lines (+118, precise not bulk)
- `git status` on `src/`, `presets/`, `tsconfig.json`, `package.json` → 0 changes

## Residuals Carried Into EXECUTE (accepted)

1. Duplicate `categoryIds` in a round — non-crashing authoring quirk, unguarded
2. No further PVL validation pass — user-authorised at cycle 4
3. Three `StylePlugin` context-supply gaps deferred to T2 (style-state slot,
   `buildBoard` lacking `state`, and the signature-level root cause)

## Final Loop Summary

| Cycle | Verdict | Gaps |
|---|---|---|
| 0 | BLOCKED | 1 FAIL, 5 CONCERN |
| 1 | supplement | 7 closed |
| 2 | CONDITIONAL | 3 new |
| 3 | supplement | 5 closed |
| 4 | CONDITIONAL | 3 new |
| 5 | supplement | 3 closed — **terminal** |

15 distinct findings surfaced and closed across 5 cycles, including one FAIL and three
material CONCERNs, none of which would have been caught by typechecking. Zero contract
changes throughout.
