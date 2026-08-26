---
name: plan:gameshow-engine-t2-innovate
description: "INNOVATE — T2 StylePlugin/Intent/SessionState contract revision: decided approach for T2.1, plus forward-looking decisions for T2.3 styles"
date: 24-08-26
feature: general
---

# INNOVATE — Game Show Engine T2 (Contract Revision + Defect Disposition)

> **Provenance note.** This is a condensed record of the T2 INNOVATE session,
> transcribed to disk by the PLAN agent because the innovate-agent that ran
> this session has no Write tool and could not persist its own output. The
> content below — decisions D1–D7, defect dispositions, and the exact
> contract edit list — was supplied verbatim by the orchestrator as the
> record of what INNOVATE concluded; this file's job is to persist it
> faithfully and organize it for downstream PLAN/VALIDATE/EXECUTE
> consumption, not to re-derive or second-guess it.

## Scope note (read before the decision log)

This INNOVATE session covers the **whole T2 contract-and-defect design
space**, not only what T2.1 implements. Per the T2 SPEC's Capability
Inventory (`gameshow-engine-t2_SPEC_24-08-26.md`), some decisions below are
implemented NOW (T2.1 — this task folder's PLAN), and some are decided NOW
but implemented LATER (T2.3, when the five remaining styles are built). The
PLAN document explicitly marks which is which; do not infer scope from this
file alone.

- **Implemented in T2.1 (this PLAN):** D1–D5 (contract mechanism), Defect D3,
  Defect D5 (mixed outcome, reported honestly).
- **Decided now, implemented in T2.3:** D6 (Wheel), D7 (List/attemptsUsed
  disambiguation), Defect D1 (grid `selection`). D5 (Hangman) is a scope
  recommendation for T2.3, not a T2.1 or T2.3 implementation commitment.

---

## 1. Chosen Approach

Revise exactly three named surfaces in `src/registry/index.ts` —
`SessionState`, the `Intent` union, and `StylePlugin.buildBoard` — to give
every style plugin (a) a persistent, opaque, undo-aware state bag
(`styleState`), (b) a way to write to that bag mid-turn through the existing
generic undo mechanism (`setStyleState` Intent), (c) a way to advance
`roundIndex` (`advanceRound` Intent), and (d) visibility into `SessionState`
at `buildBoard` time. `isRoundComplete` needs no signature change — it
already receives `state`; once `buildBoard` can write into
`board.cells[].meta`, `isRoundComplete` reads derived data off the board
rather than off `state` directly.

Two style-specific defects (D3 broadcast cast, and D5's `GameEventName`
accounting) are resolved as a direct consequence of this contract shape and
are folded into the same implementation pass. Two open style questions
(Wheel's segment-to-question addressing, List's strike counter) are resolved
as design decisions now so T2.3 does not re-litigate them, without touching
any code today. One question (Hangman's phase-machine fit) is explicitly
NOT resolved — it is recommended for deferral out of T2.3's initial scope.

## 2. Why This Over Alternatives

The unifying reason across every decision below: **the engine must stay
generic** (per the project's own governing principle — "if you want to write
`if (config.someSpecialCase)` in the engine, you have found a plugin seam,
not a config flag"). Every rejected alternative in the decision log below
was rejected because it either (a) reintroduces a closed-union or
per-instance workaround that a future third-party style plugin cannot extend
without editing core files it does not own, (b) breaks the existing L2a
batch-undo guarantee by making `INTENT_TOUCHED_KEYS` unable to name what a
write touches, or (c) duplicates state that already has one authoritative
home (`SessionState`) into a second one. See each decision's own REJECTED
notes for the specific mechanism.

## 3. Risk Predictions

| # | Risk | Why it exists | Mitigation carried into PLAN |
|---|---|---|---|
| R1 | Five existing test files hand-build `SessionState` object literals and will fail `tsc` once `styleState` is a required field. | `src/engine/broadcast.test.ts`, `src/engine/intents.test.ts`, `src/engine/log.test.ts`, `src/scoring/flat.test.ts`, `src/styles/grid.test.ts` each construct a full `SessionState` literal, one call site each (orchestrator-verified). | PLAN's Touchpoints table names all five files explicitly; each needs one `styleState: {}` addition. Closed by construction, not by a grep task at EXECUTE time. |
| R2 | `styleState` is JSON-serialised into the SSE broadcast payload with **no** Set→array-style conversion (unlike `consumed`/`lockedOutTeamIds`). A style author storing a `Set`/`Map` in it would silently collapse to `{}` on the wire — the exact bug class T1 hit and fixed for `consumed`/`lockedOutTeamIds`, now reopened at a new field. | `styleState`'s value type is `Record<string, unknown>` — nothing in the type system stops a style plugin from putting a `Set` in it. | Interface doc comment on `SessionState.styleState` states the JSON-safe-only requirement explicitly (discipline, not structural enforcement — TypeScript cannot express "no ES `Set` values" in a `Record<string, unknown>`). PLAN requires a dedicated round-trip serialization test (`JSON.parse(JSON.stringify(payload))` equality) as a permanent regression guard, not just a one-time manual check. |
| R3 | `styleState` is broadcast **unredacted** to every channel, `stage`/`player` included — same channel discipline as `consumed`. A style plugin that derives something answer-adjacent into `styleState` (the realistic trap: Hangman computing a masked label FROM the real answer and caching it there) leaks it to the audience. | `broadcastState` (L9/L17's single redaction call site) has no per-field redaction logic for `styleState` — it passes the whole `SessionState` slice through unchanged, by design (it is meant to carry presentation-relevant per-style data like "which cells are revealed," which the audience IS meant to see). | Interface doc comment carries an explicit SECURITY/REDACTION warning naming the Hangman masked-label trap by name. This is documented as a discipline requirement, not a structural guarantee — flagged honestly in the PLAN's Open Items, not oversold as "solved." |
| R4 | T2.1 does **not** close Defect D2's `attemptsUsed` write-path gap. Decision D7 only rules out List's `strikesAllowed` as the mechanism for it — the underlying gap (no `Intent` writes `attemptsUsed`, `TeamState.streak`, or `TeamState.lifelinesUsed`) remains fully open. | D2 was found during T2 RESEARCH as three fields with zero write path; T2.1 only reasons about ONE of the three (disambiguating it from List's separate strike concept), and touches none of the three in code. | PLAN's Open Items section states this honestly as a carried-forward gap for T2.4 (streak)/T2.5 (lifelines)/T2.3 (List's own counter, once List exists) — not silently dropped. |
| R5 | Defect D5's `GameEventName` outcome is a wash, not an improvement, and could be mis-reported as progress if summarized carelessly. | `advanceRound → 'round.started'` makes one previously-unreachable member reachable (11→10 unreachable), but `setStyleState → 'phase.changed'` is a genuinely NEW 7th fallback (6→7 fallbacks). Net effect on the two counts moves in opposite directions. | PLAN's phase-report guidance explicitly requires reporting both numbers, not just the favorable one. AC#12 (T2 SPEC) requires this diff be named honestly. |
| R6 | Hangman's phase-machine fit is unresolved and may still be unresolved after T2.3 starts. | The 11-state `Phase` machine models one discrete question-cycle; Hangman is a continuous letter-guess loop against one word — no candidate mechanism (micro-cycles, phase-union growth, "one held phase") cleanly closes this without tension against `ARCHITECTURE.md` §5's explicit-transition requirement. | Recommended for deferral out of T2.3's *initial* scope (see Decision D5 below). Zero T2.1 impact — flagged here only because it is a real open risk INNOVATE did not resolve, and pretending otherwise would be dishonest. |

## 4. Key Constraints Accepted

- **Contract edits limited to exactly three, all in `src/registry/index.ts`.**
  `SessionState` gains `styleState`; the `Intent` union gains `setStyleState`
  and `advanceRound`; `StylePlugin.buildBoard` gains a third `state`
  parameter. `isRoundComplete` needs no signature change. No other exported
  interface in this file changes shape in T2.1.
- **Zero edits to `src/config/types.ts`.** Per the T2 SPEC's own Constraints
  section — the config schema (`GridStyle`, `ListStyle`, etc.) is settled
  input to T2 and is not touched by the engine-side contract revision.
- **Zero new runtime dependencies.**
- **Backward compatibility is a hard requirement.** Every existing T1 test
  file, the `grid` style, the `flat` scoring engine, and all four T1
  invariants must keep passing/holding after the contract change, with
  updated call-site signatures but unchanged runtime behavior for a
  T1-shaped show.
- **L2a's batch-union undo mechanism must keep working.** `styleState` must
  be nameable in `INTENT_TOUCHED_KEYS` as a real top-level `SessionState`
  key — this is exactly what motivated storing it as a keyed field rather
  than threading it as an untracked parameter (see Decision D1's REJECTED
  note).
- **`styleState` broadcasts unredacted, like `consumed`.** This is a
  documented discipline requirement for style authors (R3 above), not a new
  structural redaction guarantee — accepted as an honest, bounded risk
  rather than solved.
- **T2.1's implementation scope is the contract plus its plumbing only.**
  No new style plugin ships in T2.1. No round-boundary orchestration
  (`carryScores`, `intro`, `intermissionAfter`, `eliminateLowest`) is wired
  in T2.1 — that is T2.2. `advanceRound`/`setStyleState` are proven
  mechanically (direct dispatch + undo tests) in T2.1, not wired into any
  live host-triggered code path yet.

---

## Decision Log

### D1 — Style-state slot

**Decision:** New `SessionState.styleState: Record<string, unknown>`. JSON-safe
values only (arrays not `Set`, plain objects not `Map`) — this is what makes
it survive SSE serialisation, unlike the `ReadonlySet` bug that cost T1 a
fix. Reset to `{}` on `advanceRound` as an engine-level safety net; styles
reset their own sub-keys at `onSelect` for per-question granularity (List's
strikes must reset per Feud-question, not per engine round).

**Rejected — threading it as a parameter instead of storing it:** cannot be
snapshotted by L2a's generic batch-diff undo, since there is no keyed field
for `INTENT_TOUCHED_KEYS` to name, forcing hand-written inverses.

**Rejected — a separate parallel store outside `SessionState`:** a second
authoritative state to clone, serialise, and undo; reinvents the same thing
with more parts.

### D2 — State-aware `buildBoard`

**Decision:** Add `state: SessionState` as a required third parameter to
`buildBoard(round, options, state)`. `isRoundComplete(state, board)` needs
NO signature change — once `buildBoard` can embed derived per-cell data into
`board.cells[].meta` (already `Record<string, unknown>`), `isRoundComplete`
reads it off the board.

**Rejected — folding state into the per-style options object:** makes
options do two jobs (round-stable authored config plus turn-by-turn mutable
state), forces every style to duplicate the field, and hides the requirement
from the shared interface.

**Rejected — a post-hoc derive hook generalising `broadcast.ts`'s
`withDerivedConsumption`:** that is the workaround the backlog note flagged
as a gap to close, not extend; and it does not fix `isRoundComplete`,
reintroducing a call-order dependency.

### D3 — Mid-turn writes

**Decision:** One generic Intent `{ type: 'setStyleState'; nextStyleState:
Record<string, unknown> }`, with `INTENT_TOUCHED_KEYS.setStyleState =
['styleState']` — exactly one key, trivially satisfying L2a's union
snapshot. Styles compute their next `styleState` by reading
`state.styleState` and returning a new object.

**Rejected — a named Intent per style write** (`revealSlot`, `flipOwnership`,
`guessLetter`, `spinWheel`): `GameEventName` is closed so naming buys nothing
there; each variant duplicates structurally identical work; and a
third-party style plugin cannot add members to a closed union it does not
own, defeating the opaque-state finding.

**Rejected — giving `custom` a caller-supplied `touchedKeys` array:** turns
`INTENT_TOUCHED_KEYS` from a static data table into instance-resolved data,
and lets a careless plugin under-declare (e.g. `[]`), silently reintroducing
the exact D4 undo-blindness bug this fixes, now trust-based instead of
structurally impossible.

### D4 — `roundIndex`

**Decision:** New Intent `{ type: 'advanceRound' }`,
`INTENT_TOUCHED_KEYS.advanceRound = ['roundIndex', 'styleState']`,
`applyIntent` returns `{ ...state, roundIndex: state.roundIndex + 1,
styleState: {} }`. Dispatched as an explicit host batch, one
`dispatchHostAction`, one undo. Maps to the EXACT existing `GameEventName`
`'round.started'`, previously unreachable — a genuine D5 win.

**Rejected — extending `setPhase` to bump `roundIndex` as a side effect:**
overloads one Intent with two meanings, undiscoverable from the type, and
forces `INTENT_TOUCHED_KEYS.setPhase` to become instance-aware.

**Rejected — auto-advancing when `isRoundComplete` returns true:** breaks
one-press-equals-one-undo (nobody pressed anything) and conflicts with the
SPEC's flow diagram where `roundIntro` is walked through explicitly.

### D5 — Hangman (decided NOW, implemented in T2.3 — recommend deferral)

**Recommendation:** DEFER Hangman out of T2.3's initial scope. Its continuous
letter-guess loop does not fit the 11-phase machine, the problem is unshared
by the other four styles, and solving it in T2.1 would over-fit the shared
contract to one hard case.

**Rejected — micro-cycles:** needs a new reveal→armed edge that does not
exist, and makes `'reveal'` mean two different things.

**Rejected — growing the `Phase` union:** permanent complexity for one
style's benefit.

**Leading candidate for later ("one held phase"):** tensions with
`ARCHITECTURE.md` §5 — if the phase machine cannot see "mid-guess",
`assertTransition` cannot guard illegal mid-guess actions. Not resolved here.

**Migration impact of the deferral:** zero.

### D6 — Wheel (decided NOW, implemented in T2.3)

**Decision:** Segments always require `categoryId`; landing resolves to a
follow-up pick within that category. Not a free choice —
`WheelStyle.segments[]` has no field identifying a specific question, and
`categoryId` is the only content-addressing field that exists. A segment
missing `categoryId` is an author error the plugin should reject loudly at
round start, matching `resolveRoundContent`'s throws. No new `'spin'` Phase:
the result is computed instantly server-side via `setStyleState`; the spin
animation is client-side cosmetic playback of an already-known result using
`WheelStyle.spinDurationMs`.

**Rejected — overloading `armed`/`reading`:** `armed` is rule-bearing
(buzzers live), so reuse needs a style-conditional exception, the exact
`if (style.kind === 'X')` anti-pattern forbidden in generic engine code.

### D7 — `attemptsUsed` (decided NOW; T2.1 does not implement)

**Decision:** Semantically separate; List's strikes live in `styleState`.
`attemptsUsed` pairs with `TurnRules.maxAttempts` as a per-QUESTION retry
counter; List's `strikesAllowed` is per-round-turn (3 wrong answers anywhere
in the round ends the turn). Reusing it would inherit the per-question reset
and break the actual Family Feud rule — a team could survive strikes forever
by switching slots.

**Honest carry-forward:** T2.1 does NOT close D2's `attemptsUsed` write-path
gap — it only rules out List as the mechanism. The write path itself remains
open (see Risk R4 above).

---

## Defect Disposition

### Defect D1 — grid ignores `GridStyle.selection` (T2.3, NOT T2.1)

**Decision (for when T2.3 implements it):** generalise the warn-once
pattern. Extract a shared `warnOnce(key, message)` helper (keyed `Map`,
stricter than `flat.ts`'s single boolean which conflates all its warnings)
used by both `flat.ts` (retrofit) and `grid.ts` (new). Per-plugin discipline
is unenforced by lint or test — which is exactly how `selection` got
forgotten. ATTEMPT THE REAL FIX first: sequential sorts by row/col, random
shuffles; `availableQuestions` already filters by `state.consumed`. Warn-once
is the fallback for whatever is not actually implemented.

**Scope note:** the T2 SPEC's Capability Inventory assigns this defect to
T2.3 ("D1 — grid `selection` fixed in this phase too, since it's the same
'style rule not enforced' class"), not T2.1. T2.1's PLAN does not implement
any part of this fix — see the PLAN's explicit scope-boundary statement.

### Defect D3 — `broadcast.ts:128` cast (T2.1 — implemented)

**Decision:** Two uses hide behind one cast. The spread `{ ...round.style,
categories }` type-checks against `StyleConfig`'s union with NO cast. The
`pointLadder` read is grid-specific, but `grid.ts:73` already puts
`pointLadder` into `board.meta` (orchestrator-verified), so broadcast can
read `hostBoard.meta?.['pointLadder']`. Cast retires with zero interface
changes.

**Honest gap:** `withPointValueLabels`'s redaction RULE stays grid-specific
— generalising board redaction across N styles is T2.3 scope.

### Defect D5 — `GameEventName` (T2.1 — implemented, report as mixed)

**Decision:** Mixed outcome, report it as mixed. `advanceRound` →
`'round.started'` makes one unreachable member reachable (11 → 10).
`setStyleState` → `'phase.changed'` is a genuine NEW 7th fallback (6 → 7).
Net: a wash. Do not present this as progress.

---

## Exact Contract Edits (T2.1 scope — 3 edits to `src/registry/index.ts`, 0 to `src/config/types.ts`)

| Location | Edit |
|---|---|
| `SessionState` (~lines 28–44) | add `readonly styleState: Record<string, unknown>` |
| `Intent` union (~lines 76–88) | add `setStyleState` and `advanceRound` variants |
| `StylePlugin.buildBoard` (line 97) | add third parameter `state: SessionState` |

`isRoundComplete` (line 105) needs no change.

---

## Status

**Status:** DONE
**Summary:** Full T2 INNOVATE decision record (D1–D7, three defect
dispositions, exact contract-edit list) persisted verbatim, with an explicit
scope note separating what T2.1 implements now from what is decided-but-
deferred to T2.3.
**Concerns/Blockers:** None for T2.1. R4 (attemptsUsed gap) and R6 (Hangman
phase-fit) are carried-forward open risks, documented, not blocking.
