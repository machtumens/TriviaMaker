---
name: plan:gameshow-engine-t2.2-blockers
description: "backlog — T2.2 blockers found during T2.1 EVL: unbounded advanceRound, setStyleState reference-adoption corruption, carried-forward Defect D2 write paths"
date: 27-08-26
feature: general
---

# BACKLOG NOTE — T2.2 Blockers (found during T2.1 EXECUTE/EVL)

**Deferred from:** T2.1 EXECUTE + EVL (`gameshow-engine-t2_24-08-26`), captured at UPDATE
PROCESS 2026-08-27.

**Why deferred:** all three items below are genuinely unreachable in T2.1 (no live dispatch
site exists for `advanceRound`, no style yet writes to `styleState`), so none of them block
T2.1's own gates. They become live the moment T2.2 adds a real "next round" host action or
the first T2.3 style starts writing to `styleState`. Do not start T2.2 PLAN work without
reading this note first.

## 1. `advanceRound` is unbounded — MUST fix before T2.2 wires a live dispatch site

`applyIntent`'s `advanceRound` case sets `roundIndex: state.roundIndex + 1` with no upper
bound check. If `roundIndex + 1` exceeds `program.rounds.length - 1`, the intent itself
succeeds silently — the failure is deferred to the **next** `broadcastState` call, which
throws (`currentRound()` finds no round at that index). In a live show this means the show
goes down on the next broadcast, not at the point the host clicked "next round."

**Confirmed genuinely unreachable in T2.1**: repo-wide `grep -rn "advanceRound"` (excluding
`node_modules`, `dist`, `*.test.ts`) finds it only in `registry/index.ts` (type decl),
`engine/intents.ts` (touched-keys + apply case), `engine/log.ts` (event-name mapping). No
application code constructs or dispatches this intent — confirmed independently by both the
execute-agent and EVL.

**Required for T2.2:** bound the increment — either clamp at `program.rounds.length - 1`
and no-op past the end, or reject/short-circuit the intent when the target index is out of
range, whichever the T2.2 SPEC decides is the correct host-facing behavior (e.g. "next
round" button disabled on the last round vs. a defensive clamp). This is a T2.2 SPEC/PLAN
decision, not something to patch ad hoc.

## 2. `setStyleState` adopts the caller's object by reference — consider a defensive clone

`applyIntent`'s `setStyleState` case assigns `intent.nextStyleState` directly into
`state.styleState`, and `applyIntentsWithLog` shallow-copies intents into the log — so
`event.payload.intents[0].nextStyleState` is the SAME object reference as
`state.styleState`. A caller that retains and later mutates that object corrupts both live
state and the already-logged undo audit entry in place.

Reproduced independently by EVL (built a caller-owned object, dispatched it, mutated it
after dispatch — both `state.styleState` and the logged entry reflected the mutation). Same
class of issue as the existing `custom` intent's `payload` handling — not a new pattern in
this codebase, but now a second instance.

**Recommended fix:** a defensive clone (e.g. `structuredClone` or a JSON round-trip, given
the JSON-safety requirement already on `styleState`) in `applyIntent`'s `setStyleState` case
before assignment. Not a T2.1 blocker — no style writes to `styleState` yet, so there is no
live corruption path today — but should land before or alongside T2.3's first style that
retains a reference to anything it hands to `setStyleState`.

**Also needed:** a regression test for the corruption path itself (not just documentation of
current-behavior-by-reference) — currently only `intents.test.ts` documents the reference
behavior; no test proves the corruption scenario is guarded against once a fix lands.

## 3. Carried forward, unchanged from T2.1 plan Open Item 1 — Defect D2 write paths

`attemptsUsed`, `TeamState.streak`, and `TeamState.lifelinesUsed` still have no write path.
T2.1's INNOVATE Decision D7 only disambiguated List's strike concept from `attemptsUsed` —
it did not add a write path for any of the three fields. Still assigned: `streak` → T2.4,
`lifelinesUsed` → T2.5, List's own strike counter → T2.3 (once List exists).

## Source

Full detail and evidence: `process/general-plans/active/gameshow-engine-t2_24-08-26/` —
`gameshow-engine-t2_PLAN_24-08-26.md` (Open Items 1, 4), `gameshow-engine-t2_REPORT_24-08-26.md`
("Residual Risks" #1, #2), `gameshow-engine-t2-evl-iteration-001_REPORT_27-08-26.md` (Step 5),
`gameshow-engine-t2_CLOSEOUT_24-08-26.md`.
