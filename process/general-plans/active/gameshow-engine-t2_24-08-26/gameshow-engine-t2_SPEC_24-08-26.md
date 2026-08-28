---
name: plan:gameshow-engine-t2-spec
description: "SPEC — T2: StylePlugin/Intent contract revision, multi-round shows, remaining 5 styles, scoring breadth, lifelines"
date: 24-08-26
feature: general
---

# SPEC — Game Show Engine T2

## Summary

T1 shipped a real, playable game show engine — but only ONE board style (grid),
ONE scoring engine (flat points), and ONE round per show. T2 is what turns that
into the "full engine" the original SPEC promised: a show author can build a
multi-round show that mixes formats (Jeopardy grid, then Family-Feud list,
then a wager-based tic-tac-toe finale), with speed and comeback scoring, and
lifelines. Before any of that new format work can start, T2 has to fix a
structural gap in the plugin contract that T1 correctly deferred rather than
patched piecemeal: several core interfaces (`StylePlugin`, `Intent`,
`SessionState`) are too narrow for anything beyond the one style and one round
T1 shipped. Fixing that contract is the first phase of T2, not an afterthought
— every other T2 capability is blocked on it.

## User Stories / Jobs To Be Done

**Show author**

- As a show author, I want to build a show with more than one round, so that
  I can run a real event structure (e.g. three rounds building to a wager
  finale) instead of one round in a loop.
- As a show author, I want to pick from all six advertised board styles
  (grid, list, trivia, wheel, tic-tac-toe, hangman), so that different rounds
  of my show can look and play differently, matching how a real TV-style game
  show varies its formats.
- As a show author, I want speed-based and comeback-boost scoring available
  as config choices, not just flat points, so that close games stay exciting
  and a runaway leader doesn't make the back half of the show feel pointless.
- As a show author, I want the `selection` setting on a grid round
  (`freePick` / `sequential` / `random`) to either actually work or to warn me
  loudly that it doesn't, so that I never ship a show where I configured
  something the engine silently ignores.
- As a show author, I want lifelines (e.g. "50/50", "phone a friend") and
  special tiles (e.g. daily double, wager tile) to be usable in a real round,
  so that the format variety promised by the schema is actually playable.

**Host / operator**

- As a host, I want to run a show that moves from round to round without a
  developer intervening, so that the live event flows the way it was authored.
- As a host, I want a wrong answer in tic-tac-toe to actually flip the square
  to the other team when `stealSquareOnWrong` is on, so that the format
  behaves the way the config promised, not the way the grid style happens to
  behave.
- As a host, I want undo to work correctly on every style's turn actions, not
  just grid's, so that a misclick recovery is a universal guarantee, not a
  grid-only feature.

## What The User Wants (Behavioral Outcomes)

- A show author can configure a `program.rounds` array with 2+ rounds of
  different styles, and the show actually plays through all of them in order
  — not just round 1.
- Selecting `'sequential'` or `'random'` on a grid round changes which tiles
  are actually pickable next; it is not silently identical to `'freePick'`.
- A round using `list`, `trivia`, `wheel`, `tictac`, or `hangman` renders a
  board, accepts a selection, resolves an answer, and reaches round-complete
  the same way `grid` already does — with the style's own rules (strikes,
  ownership, guessed letters, spin) actually enforced, not silently ignored.
- Turning on `rules.scoring.streak` or `rules.scoring.comeback` changes point
  totals in the way the config describes, and turning it off returns to flat
  scoring — the warning that these are unimplemented is retired once they
  ship.
- A wrong answer in a `tictac` round with `stealSquareOnWrong: true` flips
  square ownership to the opposing team.
- Undo reverses a full host action on ANY style, not just grid — including
  styles whose actions touch state beyond the 12 generic `SessionState`
  fields.
- A lifeline configured in `rules.lifelines.available` can actually be used by
  a team during a live round and has an observable effect on the game (e.g.
  reveals two wrong choices, skips a turn's penalty).
- Every acceptance criterion inherited from T1 (four invariants, redaction,
  zero-player playability, one-action undo) still holds after T2 ships — T2
  adds capability, it does not regress T1's guarantees.

## Flow / State Diagram

### Multi-round show flow (new in T2 — extends T1's single-round loop)

```
        ┌─────────┐
        │  LOBBY  │
        └────┬────┘
             │ host starts
        ┌────▼──────┐
        │ roundIntro│  (per-round title card, if Round.intro.enabled)
        └────┬──────┘
             │
        ┌────▼─────────────────────────────┐
        │  ROUND N  (T1 per-question loop)  │
        │  board → reading → armed → ... →  │
        │  adjudicate → reveal → (loop)      │
        └────┬─────────────────────────────┘
             │ style.isRoundComplete() true
             │
      ┌──────▼───────┐        ┌─────────────────┐
      │ intermission  │◄──────┤ Round.           │
      │ (if enabled)  │       │ intermissionAfter │
      └──────┬────────┘       └─────────────────┘
             │
             │ roundIndex advances (NEW — no Intent does this in T1)
             │
        ┌────▼──────┐
        │ roundIntro│  ── repeats for each round in program.rounds ──
        └────┬──────┘
             │ last round complete
        ┌────▼────┐
        │  FINAL  │  (scoreboard, `eliminateLowest` applied per round if set)
        └─────────┘
```

### Style-plugin state shape (conceptual — the contract problem T2 phase 1 fixes)

```
Before (T1):                          After (T2, shape only — INNOVATE picks the mechanism):

buildBoard(round, options)            buildBoard(round, options, ???)
  no access to state        ──►         needs access to: session state AND
  (T1 worked around this                resolved content, at the same call
   in broadcast.ts, not in              site — no more per-caller workarounds
   the plugin itself)

SessionState                          SessionState
  12 generic fields only    ──►         12 generic fields
  no room for "which cells                + an opaque, per-style, undo-aware
  are owned", "which letters               state slot that only the owning
  guessed", "which slots                   style plugin interprets
  revealed"

Intent (closed union)                 Intent (extended union OR opaque escape
  no roundIndex advance                  hatch that IS undo-aware, unlike
  no mid-turn style writes               `custom` today)
  `custom` is undo-blind
```

## Acceptance Criteria (Testable Outcomes)

Each criterion is tagged `proven by:` (the test scenario that verifies it) and
`strategy:` (Fully-Automated / Hybrid / Agent-Probe / Known-Gap). Nothing here
is marked Fully-Automated unless an automated gate for it can genuinely exist
given what T1 already built (`src/engine/*.test.ts` pattern, `npm test`
discovery via `scripts/run-tests.mjs`). Where the underlying mechanism itself
is not yet confirmed feasible (e.g. a specific undo-plumbing approach),
INNOVATE/PLAN pick the mechanism and PLAN's own validate-contract names the
concrete test file — this SPEC states the observable outcome only.

1. **Contract revision preserves T1 behavior.** After the `StylePlugin`/
   `Intent`/`SessionState` contract changes ship, every existing T1 test file
   (`grid.test.ts`, `flat.test.ts`, `intents.test.ts`, `log.test.ts`,
   `session.test.ts`, `broadcast.test.ts`, `host-manual-round.test.ts`,
   `phase.test.ts`) still passes unmodified in behavior (signatures may
   change, but a T1-shaped show still plays identically).
   `proven by:` full existing T1 test suite + `npm run typecheck`.
   `strategy:` Fully-Automated.

2. **Grid `selection` modes are honored or loudly unimplemented.** A grid
   round configured with `selection: 'sequential'` or `'random'` either (a)
   actually restricts `availableQuestions` accordingly, or (b) emits a
   `flat.score()`-style one-time warning identifying the config as enabled
   but unimplemented — never silent identical-to-`freePick` behavior.
   `proven by:` a new `grid.test.ts` case per mode (or per warning path).
   `strategy:` Fully-Automated.

3. **Multi-round shows play through every round.** A `program.rounds` array
   with 2+ rounds (mixed styles) plays start to finish — `roundIndex`
   advances after each round completes, `roundIntro`/`intermission` phases
   fire per each round's `intro`/`intermissionAfter` config, and `FINAL` is
   reached only after the last round.
   `proven by:` a new engine integration test extending
   `host-manual-round.test.ts`'s pattern to 2+ rounds.
   `strategy:` Fully-Automated.

4. **Each of the five remaining styles completes a full round end to end.**
   For `list`, `trivia`, `wheel`, `tictac`, `hangman`: a host can select,
   resolve (correct and wrong), and reach `isRoundComplete() === true` using
   only that style's own rules (List's strikes, Wheel's spin+segment
   consumption, TicTac's ownership + win-length, Hangman's guessed-letter
   masking, Trivia's persisted question order).
   `proven by:` one new `{style}.test.ts` per style, mirroring `grid.test.ts`'s
   structure.
   `strategy:` Fully-Automated.

5. **TicTac steal-on-wrong flips ownership.** With `stealSquareOnWrong: true`,
   a wrong answer on a cell transfers that cell's ownership to the opposing
   team; with it `false`, ownership stays unresolved/neutral after a wrong
   answer.
   `proven by:` `tictac.test.ts` steal-on-wrong case.
   `strategy:` Fully-Automated.

6. **Speed-weighted and comeback scoring change point totals as configured.**
   `rules.scoring.engine: 'speedWeighted'` produces a lower delta for a slower
   correct answer within the same question's floor/ceiling; `comeback`
   applies its configured multiplier only to a team past
   `deficitThreshold` behind the leader.
   `proven by:` new `speedWeighted.test.ts` and `comeback.test.ts` (or a
   combined `scoring-t2.test.ts`), same purity/determinism pattern as
   `flat.test.ts`.
   `strategy:` Fully-Automated.

7. **Streak bonus applies and resets per config.** With
   `rules.scoring.streak.enabled: true`, consecutive correct answers past
   `threshold` add `bonusPerQuestion` (capped at `maxBonus`); a wrong answer
   resets the streak when `resetOnWrong: true`.
   `proven by:` streak-specific cases in the scoring test file from #6, plus
   confirming `TeamState.streak` (D2) now has a write path in
   `intents.test.ts`.
   `strategy:` Fully-Automated.

8. **Undo reverses a full host action on every T2 style, including mid-turn
   style-owned state.** For each of the five new styles, the equivalent of
   T1's "one host press = one undo press" guarantee holds even when the
   action wrote to the new opaque per-style state slot, not just the 12
   generic `SessionState` fields.
   `proven by:` `log.test.ts` extended with one case per new style's
   representative mid-turn action (e.g. Hangman letter guess, TicTac
   ownership write).
   `strategy:` Fully-Automated.

9. **At least one lifeline is usable end to end in a live round.** A
   lifeline registered in `rules.lifelines.available` and invoked by a team
   mid-round produces an observable, testable effect (its `apply()` intents
   are dispatched and change state as its own logic defines).
   `proven by:` a new `lifelines.test.ts` covering one worked lifeline
   plugin (the concrete plugin and its exact behavior are a PLAN/INNOVATE
   decision — this criterion only requires that the call site + wiring
   exists and is exercised).
   `strategy:` Fully-Automated (mechanism/plugin choice deferred to
   INNOVATE/PLAN; the wiring itself is testable once it exists).

10. **A wager special tile modifies score via `SpecialTilePlugin.modifyScore`.**
    A question flagged as a wager/daily-double tile routes its scoring through
    `SpecialTilePlugin.modifyScore` before the deltas are applied, rather than
    `resolveAnswer` calling `scoring.score()` directly and ignoring the hook.
    `proven by:` a new `specialTiles.test.ts` exercising the wager tile path
    end to end (select → wager amount → resolve → score reflects wager).
    `strategy:` Fully-Automated.

11. **T1's four invariants still hold.** (1) stage view is fully playable
    with zero player devices connected; (2) `snapshotContentAtLaunch` still
    isolates a live session from mid-show config edits; (3) every scoring
    plugin (`flat`, `speedWeighted`, `multiplier`, streak/comeback logic)
    remains pure — running the same `ScoreInput` twice yields identical
    `ScoreDelta[]`; (4) answers are redacted at the transport boundary for
    every style's board, not just grid's.
    `proven by:` re-run of `broadcast.test.ts`, `session.test.ts`, new
    scoring purity tests, plus a redaction assertion added per new style's
    board.
    `strategy:` Fully-Automated.

12. **`GameEventName` breadth is a config-scoped decision, not silently
    dropped.** The 6 fallback event-name mappings (D5) and the 11 unreachable
    `GameEventName` members are either (a) resolved by widening the intent→
    event mapping where a new Intent variant is added for T2 needs (e.g. a
    real `roundIndex`-advance intent could map to `round.started` instead of
    falling back), or (b) explicitly left as a documented, still-accepted
    T1-era limitation with no regression. No new fallback is added silently
    without being named in the phase report.
    `proven by:` a diff review of `INTENT_EVENT_NAMES` before/after T2,
    captured in the T2 phase report — not a runtime-testable assertion by
    itself.
    `strategy:` Hybrid (structural diff is mechanical/automatable via a
    lint-style check; the "is this an acceptable fallback" judgment is a
    human/reviewer call, not a runtime test).

13. **`npm run typecheck` and the full gate sequence stay green throughout
    T2**, matching T1's own bar (`rm -rf dist && npm run typecheck && npm
    test && node scripts/check-stage-host-isolation.mjs && npm run build`).
    `proven by:` the existing gate sequence command, unchanged.
    `strategy:` Fully-Automated.

## Capability Inventory — T2 Phases (Ordered By Blocking Rank)

This ordering follows the RESEARCH ranking of how many styles/features each
gap blocks (see `gameshow-engine-t2_RESEARCH_24-08-26.md` §5). Phase 1 is a
hard prerequisite for every other phase — nothing in phases 2-5 can be
implemented cleanly until the contract itself is revised.

| Phase | Capability | Depends on | Defects addressed | Status |
|---|---|---|---|---|
| **T2.1 — Contract revision** | Resolve the `StylePlugin`/`Intent`/`SessionState` under-specification: opaque per-style state slot, `buildBoard`/`isRoundComplete` receiving state, Intent/undo support for mid-turn style writes, `roundIndex` advancement. This is a coherent redesign of ONE interface, not four independent patches (per the backlog note's own recommendation). | Nothing — first phase | D3 (broadcast's unsafe cast is retired once styles are dispatched generically), D4 (custom-intent undo blindness fixed for style writes specifically) | **DELIVERED** (dca6b48) — CODE DONE, EVL-CLEAN, 1 Hybrid-tier human gate open (`INTENT_EVENT_NAMES` sign-off, AC#12) |
| **T2.2 — Multi-round shows** | `roundIndex` advance wired into the phase machine and host actions; `Round.intro`/`intermissionAfter`/`carryScores`/`eliminateLowest` actually consumed by the engine. | T2.1 (roundIndex Intent) | — | **DELIVERED** (d3a65f0, EVL confirmation def989a) — CODE DONE, EVL-CLEAN (96/96 adversarial checks), 1 human browser click-through open (see `tests/all-tests.md` Manual Gates) |
| **T2.3 — Remaining five styles** | `list`, `trivia`, `wheel`, `tictac`, `hangman` style plugins, each using the T2.1 contract for their style-specific state. | T2.1 (all five need the opaque state slot and state-aware `buildBoard`) | D1 (grid `selection` fixed in this phase too, since it's the same "style rule not enforced" class) |
| **T2.4 — Scoring breadth** | `speedWeighted`, `multiplier`, `comeback` scoring engines; streak bonus write path. | T2.1 only for streak's `TeamState.streak` write path — `speedWeighted`/`comeback` need no contract change (RESEARCH §3) | D2 (streak's slice of it — `attemptsUsed`/`lifelinesUsed` addressed in T2.5) |
| **T2.5 — Lifelines & special tiles** | Wire `LifelinePlugin`/`SpecialTilePlugin` call sites into `resolveAnswer` and the host-action surface; one worked lifeline, one worked special tile (wager). | T2.1 (lifeline use is itself a mid-turn write needing undo support) | D2 (remaining slice — `lifelinesUsed` write path) |

**D5 (GameEventName breadth)** is not assigned its own phase — it is folded
into T2.1/T2.2 as a byproduct: any new `Intent` variant added in those phases
(e.g. `advanceRound`) should map to an exact `GameEventName` where one exists,
narrowing the fallback count as a side effect rather than a standalone work
item. If no new variant naturally reduces the fallback count, it is carried
forward unchanged and named as such in the T2.1/T2.2 phase report — see AC #12.

## Out Of Scope

- **T3 input plugins** (keyboard/USB buzzer). Host-manual adjudication
  remains the only input path through all of T2, exactly as T1 declared.
- **T4 network/audience participation** (join codes, QR, websocket transport,
  latency-compensated buzz arbitration, player view/UI). No player-facing
  surface changes in T2.
- **Hosted/cloud deployment.** Runtime target remains a local laptop on the
  venue LAN; the transport interface stays pluggable but nothing is deployed
  to the internet in T2.
- **Redesigning `src/config/types.ts`'s already-authored style/scoring
  config shapes** (`GridStyle`, `ListStyle`, `TriviaStyle`, `WheelStyle`,
  `TicTacStyle`, `HangmanStyle`, `ScoringRules`). These are treated as
  settled input to T2 — the config schema stays fixed; only the
  `StylePlugin`/`Intent`/`SessionState` engine-side contract changes.
- **T5 items** — integration hooks (webhook/OBS/Discord) beyond the minimal
  `GameEventName` accuracy improvement noted under AC #12, persistence/
  autosave, accessibility depth, hosted transport, theming/preset library
  beyond `school-assembly.ts`.
- **A full resolution of all 11 unreachable `GameEventName` members.** T2
  narrows the fallback count only where a new Intent naturally provides an
  exact mapping (see AC #12); it does not attempt to invent Intent variants
  purely to plug event-name gaps that have no other T2 driver.
- **UI/visual work for the five new styles beyond what's needed to prove the
  acceptance criteria at the engine layer.** T2 as scoped here is an engine
  capability phase; stage/host component rendering for the new styles may be
  a separate downstream phase depending on INNOVATE/PLAN sequencing (flagged
  as an Open Question below, not decided here).

## Constraints

- **Same frontend stack as T1**: Vite + vanilla TypeScript, no UI framework
  (user-locked, inherited from T1 SPEC — not re-litigated here).
- **Local-first runtime**: no internet dependency at runtime; hosted
  deployment stays a later concern.
- **Do not redesign `src/config/types.ts`'s style/scoring config shapes.**
  They are settled input to T2 (see Out Of Scope). The contract work is
  scoped to `src/registry/index.ts` (`StylePlugin`, `Intent`,
  `SessionState`) and its consumers (`intents.ts`, `log.ts`, `session.ts`,
  `broadcast.ts`), not `config/types.ts`.
- **Four T1 invariants are still binding** (see AC #11 and restated in full
  below) — T2 must not regress any of them:
  1. The stage view stays fully playable with zero players connected.
  2. Content is snapshotted into the session at launch; a mid-session config
     edit must never mutate the live board.
  3. Scoring plugins are pure — `ScoringPlugin.score()` never mutates state.
  4. Answers are redacted at the transport boundary, never left to the view
     layer to hide.
- **Engine must never special-case a style or host request.** If a T2
  requirement can only be expressed as `if (round.style.kind === 'X')` inside
  generic engine code (outside the style plugin itself), that signals a
  contract gap in T2.1, not a license to special-case (same governing
  principle as the T1 SPEC).
- **One host press must still equal one undo press**, extended to every new
  style's mid-turn actions (AC #8) — this is the hard requirement T2.1 exists
  to make possible.
- **Existing T1 test files must not regress** (AC #1) — the contract revision
  in T2.1 is a genuine extension, not a breaking rewrite of T1's playable
  surface.

## Open Questions

None blocking SPEC completion. The following six items are genuine open
design questions surfaced by RESEARCH and are explicitly carried forward to
INNOVATE — they are not answered here because doing so would be an
implementation-approach decision, which is out of SPEC's scope.

1. **Does `SessionState.attemptsUsed` serve List's strike count**, or is
   List's strike concept semantically separate from the generic per-question
   attempt counter? Owner: INNOVATE.
2. **Where does the opaque per-style state slot live** — a new
   `SessionState` field, or a parameter threaded through the `StylePlugin`
   call signatures without living in `SessionState` at all? Owner: INNOVATE.
3. **Where does an in-flight (uncommitted) wager live** between the `wager`
   phase and question resolution? Owner: INNOVATE.
4. **Is `roundIndex` advancement a new `Intent` variant, or an extension of
   `setPhase`'s existing semantics?** Owner: INNOVATE.
5. **How does Hangman's continuous letter-guess micro-cycle fit the 11-state
   per-question phase machine** — new sub-phases, or one held phase with
   internal state? Owner: INNOVATE.
6. **Does `WheelStyle.segments[].categoryId` mean one segment maps to exactly
   one question, or to a whole category requiring a second content pick
   after the spin lands?** Owner: INNOVATE (may also need a user/show-author
   confirmation if INNOVATE can't resolve it from the schema alone).

Additionally flagged, non-blocking, for INNOVATE/PLAN sequencing (not an
open design question but a scope-boundary question): whether stage/host UI
rendering for the five new styles ships within T2 or as a follow-on phase —
see Out Of Scope.

## Background / Research Findings

Full detail: `gameshow-engine-t2_RESEARCH_24-08-26.md` (this task folder).
Condensed here for reviewer context.

- **T1 shipped exactly one style (grid), one scoring engine (flat), and one
  round.** Confirmed by direct inspection of `src/styles/`, `src/scoring/`,
  and `program.rounds[state.roundIndex]` never advancing (no `Intent` writes
  `roundIndex`).
- **Five newly found defects in shipped T1 code**, none known at T1 close:
  grid's `selection` config is stored but never enforced (D1); three
  `SessionState`/`TeamState` fields (`attemptsUsed`, `streak`,
  `lifelinesUsed`) are declared, initialized, and broadcast but have no write
  path anywhere (D2); `broadcast.ts` unconditionally force-casts
  `round.style as GridStyle` with no kind guard, which will break the moment
  a second style is registered (D3); `custom` intents are undo-blind by
  contract design, which is a fourth instance of the same under-specification
  pattern already named three times in the T2 backlog note (D4); the
  `GameEventName` fallback count is actually 6, not the 5 the backlog note
  estimated, and 11 of 19 `GameEventName` members are unreachable from any
  `Intent` today (D5).
- **Per-style requirements matrix** (full detail in RESEARCH §2): List needs
  a revealed-slot set + strike count; Trivia needs a persisted shuffle order
  (partial gap — no Intent needed, just a persistence channel); Wheel needs a
  pending spin result + consumed-segment set AND a new phase-machine state
  (no `'spin'` phase exists); TicTac needs a per-cell ownership map on a
  DIFFERENT axis from `consumed`, and its `isRoundComplete` is literally
  unimplementable today because ownership data is reachable from neither of
  its two arguments; Hangman is the hardest phase-fit case because its
  continuous letter-guess loop doesn't map to the one-cycle-per-question
  phase machine, and `buildBoard` never receives `state` so no call site has
  both guessed-letters and the real answer together.
- **The highest-value RESEARCH finding**: four of five unbuilt styles plus
  wager all want the same underlying capability — an opaque, undo-aware bag
  of per-round/per-question state that only the owning plugin interprets —
  but the actual data shape differs per consumer (set / map /
  scalar-plus-pending), so it must be opaque rather than a fixed schema.
  Separately, `buildBoard` needing state AND resolved content together
  recurs in every style including the already-shipped grid. These are two
  distinct decisions, not one, and INNOVATE should not conflate them.
- **Cross-cutting**: multi-round is a single real contract gap (no Intent
  touches `roundIndex`) riding on top of orchestration surfaces
  (`setPhase`, `eliminate`, `Round.carryScores`/`intro`/`intermissionAfter`)
  that already exist and have zero consumers. Scoring's `speedWeighted` and
  `comeback` need zero contract changes — only streak's write path and
  wager's storage slot are missing. Lifelines and special tiles have full
  interfaces but zero call sites; `resolveAnswer` calls `scoring.score()`
  directly with no hook for `SpecialTilePlugin.modifyScore`.
- **T1's own backlog note** (`gameshow-engine-t2-styleplugin-contract.md`)
  explicitly recommended treating gaps 1/2/4 (state slot, `buildBoard`
  state-blindness, `GameEventName` closed union) plus gap 3 (`roundIndex`)
  as ONE coherent contract redesign, not four independent patches — this
  SPEC's phase ordering (T2.1 first, blocking everything else) follows that
  recommendation directly.
- **T1's own closeout** (`gameshow-engine_CLOSEOUT_24-08-26.md` §6, §8)
  already flagged "T1 plays round 1 only" as a gap found during EXECUTE, not
  predicted by PLAN or VALIDATE, and explicitly routed it to "feeds T2
  contract backlog" — this SPEC is that routing landing.
