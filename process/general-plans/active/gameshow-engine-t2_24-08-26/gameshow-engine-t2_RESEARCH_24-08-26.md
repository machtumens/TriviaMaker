---
name: plan:gameshow-engine-t2-research
description: "RESEARCH findings for T2 (style/scoring/multi-round breadth) — transcribed by vc-spec-agent, not vc-research-agent"
date: 24-08-26
feature: general
---

# RESEARCH — Game Show Engine T2

> **Transcription note.** This is a condensed record of the T2 RESEARCH findings,
> written by the SPEC agent (which has Write access) because the research-agent
> session that produced these findings had no Write tool and could not persist
> its own output. Every claim below was independently re-verified against source
> by the orchestrator with `file:line` citations before being written here — this
> is not an unverified transcript.

## 1. Newly Found Defects in Shipped T1 Code

These were not known at T1 close. All five were independently re-verified against
current source.

**D1 — `grid.ts` does not implement `GridStyle.selection`.**
`grid.ts:76` stores `options.selection` into `board.meta.selection`, but
`availableQuestions` (`grid.ts:88-92`) filters every cell only by
`state.consumed`, with no reference to `selection` at all. `'sequential'` and
`'random'` therefore silently behave identically to `'freePick'`. This is the
exact "silent config divergence" class of bug that `flat.score()` already
guards against for `streak`/`comeback` (`src/scoring/flat.ts:28-41`, warns once
per process on an enabled-but-unimplemented rule) — the same guard pattern was
never applied to styles. Verified.

**D2 — Three `SessionState`/`TeamState` fields are declared and broadcast but
have zero write path.**
`SessionState.attemptsUsed` (`src/registry/index.ts:40`), `TeamState.streak`
and `TeamState.lifelinesUsed` (`src/registry/index.ts:48`) are all present in
the type, all initialized in `initialTeams`/`createSession`
(`src/engine/session.ts:68-78,103-125`), and all broadcast
(`src/engine/broadcast.ts:62,160` for `attemptsUsed`). `grep -n` over
`src/engine/intents.ts` — the ONLY file that mutates `SessionState`
(`applyIntent`, lines 107-167) — shows zero occurrences of any of these three
field names being written. Verified.

**D3 — `broadcast.ts:128` force-casts `round.style as GridStyle`.**
`const gridConfig = round.style as GridStyle` is unconditional — there is no
`round.style.kind === 'grid'` guard before it, and `gridConfig.pointLadder`
(line 132) is read straight off the cast. The only reason this hasn't broken is
that T1 registers and exercises exactly one style. It breaks the moment any
second style (`list`, `wheel`, `tictac`, `hangman`, `trivia`) is registered for
any round, because `broadcastState` is on the single unconditional code path
for every broadcast regardless of `round.style.kind`. Verified.

**D4 — `INTENT_TOUCHED_KEYS.custom = []` makes `custom` intents structurally
undo-blind.**
`src/engine/intents.ts:48` (`custom: []`) means the generic snapshot-diff undo
in `log.ts` (`applyIntentsWithLog`, lines 57-94) unions zero keys for any batch
containing a `custom` intent, so nothing is snapshotted for it and `undo()` has
no patch to restore. This is documented in the file's own comment as a known
T1 limitation, but it is the FOURTH instance of the same "closed contract hit
by more use cases than it was designed for" pattern the backlog note already
names three times (state slot, `buildBoard` state-blindness, content
addressing) — not previously counted as a fourth instance. Any style plugin
forced to route a mid-turn write through `custom` (because no purpose-built
`Intent` variant exists) silently loses undo for that action. Verified.

**D5 — `GameEventName` fallback count is 6, not 5.**
The backlog note (`gameshow-engine-t2-styleplugin-contract.md`, gap 4) states
"5 imprecise intent-to-event-name fallbacks." Direct count from
`src/engine/log.ts:30-43` (`INTENT_EVENT_NAMES`), by its own inline `// fallback`
comments: `setTurn → phase.changed`, `stopClock → question.armed`,
`playSound → phase.changed`, `effect → phase.changed`, `custom → phase.changed`,
and `eliminate → round.ended` — six fallback mappings, not five. (`eliminate`'s
fallback comment reads "closest semantic fit," which is still a fallback, just
without the word "fallback" attached — it was undercounted in the backlog
note.) Separately: of `GameEventName`'s 19 members
(`src/config/types.ts:778-788`), 11 are never the *target* of any
`INTENT_EVENT_NAMES` mapping at all (i.e. unreachable from any `Intent` today) —
`session.created`, `session.started`, `session.ended`, `player.joined`,
`player.left`, `player.kicked`, `round.started`, `answer.correct`,
`answer.wrong`, `answer.timeout`, `lifeline.used`. Verified by cross-referencing
the 19-member union against the 12 values actually assigned in
`INTENT_EVENT_NAMES`.

## 2. Requirements Matrix — Per Unbuilt Style

What each style must READ from state, what it must REMEMBER beyond the 12
generic `SessionState` fields, what it must WRITE that no `Intent` expresses
today, and whether the current contract supports it.

| Style | Must read | Must remember (beyond generic state) | Must write (no Intent today) | Contract support |
|---|---|---|---|---|
| **Grid** (`src/styles/grid.ts`) | `state.consumed` | — | — | Built, the worked reference (minus D1) |
| **List** (`ListStyle`, `types.ts:343-349`: `slots`, `strikesAllowed`, `revealOrder`, `showCounts`) | which slots are revealed, strike count | revealed-slot set + strike count per question | "reveal slot N", "record strike" | NOT supported — no Intent variant, no state slot |
| **Trivia** (`TriviaStyle`, `types.ts:367-371`: `questionOrder`) | resolved question order | persisted shuffle order | none new, but needs a stable place to persist the order — `buildBoard` (`grid.ts:32`, same signature for every style) recomputes from scratch on every call, so a naive `Math.random()` shuffle inside `buildBoard` reshuffles on every broadcast | PARTIAL — needs a persistence channel, not a new Intent |
| **Wheel** (`WheelStyle`, `types.ts:333-341`: `segments`, `spinDurationMs`, `consumeSegments`, `allowHostRig`) | pending spin result, consumed segments | pending spin result + consumed-segment set (segments are a DIFFERENT axis from questions — `segments[].categoryId` is optional, meaning one segment does not map 1:1 to one question) | "spin and land on segment X" | NOT supported — no Intent, AND no phase: the 11-state `Phase` machine (`src/registry/index.ts:23-26`, `src/engine/phase.ts:19-35`) has no `'spin'` state between `board` and `reading` |
| **TicTac** (`TicTacStyle`, `types.ts:352-358`: `size`, `winLength`, `stealSquareOnWrong`) | per-cell ownership | per-cell ownership map — a DIFFERENT axis from `consumed` (a cell can be asked-but-unsettled, and `stealSquareOnWrong` flips ownership on a WRONG answer, which is not "consumed") | ownership writes | NOT supported. `isRoundComplete(state, board)` (`StylePlugin` interface, `registry/index.ts:105`) is literally impossible to implement today: ownership data is reachable from neither its `state` nor `board` argument |
| **Hangman** (`HangmanStyle`, `types.ts:360-365`: `maxWrongLetters`, `showCategoryHint`, `allowWholeWordGuess`) | guessed-letter set, wrong-guess count, the real answer | guessed-letter set + wrong-guess count; must combine guessed letters with the real answer to build a masked label | letter-guess writes | NOT supported, hardest phase-fit case. `buildBoard(round: Round, options: O)` (`StylePlugin` interface, `registry/index.ts:97`) never receives `state`, so no single call site has both the guessed-letter state AND the resolved answer needed to build a masked label. Structurally: the 11-phase machine models one discrete cycle per QUESTION (`board → reading → armed → ... → reveal`); hangman is a continuous loop of letter-guess micro-turns against ONE word, which does not map cleanly onto that per-question cycle |

## 3. Cross-Cutting Findings

**Multi-round.** Exactly ONE real contract gap: no `Intent` variant touches
`roundIndex` (`SessionState.roundIndex`, `registry/index.ts:33`, is `readonly`
and has no corresponding case in `applyIntent`, `intents.ts:107-167`). Every
other multi-round mechanism already exists and needs orchestration, not new
contract surface: `setPhase` can already legally reach `roundIntro` and
`intermission` (`phase.ts:20,33`); the `eliminate` Intent already works
(`intents.ts:159-163`); `Round.carryScores` (`types.ts:669`), `Round.intro`
(`types.ts:655`), and `Round.intermissionAfter` (`types.ts:657`) are typed
config fields with zero current consumers anywhere in `src/engine/`.

**Scoring.** `speedWeighted` and `comeback` need ZERO contract changes.
`ScoreInput.elapsedMs` is already populated at every call site
(`session.ts:216-217,225`) and `ScoreInput.state.teams` already carries every
team's current score (`registry/index.ts:141`, `state: SessionState`) — both
new scoring engines are pure functions of data already present. Only two gaps:
`streak`'s write path (covered by D2 above — `TeamState.streak` has no writer)
and wager's storage slot (`ScoreInput.wager` — `registry/index.ts:149` — is
already plumbed end-to-end from `ResolveAnswerInput.wager`,
`session.ts:48,227`, through to `scoring.score()`, but there is no place to
STORE an in-flight wager between "team commits a wager" and "question is
resolved," since that happens across the `wager` phase boundary,
`phase.ts:32`).

**Lifelines / special tiles.** `LifelinePlugin` and `SpecialTilePlugin`
interfaces exist in full (`config/types.ts` §5, mirrored in
`registry/index.ts:196-211`) but have ZERO call sites anywhere in
`src/engine/`. `resolveAnswer` (`session.ts:203-243`) calls
`scoring.score()` directly (line 219) with no hook for
`SpecialTilePlugin.modifyScore` to intercept the resulting deltas.

## 4. The Highest-Value Finding: One Common Shape, Two Decisions

Four of the five unbuilt styles (list, wheel, tictac, hangman) plus wager all
want the same thing: an **opaque, undo-aware bag of state scoped to the
current round or question that only the owning plugin interprets.** But the
actual SHAPE of that bag genuinely differs per consumer — a `Set` for
list/hangman, a `Map` for tictac, a scalar-plus-pending value for wheel/wager —
so a single fixed schema cannot serve all of them; it has to be opaque to the
engine.

Separately — and this is a DIFFERENT decision, not the same one — `buildBoard`
needing both `state` AND resolved content together in one call recurs in
EVERY style, including the already-built grid (T1 worked around this by
deriving `consumed` in `broadcast.ts:87-95` instead of inside
`grid.buildBoard` itself, per the file's own header comment,
`broadcast.ts:15-22`).

**These are two decisions, not one**, and INNOVATE should not conflate them:
(1) where does opaque per-style state live and how does it interact with
undo, and (2) what does `buildBoard`'s (and `isRoundComplete`'s) signature
need to look like so a style can see state and resolved content at once.

## 5. Ranking — Styles/Features Blocked Per Gap

| Rank | Gap | Styles/features blocked |
|---|---|---|
| 1 | Opaque style-state slot | 5 (list, trivia*, wheel, tictac, hangman) |
| 2 | `buildBoard`/`isRoundComplete` receiving `state` | 5 (all unbuilt styles) |
| 3 | Intent/undo support for mid-turn style writes | 4 (list, wheel, tictac, hangman) |
| 4 | `roundIndex` Intent | blocks every style past round 1 (cross-cutting, not style-specific) |
| 5 | Lifeline/special-tile call sites | 2 features (lifelines, special tiles/wager) |
| 6 | Content-channel addressing beyond `Category[]` | 3 (wheel segments, tictac cells, hangman single word) |
| 7 | `GameEventName` breadth (D5) | 0 styles — integration-hook precision only |
| 8 | Streak write path (D2, partial) | 1 feature (streak bonus scoring) |

*Trivia is listed under rank 1/2 as PARTIAL — it needs a persistence channel
for shuffle order but not the full mid-turn-write/undo machinery the other
four need.

## 6. Six Open Questions Carried to INNOVATE

1. Should `SessionState.attemptsUsed` serve List's strike count, or is List's
   strike concept semantically separate from the generic per-question attempt
   counter?
2. Should the opaque per-style state slot be a new `SessionState` field, or a
   parameter threaded through the `StylePlugin` call signatures without
   living in `SessionState` at all?
3. Where does an in-flight (uncommitted) wager live between the `wager` phase
   and question resolution?
4. Is `roundIndex` advancement a new `Intent` variant, or an extension of the
   existing `setPhase` intent's semantics?
5. How does Hangman's continuous letter-guess micro-cycle fit the 11-state
   per-question phase machine — a new set of sub-phases, or one held phase
   with internal state?
6. Does `WheelStyle.segments[].categoryId` mean one segment maps to exactly
   one question, or to a whole category requiring a second content pick after
   the spin lands?

## Source Files Consulted

- `src/registry/index.ts` (full read)
- `src/config/types.ts` (relevant sections: styles §6, scoring §8, round
  program §11, integration §14)
- `src/styles/grid.ts` (full read)
- `src/engine/session.ts`, `src/engine/broadcast.ts`, `src/engine/intents.ts`,
  `src/engine/log.ts`, `src/engine/phase.ts` (full reads)
- `src/scoring/flat.ts` (full read)
- `process/general-plans/backlog/gameshow-engine-t2-styleplugin-contract.md`
- `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_SPEC_24-08-26.md`
  (T0-T5 capability inventory)
- `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_CLOSEOUT_24-08-26.md`
  (§6 Known Gaps, §8 follow-ups)
- `process/context/all-context.md`, `process/context/tests/all-tests.md`
