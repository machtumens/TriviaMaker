---
name: plan:gameshow-engine-t2-styleplugin-contract
description: "backlog — T2 SPEC input: 4 StylePlugin/Intent contract gaps to resolve as one coherent change, not four patches"
date: 24-08-26
feature: general
---

# BACKLOG NOTE — T2 SPEC Input: `StylePlugin` / `Intent` Contract Gaps

**Deferred from:** T1 EXECUTE (`gameshow-engine_24-08-26`), captured at UPDATE PROCESS
2026-08-24.

**Why deferred:** T1's plan explicitly forbade touching these contracts mid-EXECUTE (Open
Items 2 and 5 in `gameshow-engine_PLAN_24-08-26.md`), even when the temptation arose. All
four items below were found during T1 (three during INNOVATE/VALIDATE, one during EXECUTE
itself) but correctly left unresolved as T2 scope.

## The Four Gaps

1. **No `SessionState` slot for persistent style-owned state.**
   Blocks any style plugin (e.g. `tictac`) that needs to remember something across turns
   beyond what the generic session already tracks (consumed tiles, scores, phase). Found
   during INNOVATE.

2. **`StylePlugin.buildBoard` does not receive `state`.**
   This is why T1 has to derive `cells[].consumed` in `broadcastState` instead of inside
   `grid.buildBoard` itself — the style plugin literally cannot see session state. Found
   during INNOVATE; worked around in T1 by putting the derivation at the one place that
   does have state (`broadcast.ts`).

3. **No `Intent` variant touches `roundIndex` — T1 can only play round 1.**
   Multi-round shows are impossible without a contract change; this is a settled-union
   limitation, not an implementation shortcut. Found during EXECUTE (not predicted by
   PLAN or VALIDATE) — `demo-t1.ts` authors two rounds per the plan's item 27b, but only
   round 1 is reachable.

4. **`GameEventName` is a closed union**, forcing 5 imprecise intent-to-event-name
   fallbacks (`setTurn`, `stopClock`, `playSound`, `effect`, `custom` all map to a
   best-fit existing name). Bounded impact today — undo and dispute-audit read
   `payload`/`undo`, not `name` — but it's the same "closed union hit by more use cases
   than it was designed for" shape as gap 3. Found during PLAN (Open Item 1).

## Why These Must Be Evaluated Together

Three separate `StylePlugin`-under-context findings (gaps 1, 2, and a third instance found
mid-T1 — VALIDATE's G2, `grid.buildBoard` had no channel to real question content, closed
T1-locally via `resolveRoundContent`) are the same root shape appearing three times. That
is a signal the `StylePlugin` interface itself is under-specified, not three unrelated
bugs. Patching gap 3 (`roundIndex`) alone without also revisiting gaps 1/2/4 risks a
fourth incompatible patch.

**Recommendation for T2 SPEC/INNOVATE:** design one richer `StylePlugin` context object
(state + resolved content + round/event addressing) rather than continuing to add
T1-local option types and closed-union fallbacks at individual call sites. This is a T2
SPEC/INNOVATE decision, not a T1 EXECUTE decision — do not attempt to resolve any of these
four items outside a proper SPEC/PLAN pass, even for a single style plugin.

## Source

Full detail and evidence: `process/general-plans/active/gameshow-engine_24-08-26/` —
`gameshow-engine_PLAN_24-08-26.md` (Open Items 2, 5), `gameshow-engine_REPORT_24-08-26.md`
("Known Gaps Carried Forward"), `gameshow-engine_CLOSEOUT_24-08-26.md` (§6, §8).

---

## RESOLVED 2026-08-27 (T2.1 contract revision) — status update, not a rewrite

All 4 gaps above landed as one coherent contract revision, per this note's own
recommendation (design one richer context, not four separate patches). Resolution detail:

1. **Persistent style-owned state** — RESOLVED: `SessionState.styleState`.
2. **`buildBoard` doesn't receive `state`** — RESOLVED: required 3rd param.
3. **No `Intent` touches `roundIndex`** — RESOLVED mechanically (`advanceRound` intent,
   undo-safe), but **not yet wired to a live dispatch site** and currently **unbounded** —
   see the new backlog note `gameshow-engine-t2.2-blockers.md` for what T2.2 must do before
   using it.
4. **`GameEventName` closed union** — PARTIALLY RESOLVED: one more previously-unreachable
   member closed (`advanceRound → round.started`), one more fallback added (`setStyleState
   → phase.changed`, pending Hybrid-tier human sign-off, T2 SPEC AC#12).

One new obligation surfaced as a side effect of resolving gap 2, not predicted by this note:
styles must now publish `board.meta.pointLadder` for audience point-value labels to render
— see `CUSTOMIZATION.md` §Writing a style plugin.

Full detail: `process/general-plans/active/gameshow-engine-t2_24-08-26/` — PLAN, EXECUTE
report, EVL confirmation report, and `gameshow-engine-t2_CLOSEOUT_24-08-26.md`.
