---
name: plan:gameshow-engine-t2.2
description: "T2.2 — multi-round shows: bound advanceRound, wire the round boundary (carryScores/intro/intermissionAfter/eliminateLowest/minTeams), host actions for advancing/ending, demo-t1 round 2 reachable, minimal finale"
date: 27-08-26
feature: general
phase: "T2.2"
---

# T2.2 — Multi-Round Shows: PLAN

**Date**: 27-08-26
**Status**: PLAN written, VALIDATE expected to be skipped per user direction (T2.1 precedent) — not yet executed
**Complexity**: COMPLEX

## TL;DR

T2.2 wires `advanceRound` (added but unused in T2.1) into a real, bounded,
undo-atomic "Next Round" host action, plus a separate "End Show" action for
the last round. One host click = one `dispatchHostAction` batch = one
`undo()` press, covering elimination, score-reset, round-skipping
(`minTeams`), and the entry-phase decision (`intermission`/`roundIntro`/
`board`) together. Exactly **one** `src/registry/index.ts`-adjacent change is
needed and it is NOT to the registry: one missing `PHASE_TRANSITIONS` edge
(`reveal -> roundIntro`) in `src/engine/phase.ts`. `src/config/types.ts` and
`src/registry/index.ts` are untouched. 12 files change; ~23 checklist items;
zero new runtime dependencies; zero new `Intent` variants (all new behavior
is built from `eliminate`, `awardPoints`, `advanceRound`, `setPhase` — intents
that already exist).

VALIDATE is expected to be skipped for this phase (as it was for T2.1, at
user direction) — this plan is written to be executed directly with no
judgement calls left for EXECUTE.

## Overview

T2.1 added `SessionState.roundIndex`-advancing capability (`advanceRound`
intent) and a `styleState` scratch slot but wired neither into a live host
action — confirmed genuinely unreachable in T1/T2.1 (no dispatch call site
anywhere in application code). It also shipped `advanceRound` **unbounded**:
`roundIndex + 1` has no upper-bound check, so a double-click or any future
caller can push `roundIndex` past `program.rounds.length - 1`; the failure
does not surface at the intent itself, it surfaces on the **next**
`broadcastState` call (`currentRound` throws), which is a live-show-ending
crash, not a rejected click. This is backlog item 1
(`process/general-plans/backlog/gameshow-engine-t2.2-blockers.md`) and it
explicitly gates T2.2 planning.

T2.2's job, per the T2 SPEC's Capability Inventory row for this phase: wire
`roundIndex` advance into the phase machine and host actions, and make
`Round.intro` / `Round.intermissionAfter` / `Round.eliminateLowest` /
`Round.minTeams` / `program.carryScores` actually consumed by the engine —
today all five are authored fields with zero engine effect (confirmed:
`demo-t1.ts` authors two rounds and `program.finale`, and none of it does
anything because `advanceRound` was never dispatched and `program.finale`
is never read).

This plan is round-**boundary** orchestration only. It does not touch style
plugins, scoring engines, lifelines, special tiles, or grid's `selection`
defect (all explicitly out of scope per the orchestrator's task framing and
the T2 SPEC's phase-to-capability mapping).

## Goals

1. Bound `advanceRound` at both the layer that decides whether to dispatch it
   (session.ts) and the layer that applies it (intents.ts) — belt and
   braces, per backlog item 1 and the ORCHESTRATOR DECISIONS.
2. Wire one real "Next Round" host action that, in a single
   `dispatchHostAction` batch: applies `Round.eliminateLowest` (with tie
   handling that never auto-eliminates), applies `program.carryScores`'s
   score-reset, applies `Round.minTeams`'s round-skip, advances
   `roundIndex`, and lands on the correct entry phase
   (`intermission`/`roundIntro`/`board`) given `Round.intermissionAfter` and
   the entered round's `Round.intro`.
3. Wire a separate "End Show" host action for the last round that reaches
   `final` without ever calling `advanceRound` (so `roundIndex` never moves
   past the last valid index).
4. Make `demo-t1.ts`'s round 2 actually reachable end to end (its own two
   authored rounds, no preset content changes required).
5. Give the `final` phase a minimal, real (not stale/broken) rendering on
   both host and stage.
6. Add the one missing `PHASE_TRANSITIONS` edge this requires
   (`reveal -> roundIntro`), verified against the full edge list needed by
   this plan's design — not invented ad hoc.

## Scope

**In scope:**
- `src/engine/phase.ts` — one new transition edge.
- `src/engine/intents.ts` — bound `advanceRound`'s `applyIntent` case.
- `src/engine/session.ts` — new `advanceToNextRound` function (the whole
  round-boundary decision, returning an `Intent[]` for one host-action
  batch).
- `src/server.ts` — two new host commands (`advanceRound`, `continue`)
  wired to `intentsForCommand`; existing `endRound`/`next` unchanged.
- `src/host/main.ts` — host UI: distinguish "Next Round" from "End Show",
  surface tie-break choices, add a "Continue" control for
  `roundIntro`/`intermission`, minimal `final`-phase rendering.
- `src/stage/main.ts` — minimal `final`-phase rendering.
- `presets/demo-t1.ts` — doc-comment update only (the stale "T1 plays round
  1 only" note); zero config changes.
- Test files: `src/engine/phase.test.ts`, `src/engine/intents.test.ts`,
  `src/engine/session.test.ts`, `src/engine/log.test.ts`,
  `src/engine/host-manual-round.test.ts`.

**Out of scope (do not drift):**
- No new style plugins (T2.3), no scoring engines (T2.4), no lifelines or
  special tiles (T2.5), no fix to grid's `selection`/Defect D1 (T2.3), no
  input plugins.
- No change to `src/config/types.ts` or `src/registry/index.ts`.
- No rich UI/visual treatment for `roundIntro`/`intermission`/`final`
  (timed title cards, podium animation, dramatic reveal) — this is an
  engine-capability phase per the T2 SPEC's own Out-of-Scope line; host/stage
  changes here are the minimum needed to prove the round boundary actually
  works, not a presentation pass.
- No wiring of `Round.intro`/`Round.minTeams` for **round 1's own entry**
  from `lobby` (the `start` command still hardcodes `phase: 'board'`) — that
  is a pre-existing T1 gap, not a round *boundary*, and is named explicitly
  in Open Items rather than silently fixed or silently ignored.
- No `program.finale.style`/`dramaticReveal`/`showStats`-driven branching —
  the `final` phase gets one minimal, real rendering, not a per-style finale
  system (that would be new style-plugin-shaped complexity, explicitly out
  of scope).

## Design Locks (read before the checklist)

| Lock | Rule |
|---|---|
| **T2.2-L1 — `advanceRound` bounded at two independent layers** | Layer A (dispatch-time, `session.ts`'s `advanceToNextRound`): throws before any intent is built if `state.roundIndex >= program.rounds.length - 1` — the command is rejected, no `dispatchHostAction` call happens, no `seq` is consumed. Layer B (apply-time, `intents.ts`'s `applyIntent` `advanceRound` case): no-ops (`return { ...state }`, no `roundIndex`/`styleState` change) if `roundIndex + 1` would exceed `program.rounds.length - 1`. Layer B is the defensive backstop for any future caller that reaches `applyIntent` directly without going through Layer A — it must never itself be the only thing standing between a click and a crashed broadcast. See backlog item 1. |
| **T2.2-L2 — elimination is in the SAME batch as the advance** | `Round.eliminateLowest`'s `eliminate` intent (when it fires) is one element of the SAME `Intent[]` array `advanceToNextRound` returns, dispatched through ONE `dispatchHostAction` call. One `undo()` reverses the elimination and the advance together. Elimination is never a separate, earlier host action. |
| **T2.2-L3 — ties are never auto-resolved** | If 2+ teams are tied for lowest score when `Round.eliminateLowest` is true, `advanceToNextRound` throws (no dispatch happens) unless `input.eliminateTeamId` names one of the tied candidates. The host UI pre-computes the tie client-side (from data it already has) and offers one button per tied team; it does not wait for the server to reject a blind click. See host-facing behaviour in Section E. |
| **T2.2-L4 — `carryScores: false` resets scores in the SAME batch** | When `program.carryScores` is `false`, `advanceToNextRound` includes one `awardPoints` intent per team with a non-zero score (`delta: -team.score`), in the same batch as the advance. One `undo()` restores every team's pre-reset score together with the round advance. |
| **T2.2-L5 — `minTeams` skips rounds, expressed as repeated `advanceRound` intents in one batch** | Per `Round.minTeams`'s own doc comment ("Skip this round if fewer than n teams remain"), `advanceToNextRound` walks forward past any round whose `minTeams` exceeds the post-elimination remaining-team count, and pushes ONE `{ type: 'advanceRound' }` intent per round skipped, all in the same batch (the batch-union undo already handles a batch containing the same intent type more than once — no new mechanism needed). If every remaining round fails its `minTeams` check, the show ends: `advanceToNextRound` pushes a single `setPhase('final')` and **zero** `advanceRound` intents, leaving `roundIndex` unchanged (and therefore always valid — `broadcastState` unconditionally reads `config.program.rounds[state.roundIndex]` regardless of phase, even in `final`). |
| **T2.2-L6 — "End Show" never calls `advanceRound`** | The existing `endRound` command's implementation (`[{ type: 'setPhase', phase: 'final' }]`) is UNCHANGED. It is available on any round (host discretion to end early, matching existing T1/T2.1 behavior — not newly restricted), but the host UI now offers it as the primary action only when the current round is the program's last round. Ending on a non-last round never advances `roundIndex`, so it always points at a real, playable round. |
| **T2.2-L7 — one new `PHASE_TRANSITIONS` edge, verified not invented** | Every edge this plan's design needs was checked against the current table: `reveal -> intermission` (exists), `reveal -> board` (exists), `reveal -> final` (exists), `intermission -> roundIntro` (exists), `intermission -> board` (exists), `roundIntro -> board` (exists). Exactly ONE edge is missing: `reveal -> roundIntro` (needed when the just-completed round has no `intermissionAfter` but the next round entered has `intro.enabled`). This is the only `phase.ts` change in this plan. |
| **T2.2-L8 — `CopyStrings` reuse, not new fields (types.ts frozen)** | No new `copy.host.*` string exists for "Next Round"/"End Show"/"Continue" (types.ts is not editable this phase). `copy.host.next` is reused for "Next Round" (complete + more rounds remain), `copy.host.endRound` is reused for "End Show" (complete + last round) — these ARE two different labels shown in mutually exclusive situations, satisfying "advancing and ending are different actions with different labels" without a schema change. `copy.host.skip` (default `"Skip"`, currently unused anywhere in the codebase) is reused for the `roundIntro`/`intermission` "Continue" control. Documented here as a deliberate, disclosed compromise — see Open Items for the follow-up recommendation. |
| **T2.2-L9 — round 1's own `intro`/`minTeams` stay unwired (disclosed, not silent)** | The `start` command (`lobby -> board`) is untouched. This is a pre-existing T1 gap (round 1's `intro: {enabled:true}` in `demo-t1.ts` has never been shown), not a round *boundary* — fixing it would require touching the show-open path, which is outside "round-boundary orchestration ONLY." Named in Open Items, not silently dropped. |
| **T2.2-L10 — `buildBoard`/`isRoundComplete` single-call-site lock (T1 L9/L17) is preserved** | `advanceToNextRound` does NOT call `style.buildBoard(...)` or `style.isRoundComplete(...)` to re-verify the round is actually complete before advancing — only `broadcastState` may call `buildBoard`. `advanceToNextRound` trusts the host UI's gating (`payload.round.isComplete`, already computed and shipped by `broadcastState`), the same trust depth every other host command in `server.ts` already uses (e.g. `resolveAnswer` does not re-verify `currentQuestionId` was legitimately armed). It DOES cheaply verify `state.phase === 'reveal'` (a string comparison, no `buildBoard` needed) as a defensive floor. |
| **T2.2-L11 — `final` phase gets one minimal rendering, not a style system** | Host and stage both gate on `payload.phase === 'final'` to show a plain "show complete" message plus the ALREADY-existing, ALREADY-unconditional score displays (`renderScores`/`renderScoreboard`), instead of a stale frozen board. `program.finale.style`/`dramaticReveal`/`showStats` are not read anywhere in this plan — reading them to drive different finale treatments is new style-plugin-shaped complexity, explicitly deferred (Open Items). |

## Touchpoints

| File | Change | Depends on |
|---|---|---|
| `src/engine/phase.ts` | MODIFIED — one new `PHASE_TRANSITIONS` edge (T2.2-L7) | — |
| `src/engine/phase.test.ts` | MODIFIED — one new explicit assertion for the new edge | `phase.ts` |
| `src/engine/intents.ts` | MODIFIED — bound the `advanceRound` `applyIntent` case (T2.2-L1 layer B) | `registry/index.ts` (read-only) |
| `src/engine/intents.test.ts` | MODIFIED — new multi-round config fixture; existing `advanceRound` blocks updated to use it; one new boundary no-op test | `intents.ts` |
| `src/engine/session.ts` | MODIFIED — new exported `advanceToNextRound` function + `AdvanceRoundInput` type; `Phase` added to an existing import | `phase.ts` (new edge), `intents.ts` (bound check), `registry/index.ts` (read-only, existing `Intent`/`SessionState`/`TeamState` types only) |
| `src/engine/session.test.ts` | MODIFIED — new test block covering `advanceToNextRound`'s full branch matrix | `session.ts` |
| `src/engine/log.test.ts` | MODIFIED — one new case proving a full round-boundary batch (eliminate + score-reset + advanceRound + setPhase) reverses in exactly one `undo()` | `log.ts` (unchanged), hand-built intents only |
| `src/engine/host-manual-round.test.ts` | MODIFIED — extended to 2 rounds proving round 2 is reachable end to end; new demo-t1 preset smoke-check block | `session.ts`, `presets/demo-t1.ts` (read-only import) |
| `src/server.ts` | MODIFIED — two new `intentsForCommand` cases (`advanceRound`, `continue`); `endRound`/`next` unchanged | `session.ts` |
| `src/host/main.ts` | MODIFIED — `renderControls` reveal-phase split (Next Round / End Show / tie buttons), new `roundIntro`/`intermission` Continue control, `final`-phase render change | `server.ts`'s command surface (client-side wire-protocol match, no shared code) |
| `src/stage/main.ts` | MODIFIED — `final`-phase render change | none (payload shape unchanged) |
| `presets/demo-t1.ts` | MODIFIED — doc-comment only, no config change | — |

**Files explicitly NOT touched:** `src/config/types.ts`, `src/config/defaults.ts`, `src/config/resolve.ts`, `src/registry/index.ts`, `src/registry/bootstrap.ts`, `src/engine/broadcast.ts`, `src/styles/grid.ts`, `src/scoring/flat.ts`, `src/transport/local.ts`, all `*.test.ts` files not named above.

## Public Contracts

- **New exported function** `src/engine/session.ts`: `advanceToNextRound(state: SessionState, input?: AdvanceRoundInput): Intent[]`, plus `export interface AdvanceRoundInput { eliminateTeamId?: string }`. This is the round-boundary decision function, analogous in shape and trust level to the existing `resolveAnswer`.
- **New wire-protocol commands** (client → server, via the existing `/command` HTTP endpoint, `intentsForCommand`'s `type` field): `'advanceRound'` (payload: `{ eliminateTeamId?: string }`, optional) and `'continue'` (no payload). Both route through the existing single `dispatchHostAction` call site in `server.ts` — no new dispatch mechanism.
- **`PHASE_TRANSITIONS` gains one edge**: `reveal -> roundIntro`. `Phase` itself (the union type) does not change — only which transitions are legal.
- **No `registry/index.ts` contract changes.** No new `Intent` variant, no `StylePlugin`/`ScoringPlugin`/`SessionState` shape change. All new behavior is built from the four intents that already exist (`eliminate`, `awardPoints`, `advanceRound`, `setPhase`).
- **`BroadcastPayload` unchanged.** The host UI's tie-detection and last-round detection read fields already present (`payload.teams`, `payload.roundIndex`, `payload.config.program.rounds`) — no new field is added to the wire payload.

## Blast Radius

- Single package (no monorepo boundary), 12 files touched, 0 files created, 0 files deleted.
- No schema, auth, billing, or public-API-contract surface touched (no HTTP route shapes change — `/command`'s existing envelope, `{type, payload, token}`, already accommodates the two new command types with no transport-layer change).
- No new runtime dependency (`package.json` untouched).
- Risk class: **engine + client UI wiring**, not a schema/migration/auth/billing class. The highest-risk item in this plan is undo-atomicity correctness for a 4-effect batch (elimination + score-reset + multi-`advanceRound` + `setPhase`) — a correctness risk, not a security/data-loss risk (the log is append-only; a wrong undo result is recoverable by inspecting `state.log`, not a silent data loss).

## Five Invariants — how T2.2 preserves each

| # | Invariant | How T2.2 preserves it |
|---|---|---|
| 1 | Stage stays playable with zero players connected | No player/input-plugin code touched. Stage's `final`-phase change is a pure rendering branch on data it already receives. |
| 2 | Content snapshotted at launch | `createSession`'s `structuredClone` is untouched; `advanceToNextRound` reads `state.config.program.rounds`, which is already the launch-time snapshot. |
| 3 | Scoring plugins pure | Not touched — score-reset uses `awardPoints` intents (already-existing, already-pure-application machinery in `applyIntent`), not a scoring plugin call. |
| 4 | Answers redacted at the transport boundary | `broadcastState` is untouched; nothing in this plan adds a new `.broadcast(...)` call site or a new `buildBoard(...)` call site (T2.2-L10). |
| 5 | `styleState` is server-only, never on `BroadcastPayload` | Untouched. `advanceToNextRound` does not read or write `styleState` directly — it delegates to the existing `advanceRound` intent, which already clears it. |

## Implementation Checklist

### Section A — Phase machine (`src/engine/phase.ts`)

1. In `PHASE_TRANSITIONS` (current lines 19-35), change the `reveal` row from
   `reveal: ['board', 'intermission', 'final'],` to
   `reveal: ['board', 'intermission', 'roundIntro', 'final'],` (T2.2-L7). No
   other row changes — every other edge this plan needs already exists (see
   T2.2-L7's verified edge list).

### Section B — Intent bound (`src/engine/intents.ts`)

2. In `applyIntent`'s `switch` (current lines 111-181), replace the
   `case 'advanceRound':` body (current lines 174-177) with:
   ```
   case 'advanceRound': {
     // T2.2-L1 layer B: belt-and-braces bound. session.ts's
     // advanceToNextRound (layer A) is expected to prevent this from ever
     // being reached out of range in normal operation — this no-op is the
     // defensive backstop so a future direct-dispatch caller can never push
     // roundIndex past the last valid program.rounds index. See backlog
     // item 1 / gameshow-engine-t2.2-blockers.md.
     const nextIndex = state.roundIndex + 1
     if (nextIndex > state.config.program.rounds.length - 1) return { ...state }
     // Clearing `styleState` here is the engine-level safety net against
     // one round's style state bleeding into the next (see `SessionState`).
     return { ...state, roundIndex: nextIndex, styleState: {} }
   }
   ```
   No signature change, no `INTENT_TOUCHED_KEYS`/`INTENT_EVENT_NAMES` change
   (both already correct from T2.1 — `advanceRound: ['roundIndex',
   'styleState']` and `advanceRound: 'round.started'` remain accurate: a
   no-op still touches neither key, which is consistent with
   `INTENT_TOUCHED_KEYS` describing the maximum keys an intent CAN touch,
   not a per-call guarantee — matching the existing `setPhase`/`assertTransition`-throws
   precedent where a rejected call also touches nothing).

### Section C — Round-boundary orchestration (`src/engine/session.ts`)

3. In the existing import from `'../registry/index'` (current lines 18-22:
   `resolve, type GameEvent, type Intent, type ScoringPlugin, type
   SessionState, type StylePlugin, type TeamState`), add `type Phase` to the
   named imports.
4. Directly below the existing `ResolveAnswerInput` interface (current lines
   42-49), add:
   ```
   export interface AdvanceRoundInput {
     /** Required only when Round.eliminateLowest is true AND the lowest score is tied between 2+ teams. */
     eliminateTeamId?: string
   }
   ```
5. At the end of the file, directly after `resolveAnswer` (current lines
   204-245), add a new exported function:
   ```
   export function advanceToNextRound(state: SessionState, input: AdvanceRoundInput = {}): Intent[] {
     if (state.phase !== 'reveal') {
       throw new Error(`[session] advanceToNextRound: phase must be "reveal", got "${state.phase}"`)
     }

     const round = currentRound(state.config, state.roundIndex)
     const rounds = state.config.program.rounds
     if (state.roundIndex >= rounds.length - 1) {
       throw new Error(
         `[session] round "${round.id}" is the last round; call "endRound" (setPhase: 'final'), not "advanceRound"`,
       )
     }

     const intents: Intent[] = []
     let remainingCount = state.teams.filter(t => !t.eliminated).length

     if (round.eliminateLowest) {
       const remaining = state.teams.filter(t => !t.eliminated)
       if (remaining.length > 1) {
         const lowestScore = Math.min(...remaining.map(t => t.score))
         const candidates = remaining.filter(t => t.score === lowestScore)
         let chosen: TeamState | undefined
         if (candidates.length === 1) {
           chosen = candidates[0]!
         } else {
           chosen = input.eliminateTeamId
             ? candidates.find(t => t.id === input.eliminateTeamId)
             : undefined
           if (!chosen) {
             const names = candidates.map(t => `${t.name} (${t.id})`).join(', ')
             throw new Error(
               `[session] round "${round.id}": eliminateLowest tie between ${candidates.length} teams — ${names}. Resend "advanceRound" with eliminateTeamId set to one of these ids.`,
             )
           }
         }
         intents.push({ type: 'eliminate', teamId: chosen.id })
         remainingCount -= 1
       }
     }

     if (!state.config.program.carryScores) {
       for (const team of state.teams) {
         if (team.score !== 0) {
           intents.push({
             type: 'awardPoints', teamId: team.id, delta: -team.score,
             reason: 'round boundary: scores reset (program.carryScores is false)',
           })
         }
       }
     }

     let candidateIndex = state.roundIndex + 1
     while (
       candidateIndex < rounds.length
       && rounds[candidateIndex]!.minTeams !== undefined
       && remainingCount < rounds[candidateIndex]!.minTeams!
     ) {
       candidateIndex++
     }

     const enteredRound = rounds[candidateIndex]
     if (!enteredRound) {
       // Every remaining round failed its minTeams requirement — nothing is
       // left to play. End the show WITHOUT moving roundIndex: broadcastState
       // always reads config.program.rounds[state.roundIndex], so roundIndex
       // must stay valid (T2.2-L1/L5). Elimination/score-reset above still
       // apply; only the round-index advance and entry-phase steps are
       // skipped.
       intents.push({ type: 'setPhase', phase: 'final' })
       return intents
     }

     const advances = candidateIndex - state.roundIndex
     for (let i = 0; i < advances; i++) intents.push({ type: 'advanceRound' })

     const target: Phase = round.intermissionAfter?.enabled
       ? 'intermission'
       : enteredRound.intro?.enabled ? 'roundIntro' : 'board'
     intents.push({ type: 'setPhase', phase: target })

     return intents
   }
   ```
   Note the `!` non-null assertions on `candidates[0]`,
   `rounds[candidateIndex].minTeams` inside the bounds-proven `while`
   condition: required under `tsconfig.json`'s `noUncheckedIndexedAccess`,
   matching the existing codebase convention (e.g. `log.ts`'s
   `registries.get(kind)!`) of asserting only where correctness is already
   proven by the surrounding control flow.

### Section D — Command wiring (`src/server.ts`)

6. In the existing import from `'./engine/session'` (current lines 26-28:
   `createSession, currentRound, dispatchHostAction, resolveAnswer,
   styleKeyFor`), add `advanceToNextRound`.
7. In `intentsForCommand`'s `switch` (current lines 87-126), insert two new
   `case` branches between the existing `case 'next':` (line 112-113) and
   `case 'endRound':` (line 115-116):
   ```
   case 'advanceRound': {
     const eliminateTeamId = typeof fields['eliminateTeamId'] === 'string' ? fields['eliminateTeamId'] : undefined
     return advanceToNextRound(state, { eliminateTeamId })
   }

   case 'continue': {
     if (state.phase === 'intermission') {
       const round = currentRound(state.config, state.roundIndex)
       return [{ type: 'setPhase', phase: round.intro?.enabled ? 'roundIntro' : 'board' }]
     }
     if (state.phase === 'roundIntro') return [{ type: 'setPhase', phase: 'board' }]
     throw new Error(`[server] "continue" is not valid from phase "${state.phase}"`)
   }
   ```
   `case 'endRound':` and `case 'next':` bodies are unchanged (current lines
   112-113, 115-116). No other case is touched.

### Section E — Host controller (`src/host/main.ts`)

8. Directly below the existing `import type { BroadcastPayload } from
   '../engine/broadcast'` (current line 16), add two local type aliases
   (no new import lines — derives from the existing `BroadcastPayload`
   type):
   ```
   type HostTeam = BroadcastPayload['teams'][number]
   type HostRoundConfig = BroadcastPayload['config']['program']['rounds'][number]
   ```
9. Directly above `renderControls` (current line 143), add a new helper:
   ```
   function eliminationTieCandidates(round: HostRoundConfig | undefined, teams: readonly HostTeam[]): HostTeam[] | null {
     if (!round?.eliminateLowest) return null
     const remaining = teams.filter(t => !t.eliminated)
     if (remaining.length <= 1) return null
     const lowestScore = Math.min(...remaining.map(t => t.score))
     return remaining.filter(t => t.score === lowestScore)
   }
   ```
10. In `renderControls` (current lines 143-185), insert a new early-return
    case directly after the existing `lobby` block (current lines 146-149):
    ```
    if (payload.phase === 'roundIntro' || payload.phase === 'intermission') {
      row.append(button(payload.copy.host.skip, 'primary', () => { void send('continue') }))
      return row
    }
    ```
11. Replace the existing `reveal` block (current lines 172-182) with:
    ```
    if (payload.phase === 'reveal') {
      if (!payload.round.isComplete) {
        row.append(button(payload.copy.host.next, 'primary', () => { void send('next') }))
      } else {
        const isLastRound = payload.roundIndex >= payload.config.program.rounds.length - 1
        if (isLastRound) {
          row.append(button(payload.copy.host.endRound, 'primary', () => { void send('endRound') }))
        } else {
          const round = payload.config.program.rounds[payload.roundIndex]
          const candidates = eliminationTieCandidates(round, payload.teams)
          if (candidates && candidates.length > 1) {
            for (const team of candidates) {
              row.append(button(
                `Eliminate ${team.name} & continue`, 'wrong',
                () => { void send('advanceRound', { eliminateTeamId: team.id }) },
              ))
            }
          } else {
            row.append(button(payload.copy.host.next, 'primary', () => { void send('advanceRound') }))
          }
        }
      }
    }
    ```
12. In `render()` (current lines 222-259), replace the unconditional "Board"
    heading + `renderBoard`/no-renderer-banner block (current lines 247-252)
    with:
    ```
    if (payload.phase === 'final') {
      next.append(el('div', 'banner', 'Show complete — final scores below.'))
    } else {
      next.append(el('h2', undefined, 'Board'))
      if (payload.round.hostComponent === 'grid-host-board') {
        next.append(renderBoard(payload))
      } else {
        next.append(el('div', 'banner', `No host renderer for "${payload.round.hostComponent}"`))
      }
    }
    ```
    The `Scores` section and `renderUndoDock()` calls directly below (current
    lines 254-256) are unchanged — they already run unconditionally on every
    phase, including `final`.

### Section F — Stage view (`src/stage/main.ts`)

13. In `render()` (current lines 162-176), replace the unconditional
    `next.append(renderBoardFor(payload))` (current line 167) with:
    ```
    if (payload.phase === 'final') {
      next.append(el('h1', 'title', 'Show Complete'))
    } else {
      next.append(renderBoardFor(payload))
    }
    ```
    Reuses the existing `'title'` class already applied to `payload.round.title`
    inside `renderRoundBar` — no new CSS class needed. `renderScoreboard`
    (current line 168, unconditional) and `renderQuestionOverlay` (already
    gated on `QUESTION_PHASES`, which excludes `final`) are unchanged.

### Section G — Preset documentation (`presets/demo-t1.ts`)

14. Update the file's header comment (current lines 13-17):
    ```
     * T1 limitation worth knowing before you author more: there is no intent that
     * changes `roundIndex`, so a T1 show plays ROUND 1 only. Round 2 below is
     * authored so the preset is a realistic example and is ready the moment round
     * progression lands.
    ```
    is replaced with:
    ```
     * Both rounds below are playable: T2.2 wires round advancement into the
     * host's "Next Round"/"Continue" actions (server.ts's `advanceRound`/
     * `continue` commands), so this preset plays start to finish — round 1,
     * its authored `intro`-less-but-round-2-has-intro boundary (exercises
     * `reveal -> roundIntro` directly, no intermission), round 2, then the
     * host's "End Show" action.
    ```
    No change to the exported `demoT1` object (teams, rounds, content,
    `program.finale`, etc. are all untouched — round 2 becomes reachable
    purely through engine/host wiring elsewhere in this plan, not through any
    preset content edit).

### Section H — Existing test file updates (accommodate the new bound check)

15. `src/engine/phase.test.ts`: directly after the existing "every edge in
    the L1 table is accepted" block (current lines 16-29), add one explicit
    named assertion (the generic loop already covers the new edge
    automatically since it iterates `PHASE_TRANSITIONS` itself; this
    assertion is a defense against a future accidental revert of the new
    row):
    ```
    assert.equal(canTransition('reveal', 'roundIntro'), true, 'T2.2: reveal -> roundIntro is legal (round boundary with no intermission, next round has an intro)')
    ```
    Confirmed: the existing `NON_EDGES` list (current lines 46-52) does not
    already assert `['reveal', 'roundIntro']` as illegal — no conflicting
    assertion to remove.
16. `src/engine/intents.test.ts`: directly below the existing `CONFIG`
    constant (current lines 30-47), add a second fixture with 5 rounds
    (reusing `ROUND`'s shape with distinct `id`s), e.g.:
    ```
    const CONFIG_MULTI_ROUND: GameShowConfig = {
      ...CONFIG,
      program: { ...CONFIG.program, rounds: ['r0', 'r1', 'r2', 'r3', 'r4'].map(id => ({ ...ROUND, id })) },
    }
    ```
17. `src/engine/intents.test.ts`: give `applyAndCheck` (current lines 79-98)
    an optional second parameter, `stateOverride: Partial<SessionState> =
    {}`, applied as `const before = { ...makeState(), ...stateOverride }`.
    Update the FIRST existing `advanceRound` block (current lines 209-213,
    `applyAndCheck({ type: 'advanceRound' })`) to
    `applyAndCheck({ type: 'advanceRound' }, { config: CONFIG_MULTI_ROUND
    })` — required because the default single-round `CONFIG` now makes
    `roundIndex: 0` already the last valid index, and the bound check
    added in Section B would make this block's expected "touched" assertion
    fail otherwise (a no-op leaves `roundIndex`/`styleState` reference-equal
    to `before`, which `applyAndCheck` would flag as a failure for a
    declared-touched key that did not change).
18. `src/engine/intents.test.ts`: update the SECOND existing `advanceRound`
    block (current lines 215-228, the `roundIndex: 3` manual spread over
    `makeState()`) to also include `config: CONFIG_MULTI_ROUND` in that
    spread — same reason as item 17 (a 1-round config makes `roundIndex: 3`
    already out of bounds under the new check).

### Section I — New regression tests (T2.2 required, not optional)

19. `src/engine/intents.test.ts`: directly after the (now-updated) two
    existing `advanceRound` blocks, add a new block proving the boundary
    no-op — deliberately reuses the DEFAULT single-round `CONFIG` (not
    `CONFIG_MULTI_ROUND`), since a 1-round config's `roundIndex: 0` is
    exactly the "already at the last round" fixture this test needs:
    ```
    // --- advanceRound: bounded at the last round (T2.2-L1) --------------------
    {
      const before = makeState() // default CONFIG has exactly 1 round; roundIndex 0 is already the last valid index
      const after = applyIntent(before, { type: 'advanceRound' })
      assert.equal(after.roundIndex, before.roundIndex, 'advanceRound no-ops at the last round instead of producing an out-of-range index')
      assert.deepEqual(after.styleState, before.styleState, 'a no-op advance does not clear styleState either')
    }
    ```
20. `src/engine/session.test.ts`: add a new fixture (a `GameShowConfig` with
    2+ rounds, extending the file's existing `makeConfig`/`categories`
    pattern with a `rounds` override) and a new test block covering
    `advanceToNextRound`'s full branch matrix — one `assert`-driven case per
    scenario:
    - normal advance (no `eliminateLowest`, `carryScores: true`, next round
      has no `intro`) returns exactly `[{ type: 'advanceRound' }, { type:
      'setPhase', phase: 'board' }]`.
    - current round's `intermissionAfter.enabled: true` → the returned
      `setPhase` targets `'intermission'` regardless of the next round's
      `intro`.
    - current round has no `intermissionAfter` but the next round has
      `intro.enabled: true` → the returned `setPhase` targets
      `'roundIntro'`.
    - `program.carryScores: false` with teams at non-zero scores → the
      returned array includes one `awardPoints` intent per team with a
      non-zero score, each with `delta: -team.score`; a team already at 0
      gets no `awardPoints` intent.
    - `Round.eliminateLowest: true` with a single lowest-scoring team →
      returns exactly one `eliminate` intent for that team.
    - `Round.eliminateLowest: true` with 2+ teams tied for lowest and no
      `eliminateTeamId` in the input → throws, naming the tied team ids in
      the message.
    - same tie, with `input.eliminateTeamId` set to one of the tied
      candidates → returns an `eliminate` intent for that exact team, no
      throw.
    - same tie, with `input.eliminateTeamId` set to a team NOT among the
      tied candidates → throws (treated identically to no id provided —
      never silently accepts an arbitrary team).
    - `Round.eliminateLowest: true` with only 1 remaining (non-eliminated)
      team → no `eliminate` intent is produced (nothing to contest).
    - `Round.minTeams` on the immediately-next round exceeds the
      post-elimination remaining count, but a LATER round's `minTeams`
      passes → the returned array contains exactly 2 (or however many
      rounds were skipped + 1) `advanceRound` intents, landing on the first
      playable round's `intro`/`board` decision.
    - EVERY remaining round's `minTeams` fails → returns exactly
      `[{ type: 'setPhase', phase: 'final' }]` with **zero** `advanceRound`
      intents (any elimination/score-reset intents computed earlier are
      still present ahead of it).
    - calling with `state.roundIndex` already at `rounds.length - 1` →
      throws (Layer A of T2.2-L1), naming the round id and suggesting
      `endRound`.
    - calling with `state.phase` set to anything other than `'reveal'`
      (e.g. `'board'`) → throws.
21. `src/engine/log.test.ts`: add a new case, directly after the existing
    case (g) (advanceRound two-key undo, current lines 218-239), proving a
    full round-boundary batch is atomic under undo. Hand-build (matching
    this file's existing pattern of inline `Intent[]` arrays, not importing
    `session.ts`) a 3-team `before` state (`phase: 'reveal'`, scores e.g.
    `a: 10, b: 20, c: 5`, none eliminated) against a LOCAL 2-round override
    of `CONFIG` (`{ ...CONFIG, program: { ...CONFIG.program, rounds: [ROUND,
    ROUND] } }`, since the file's own top-level `CONFIG` has only 1 round —
    this override is scoped to this one test block, no other block's
    fixture changes). Dispatch this batch through `applyIntentsWithLog`:
    ```
    [
      { type: 'eliminate', teamId: 'c' },
      { type: 'awardPoints', teamId: 'a', delta: -10, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'awardPoints', teamId: 'b', delta: -20, reason: 'round boundary: scores reset (program.carryScores is false)' },
      { type: 'advanceRound' },
      { type: 'setPhase', phase: 'board' },
    ]
    ```
    Assert all four effects landed (`roundIndex` +1, `teams[a].score === 0`,
    `teams[b].score === 0`, `teams[c].eliminated === true`, `phase ===
    'board'`), then call `undo()` ONCE and assert ALL FIVE fields (including
    `styleState`, cleared by the advance) are back to their pre-batch
    values in that single call, and `state.log.length === 2` (action +
    reversal, never 3+). This is the direct regression guard for T2.2-L2's
    stated rationale (avoid repeating the T1 cycle-0-class undo-fragmentation
    bug).
22. `src/engine/host-manual-round.test.ts`: extend `CONFIG` (current lines
    52-73) from 1 round to 2 (`ROUND`, a new `ROUND2` mirroring `ROUND`'s
    shape but with a distinct `id`/`bankId`-category set and `intro: {
    enabled: true, durationMs: 1, text: 'Round 2' }` — mirroring
    `demo-t1.ts`'s actual shape so this test exercises the SAME
    `reveal -> roundIntro` path the real preset will use). Factor the
    existing tile-playing `while` loop (current lines 108-145) into a
    reusable local function (e.g. `playRound(board, teamIds)`) taking the
    board and the two team ids to alternate correct/wrong between, since it
    now runs twice. After round 1 completes (`gridStyle.isRoundComplete`
    true), REPLACE the current hardcoded `dispatch([{ type: 'setPhase',
    phase: complete ? 'final' : 'board' }])` (current line 144) for the
    round-1-complete case specifically with: `dispatch(advanceToNextRound(state))`
    (imported from `./session` alongside the existing imports), assert
    `state.phase === 'roundIntro'`, then `dispatch([{ type: 'setPhase',
    phase: 'board' }])` (mirroring exactly what `server.ts`'s new
    `'continue'` case would produce from `roundIntro`, since this file talks
    to `session.ts` directly and does not exercise `server.ts`'s command
    layer), then call `playRound` again for round 2's board. After round 2
    completes, dispatch `[{ type: 'setPhase', phase: 'final' }]` (mirroring
    `endRound`) and assert the show ends in `final` with both rounds'
    tiles fully consumed across the two boards. This is the direct
    end-to-end proof of "a multi-round show is actually reachable" at the
    engine layer.
23. `src/engine/host-manual-round.test.ts`: add a new, independent block
    (does not depend on the state built by item 22 — uses its own local
    `state`) that imports `demoT1` from `'../../presets/demo-t1'` and
    `validateConfigPluginsT1` from `../registry/bootstrap`, then: calls
    `resolveConfig(demoT1)`, asserts `.program.rounds.length === 2`, asserts
    `validateConfigPluginsT1(resolved)` returns an empty array (the preset's
    plugin keys are all registered), and calls `resolveRoundContent(resolved,
    round)` for BOTH `resolved.program.rounds[0]` and `[1]`, asserting
    neither throws and each returns a non-empty `Category[]`. This is the
    direct, Fully-Automated proof tied to the REAL shipped preset file (not
    a synthetic stand-in) that `demo-t1.ts`'s round 2 has valid, reachable
    content — the reachability of the round-boundary MECHANISM itself is
    proven generically by item 22's synthetic 2-round fixture.

## Test Plan

Framework: none, per `all-tests.md` — plain `tsx` + `node:assert/strict`,
aggregated by `scripts/run-tests.mjs`.

| Area | Tier | Scenario | Command | Proves |
|---|---|---|---|---|
| `src/engine/phase.ts` (via `phase.test.ts`) | Fully-Automated | `reveal -> roundIntro` is a legal transition; the whole edge/non-edge/terminal-state suite still passes | `npx tsx src/engine/phase.test.ts` | T2.2-L7; T2 SPEC capability row (round boundary phase wiring) |
| `src/engine/intents.ts` (via `intents.test.ts`) | Fully-Automated | `advanceRound` no-ops at the last round; normal advance still works with a multi-round config | `npx tsx src/engine/intents.test.ts` | T2.2-L1 (both explicit tests: bound + regression) |
| `src/engine/session.ts` (via `session.test.ts`) | Fully-Automated | `advanceToNextRound`'s full branch matrix (12 scenarios, item 20) | `npx tsx src/engine/session.test.ts` | T2.2-L1 through L6 (elimination, ties, carryScores, minTeams, bounds, phase guard, intermission/roundIntro/board targeting) |
| `src/engine/log.ts` (via `log.test.ts`) | Fully-Automated | A 4-effect round-boundary batch (eliminate + 2×score-reset + advance + setPhase) reverses in exactly one `undo()` | `npx tsx src/engine/log.test.ts` | T2.2-L2, T2.2-L4 (undo atomicity — the explicit "one host action = one undo" hard constraint) |
| `src/engine/host-manual-round.test.ts` | Fully-Automated | A synthetic 2-round show is played start to finish through `advanceToNextRound`, exercising `reveal -> roundIntro -> board` | `npx tsx src/engine/host-manual-round.test.ts` | "Required tests: ... demo-t1.ts round 2 is actually reachable end to end" (mechanism proof) |
| `src/engine/host-manual-round.test.ts` (new block) | Fully-Automated | `demo-t1.ts`'s real config resolves to 2 rounds, passes plugin preflight, and both rounds' content resolves without throwing | `npx tsx src/engine/host-manual-round.test.ts` | Same requirement, tied to the actual shipped preset file |
| `src/server.ts`'s `advanceRound`/`continue` command routing (glue only — no dedicated automated test) | Agent-Probe / Manual | Run `npm run show` (boots `demo-t1` by default); click through round 1 → "Next Round" (or an "Eliminate & continue" button if a tie is manufactured) → "Continue" past the round 2 intro → round 2 → "End Show" → confirm the host and stage views render correctly at each step, including the `final` phase | manual: `npm run show`, click through in a browser, or `curl -X POST http://localhost:8080/command` with a valid host token | The one layer this plan does NOT unit-test directly (thin command-routing glue; the real logic is in `advanceToNextRound`, already Fully-Automated above) — named explicitly, not silently skipped |
| Untouched files (regression-only) | Fully-Automated | `src/registry/bootstrap.test.ts`, `src/registry/validateConfigPlugins.test.ts`, `src/config/resolve.test.ts`, `src/engine/broadcast.test.ts`, `src/styles/grid.test.ts`, `src/scoring/flat.test.ts`, `src/transport/local.test.ts` all still pass unmodified | `npm test` (full aggregate) | No regression from this plan's changes |
| Whole-project | Fully-Automated | Full gate sequence green from a clean `dist/` | `rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build` | This plan's own Sub-Phase completion bar, matching T1/T2.1 precedent |
| `presets/demo-t1.ts` header comment | Known-Gap (documentation only, no test possible) | The comment update (item 14) is prose; nothing to assert | — | Keeps the file's own docs from actively lying about round 2's reachability once this plan lands |

### TDD stubs (Fully-Automated rows — red-first starting point for EXECUTE)

```
test("advanceRound no-ops at the last round instead of producing an out-of-range roundIndex", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceRound still advances roundIndex by 1 in a multi-round config (regression)", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: normal advance returns [advanceRound, setPhase(board)] when neither intermissionAfter nor the next round's intro apply", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: intermissionAfter.enabled targets setPhase(intermission) regardless of the next round's intro", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: next round's intro.enabled (no intermissionAfter) targets setPhase(roundIntro)", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: carryScores false resets every non-zero-score team in the same batch", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: eliminateLowest with a single lowest scorer eliminates that team", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: eliminateLowest tie with no eliminateTeamId throws, naming the tied teams", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: eliminateLowest tie with a valid eliminateTeamId eliminates the chosen team", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: eliminateLowest tie with an eliminateTeamId not among the tied candidates throws", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: eliminateLowest with only 1 remaining team produces no eliminate intent", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: minTeams skips one round forward when the immediate next round fails the check", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: minTeams cascading through every remaining round ends the show with zero advanceRound intents and an unchanged roundIndex", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: throws when called on the last round instead of the caller having to call endRound", () => { throw new Error("NOT IMPLEMENTED") })
test("advanceToNextRound: throws when state.phase is not reveal", () => { throw new Error("NOT IMPLEMENTED") })
test("a full round-boundary batch (eliminate + score-reset + advanceRound + setPhase) reverses in exactly one undo() call", () => { throw new Error("NOT IMPLEMENTED") })
test("a synthetic 2-round show is playable end to end through advanceToNextRound, including the reveal -> roundIntro -> board path", () => { throw new Error("NOT IMPLEMENTED") })
test("demo-t1.ts's resolved config has 2 rounds, passes plugin preflight, and both rounds' content resolves without throwing", () => { throw new Error("NOT IMPLEMENTED") })
```

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `phase.test.ts` — new `reveal -> roundIntro` assertion + full existing suite | Fully-Automated | T2.2-L7; T2 SPEC T2.2 capability row |
| `intents.test.ts` — bound no-op test (item 19) + updated regression blocks (items 17-18) | Fully-Automated | T2.2-L1 (belt-and-braces bound, both explicit); backlog item 1 |
| `session.test.ts` — `advanceToNextRound` branch matrix (item 20) | Fully-Automated | T2.2-L1 through L6; ORCHESTRATOR DECISIONS 1-4 in full |
| `log.test.ts` — 4-effect batch undo atomicity (item 21) | Fully-Automated | T2.2-L2, T2.2-L4; hard constraint "every host action reverses in exactly one undo() press" |
| `host-manual-round.test.ts` — synthetic 2-round playthrough (item 22) | Fully-Automated | "Required tests: ... demo-t1.ts round 2 is actually reachable end to end" (mechanism half) |
| `host-manual-round.test.ts` — demo-t1 preset smoke-check (item 23) | Fully-Automated | Same requirement, tied to the real shipped preset |
| Full aggregate `npm test` (all existing files pass unmodified) | Fully-Automated | No regression from this plan |
| `rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build` | Fully-Automated | This plan's own completion bar (T1/T2.1 precedent) |
| `git diff --stat src/config/types.ts src/registry/index.ts` shows no output | Fully-Automated | Hard constraint: zero edits to types.ts; no registry contract change needed |
| `npm run show` + manual host-UI click-through (round 1 → Next Round/tie-eliminate → Continue past round 2 intro → round 2 → End Show → final) | Agent-Probe / Manual | The one layer with no dedicated automated test (thin `server.ts` command-routing glue); named explicitly per "no fake automated gates" |

## Acceptance Criteria

1. `PHASE_TRANSITIONS['reveal']` includes `'roundIntro'`; no other row
   changes. (Item 1.)
2. `applyIntent`'s `advanceRound` case never produces `roundIndex >
   program.rounds.length - 1`; it no-ops instead. (Item 2.)
3. `session.ts` exports `advanceToNextRound(state, input?):
   Intent[]` implementing: phase guard, last-round guard, `eliminateLowest`
   with tie rejection, `carryScores`-driven score reset, `minTeams`-driven
   round skipping (including full-cascade show-ending), and correct
   `intermission`/`roundIntro`/`board` entry-phase targeting — all as one
   returned `Intent[]` for a single host-action batch. (Item 5.)
4. `server.ts`'s `intentsForCommand` handles `'advanceRound'` (delegating to
   `advanceToNextRound`) and `'continue'` (leaving `roundIntro`/
   `intermission`); `'endRound'`/`'next'` are unchanged. (Items 6-7.)
5. `host/main.ts`'s reveal-phase controls distinguish "more rounds remain"
   (Next Round, or per-team Eliminate-and-continue buttons on a tie) from
   "this is the last round" (End Show); a Continue control exists for
   `roundIntro`/`intermission`; `final` phase renders a completion message
   instead of a stale board. (Items 8-12.)
6. `stage/main.ts`'s `final` phase renders a completion message instead of
   a stale board. (Item 13.)
7. `demo-t1.ts`'s header comment no longer claims round 2 is unreachable;
   its exported config is byte-identical otherwise. (Item 14.)
8. All 23 checklist items' test coverage (items 15-23) passes: `npx tsx
   src/engine/phase.test.ts`, `intents.test.ts`, `session.test.ts`,
   `log.test.ts`, `host-manual-round.test.ts` each exit 0 individually.
9. `rm -rf dist && npm run typecheck && npm test && node
   scripts/check-stage-host-isolation.mjs && npm run build` exits 0 end to
   end.
10. `git diff --stat src/config/types.ts src/registry/index.ts` shows no
    output (verify both hard constraints: zero types.ts edits, no registry
    contract change was actually needed).
11. `git diff --stat` overall touches only the 12 files named in
    Touchpoints — no unplanned file changes.

## Phase Completion Rules

- This plan is **CODE DONE** when every checklist item (1-23) is implemented
  and each named test file passes in isolation (`npx tsx <file>.test.ts`
  exits 0).
- This plan is **VERIFIED** only after CODE DONE **and** the full gate
  sequence (`rm -rf dist && npm run typecheck && npm test && node
  scripts/check-stage-host-isolation.mjs && npm run build`) passes with this
  plan's code included, **and** the manual host-UI click-through (Test Plan's
  Agent-Probe row) has been performed and its outcome recorded in the phase
  report — an agent's own judgment that "the code looks right" does not
  satisfy this row, consistent with T1/T2.1's Phase Completion Rules
  precedent for Manual/Agent-Probe-class rows.
- Per the vacuous-green ban: the manual click-through row stays a named,
  tracked gate — it does NOT get silently dropped or claimed PASS by
  inference from the automated gates alone. The plan's overall gate is
  PASS only via the Fully-Automated rows in Verification Evidence; the
  Agent-Probe row is recorded, not used to claim full end-to-end UI
  correctness is closed.

## Open Items / Known Limitations (carried forward honestly, not buried)

1. **Round 1's own `intro`/`minTeams` remain unwired.** The `start` command
   still hardcodes `phase: 'board'`, so `demo-t1.ts` round 1's `intro:
   {enabled: true}` is authored but never shown, exactly as it was before
   this plan (T2.2-L9). This is a pre-existing T1 gap, not a round
   *boundary*, and is intentionally out of this plan's scope. Recommended
   follow-up: a small future item wiring the `start` command's target phase
   through the same `intro.enabled ? 'roundIntro' : 'board'` decision this
   plan already writes for the round-boundary case (Section D, item 7's
   `'continue'` case) — the logic already exists in two places in this
   plan and could be shared with a third call site then.
2. **`CopyStrings` reuse is a disclosed compromise, not a clean UX.**
   `copy.host.next`/`copy.host.endRound`/`copy.host.skip` are repurposed for
   "Next Round"/"End Show"/"Continue" (T2.2-L8) because `src/config/types.ts`
   is frozen this phase. Recommended follow-up: a future phase (when
   `types.ts` edits are in scope) adds dedicated `nextRound`/`endShow`/
   `continue` fields to `CopyStrings.host` for precise host-facing wording.
3. **`program.finale.style`/`dramaticReveal`/`showStats` are not read.**
   The `final` phase gets one minimal, real rendering (T2.2-L11) — no
   podium/reveal/stats treatment. Recommended follow-up: a later
   presentation-focused phase (not an engine-capability phase) reads these
   fields to drive an actual finale sequence, once the T2 SPEC's own
   "UI/visual work beyond engine-layer acceptance criteria" scope boundary
   is revisited.
4. **`server.ts`'s new command-routing glue has no dedicated automated
   test.** `advanceRound`/`continue`'s thin `intentsForCommand` cases are
   covered only by the manual click-through gate (Test Plan). The REAL
   logic (`advanceToNextRound`) is Fully-Automated tested directly. This
   mirrors the existing gap for every other `intentsForCommand` case (none
   of `'start'`/`'select'`/`'arm'`/`'markCorrect'`/etc. have a dedicated
   `server.test.ts` either — there is no `server.test.ts` file in this
   codebase at all). Not a new gap introduced by this plan.
5. **`presets/` is not scanned by `scripts/run-tests.mjs`.** Its
   `collectTests` walks `src/` only (`path.join(ROOT, 'src')`), so a test
   file placed under `presets/` would silently never run. This is why item
   23's demo-t1 smoke-check lives inside `src/engine/host-manual-round.test.ts`
   (importing `demoT1` cross-directory) rather than as a new
   `presets/demo-t1.test.ts` file — noted here so a future agent does not
   "helpfully" add a presets-local test file that then never executes.
6. **Elimination-tie UI is plain buttons, not a dedicated confirmation
   modal.** Per "engine capability phase, not UI polish" — one button per
   tied team (`Eliminate {name} & continue`), no undo-warning dialog beyond
   the standing Undo dock. Acceptable given the existing host UI's overall
   plainness (no other action in this codebase has a confirmation step
   either).
7. **`minTeams`'s "skip" semantics were confirmed from the type's own doc
   comment**, not invented: `Round.minTeams`'s doc comment reads "Skip this
   round if fewer than n teams remain" (verbatim, `src/config/types.ts`
   line 658-659) — this plan implements exactly that, including the
   full-cascade-ends-the-show fallback when every remaining round fails the
   check (a necessary consequence of "skip," not a separate invented
   behavior: there is no third option once every round is skipped).

## Test Infra Improvement Notes

- `presets/` is invisible to `npm test`'s discovery glob (`src/**/*.test.ts`
  only) — see Open Item 5. If preset-level smoke tests become a recurring
  need (more presets are added in future phases), consider either moving
  presets under `src/presets/` or widening `collectTests`'s root to include
  `presets/`. Not acted on in this plan — a single cross-directory import
  from an existing `src/` test file is sufficient for T2.2's one preset.
- No other test infra gaps identified by this plan (the existing `tsx` +
  `node:assert/strict` + `run-tests.mjs` aggregation pattern accommodates
  every scenario in this plan's Test Plan without modification).

## Dependencies and Sequencing

Section A (item 1, `phase.ts`) has no dependency — pure data-table edit,
should land first since Section C's `advanceToNextRound` targets the new
`'roundIntro'` phase and would be validating a not-yet-legal transition
otherwise. Section B (item 2, `intents.ts`) has no dependency on Section A
and can land in parallel with it. Section C (items 3-5, `session.ts`)
depends on BOTH Section A (the new phase edge, for the `roundIntro` target
to be a legal `setPhase`) and Section B (the bound check, since
`advanceToNextRound` relies on `applyIntent`'s `advanceRound` case being
safe to call multiple times in one batch without ever producing an
out-of-range index, even though `advanceToNextRound`'s own bounds
computation should make this unreachable in practice — belt and braces).
Section D (items 6-7, `server.ts`) depends only on Section C
(`advanceToNextRound` must exist to import). Section E (items 8-12,
`host/main.ts`) depends only on Section D (the wire-protocol command
names/payload shapes it sends must already be handled server-side, or a
manual click-through would hit an "unknown command" error). Section F (item
13, `stage/main.ts`) has no dependency on Sections D/E — can land any time
after Section A (needs no new phase, `final` already exists) or fully in
parallel. Section G (item 14, `demo-t1.ts` doc comment) has no code
dependency — can land any time, but logically belongs after the engine
wiring is real (Sections A-F) so the updated comment is accurate when it
lands. Section H (items 15-18, existing test updates) depends on Sections A
+ B respectively (each test file's changes accommodate exactly one
implementation section's new behavior). Section I (items 19-23, new tests)
depends on ALL of Sections A-D (each new test exercises the full plumbing
chain from `phase.ts` through `session.ts`, and item 22/23 additionally
need `server.ts`'s import surface unchanged — though they call `session.ts`
directly, not through `server.ts`).

Recommended execution order: A, B, (H items 15-18 can follow A/B
immediately), C, D, E, F, G, then I (19-23) last, since Section I is the
regression proof that everything above it is correct.

## Risks

### Risk Predictions (5-persona pre-implementation read)

| Persona | Prediction |
|---|---|
| **Skeptical Engineer** | The `minTeams`-cascade's "push N `advanceRound` intents in one batch" is the least-precedented shape in this plan — nothing in T1/T2.1 dispatched the same intent type more than once in a single batch. The batch-union undo mechanism is designed to handle this correctly (union of touched keys, snapshot once, apply in order) but item 21's test is the FIRST place this exact shape gets exercised end-to-end with undo — treat that test as load-bearing, not incidental. |
| **Security-Minded Reviewer** | No new attack surface: the two new commands go through the same host-token-gated `/command` endpoint as every existing command, no new data leaves the server that wasn't already in `BroadcastPayload`, and `styleState`/answer content are untouched. The only new host-controllable input is `eliminateTeamId` (a string), and it is validated by set-membership against server-computed tied candidates — an invalid/malicious value throws, it cannot force an eliminate outside the tie set. |
| **Product-Minded PM** | The `CopyStrings` reuse (T2.2-L8) is the one place a real host would notice something slightly off — "Next" meaning both "next question" and "next round" depending on context, and "End Round" meaning "end the whole show." Functionally correct, cosmetically imprecise. Explicitly flagged in Open Items rather than either silently shipped as if it were clean, or scope-crept into a `types.ts` edit this phase. |
| **Live-Event Operator** | The "End Show" action being available at ANY round (not just the last), unchanged from existing T1/T2.1 behavior, is the right call for a real event — technical difficulties or running out of time are common, and a host needs an always-available "wrap it up" button, not one gated behind "you must be on the configured last round." |
| **Test/QA Advocate** | The one deliberately un-automated layer (`server.ts`'s command routing, Open Item 4) is a genuine, disclosed gap, not a hidden one — but it means a typo in the wire-protocol command NAME string (`'advanceRound'` vs some other spelling) between `host/main.ts`'s `send(...)` calls and `server.ts`'s `switch` cases would only be caught by the manual click-through, not by `tsc` (both are plain string literals, no shared const). Recommend the EXECUTE step double-check these two files' command-name strings match exactly via `grep -n "'advanceRound'\|'continue'" src/server.ts src/host/main.ts` before considering the manual gate satisfied. |

### Scenario Analysis (highest-risk checklist items)

**Item 5 (`advanceToNextRound`) — edge cases beyond the main branch matrix:**
- All teams eliminated already (`remaining.length === 0` when
  `eliminateLowest` fires) — handled: the `remaining.length > 1` guard
  means `remaining.length === 0` skips the elimination block entirely
  (nothing to eliminate, no throw). Covered implicitly by the "only 1
  remaining team" test case's sibling — worth confirming in EXECUTE that a
  0-remaining-teams manual state literal doesn't hit `Math.min(...[])`
  (`-Infinity`) anywhere, since the guard is `remaining.length > 1`, not
  `> 0`, and both 0 and 1 skip identically.
- `Round.minTeams` set to `0` or a negative number — `remainingCount <
  candidate.minTeams` would be false for any realistic team count, so the
  round is never skipped; this is correct (a `minTeams` of 0 means "always
  playable," consistent with the field's own semantics) and needs no
  special-case code, but is worth a one-line mental check during EXECUTE
  review, not a dedicated test (not a realistic authoring case).
- Every team eliminated by the SAME batch's own `eliminateLowest` action
  (i.e., `remainingCount` hits 0 after this round's own elimination) —
  the `minTeams` walk then evaluates candidate rounds against
  `remainingCount === 0`; any round with `minTeams >= 1` fails, likely
  cascading to show-end. This is CORRECT (no teams left to play means the
  show cannot continue) and falls out of the existing algorithm with no
  special-casing — confirmed by tracing the code, not a separate test
  required beyond the existing cascade-to-final scenario (item 20's last
  bullet), since the mechanism is identical regardless of WHY
  `remainingCount` hit its low value.

**Item 21 (log.test.ts 4-effect undo) — edge cases:**
- If `awardPoints`' `delta: -team.score` intents are OMITTED for
  already-zero-score teams (per Section C's `if (team.score !== 0)` guard),
  the touched-key union still includes `'teams'` (from the `eliminate`
  intent alone) — undo still correctly restores ALL teams' pre-batch
  `teams` array (the union-snapshot captures the whole `teams` field, not
  per-team), so omitting a no-op `awardPoints` intent for a zero-score team
  does not weaken undo coverage. Worth a one-line comment in the test
  itself (item 21) confirming this is understood, not accidental.

**Item 22 (host-manual-round.test.ts 2-round extension) — edge cases:**
- The refactored `playRound` helper must not accidentally share mutable
  state between the two calls (e.g. a `guard` loop-termination counter
  reused across both rounds without resetting) — EXECUTE should confirm
  each `playRound` call resets its own local guard/consumed-tracking state,
  since the existing single-round loop's `guard` variable is currently
  scoped to the whole file (`let guard = 0` at file scope, current line
  109) and would need to become function-local or be reset between calls.

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_PLAN_27-08-26.md`
2. **Last completed phase or step:** PLAN written (this pass). No prior
   SPEC/INNOVATE artifacts exist for T2.2 specifically — the T2 SPEC's
   Capability Inventory row for T2.2 (in
   `gameshow-engine-t2_SPEC_24-08-26.md`) and the orchestrator's own
   ORCHESTRATOR DECISIONS (embedded in the PLAN-mode task prompt this plan
   was written from) together stand in for SPEC/INNOVATE — INNOVATE was
   skipped because the "how" was mechanical/pre-decided per the phase
   transition rule's skip condition ("Scope is purely mechanical, no design
   choices").
3. **Validate-contract status:** pending — see `## Validate Contract`
   placeholder below. Per the task's explicit instruction, VALIDATE will
   likely be skipped for this phase (as it was for T2.1, at user
   direction), and this plan is written with that expectation: every
   checklist item specifies exact code, exact file/line anchors, and exact
   test scenarios so EXECUTE needs no judgement calls even without a
   validate-contract gate.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`,
   `process/general-plans/backlog/gameshow-engine-t2.2-blockers.md` (the
   mandatory-read blocker note), `gameshow-engine-t2_SPEC_24-08-26.md`
   (Capability Inventory + Out of Scope + Constraints sections),
   `gameshow-engine-t2_PLAN_24-08-26.md` (T1/T2.1 Design Lock precedent and
   plan format), `gameshow-engine-t2_CLOSEOUT_24-08-26.md` (referenced via
   `all-context.md`'s summary), `src/registry/index.ts` (full read),
   `src/config/types.ts` (Round/ProgramConfig/CopyStrings sections, lines
   ~560-700 and ~220-230), `src/engine/{phase,intents,log,session,
   broadcast}.ts` (full reads), `src/server.ts` (full read),
   `src/host/main.ts` (full read), `src/stage/main.ts` (full read),
   `presets/demo-t1.ts` (full read), `src/engine/{phase,intents,log,
   session,host-manual-round}.test.ts` (full reads, for exact fixture/line
   anchors), `scripts/run-tests.mjs` (confirmed the `presets/` discovery
   gap — Open Item 5), `CUSTOMIZATION.md` (Five invariants, styleState
   sections), `ARCHITECTURE.md` §5 (background only — superseded by the
   actual `PHASE_TRANSITIONS` table, not authoritative for implementation).
5. **Next step for a fresh agent picking up mid-execution:** if VALIDATE has
   not run and no explicit skip has been recorded, confirm with the user
   before starting EXECUTE (per the phase transition rule — VALIDATE is
   normally required, the skip here is an explicit user-direction
   precedent, not a default). If EXECUTE is already in progress, check
   `git diff --stat` against the Touchpoints table above to see which
   sections (A-I) are already applied, and resume at the first unmodified
   file in the recommended execution order (Dependencies and Sequencing):
   A, B, H(15-18 following A/B), C, D, E, F, G, I(19-23).

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE, unless
VALIDATE is explicitly skipped by user direction as anticipated in Resume
and Execution Handoff item 3, in which case this section stays a
placeholder and the skip decision is recorded in the phase report instead)
