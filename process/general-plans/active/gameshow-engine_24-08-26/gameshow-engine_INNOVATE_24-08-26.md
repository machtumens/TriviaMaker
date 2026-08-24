---
name: plan:gameshow-engine-innovate
description: "INNOVATE decision summary for T1 (playable core, host-manual) — condensed record"
date: 24-08-26
feature: general
---

# INNOVATE — Game Show Engine, T1 Scope

> **Note on provenance.** This file is a **condensed record transcribed by the plan-agent**,
> not authored live by the innovate-agent. The innovate-agent session ran without Write-tool
> access and could not persist its own output; the orchestrator carried its findings forward
> verbatim and asked the plan-agent to commit them to disk before planning began. Every
> decision below was independently checked by the orchestrator against the real contracts in
> `src/registry/index.ts` and `src/config/types.ts` before being handed off — file:line
> references are the orchestrator's verification, not the innovate-agent's unverified claim.

## TL;DR

Five decisions for T1 (phase machine, event log/undo, turn ownership, view sync, timer), all
GO per a 5-persona `vc-predict` debate. Zero new runtime dependencies. Two contract gaps
found and explicitly deferred to T2 (style-owned persistent state has no `SessionState` slot).
One Medium risk (host-command auth) is resolved in-scope for T1, not deferred.

---

## D1 — Phase Machine: explicit transition table as data

**Chosen:** A plain object-literal transition table (`Record<Phase, Phase[]>`) plus pure
`canTransition()` / `apply()` functions. The core 11-state `Phase` set in
`src/registry/index.ts` is FIXED; per-style variation is expressed through the existing
phases plus `StylePlugin.onSelect` / `onResolved` / `isRoundComplete` — never new phases.

**Rejected — XState.** New dependency. Its actor model wants to own transitions, which fights
the project's established ownership model ("plugin returns `Intent[]` → engine applies →
engine logs" — `CUSTOMIZATION.md` Layer 4). Hierarchical/parallel states buy nothing for an
11-state flat graph. The learning curve directly contradicts the project's stated no-framework
rationale (`process/context/tests/all-tests.md` "Testing Approach").

**Rejected — hand-rolled reducer/switch.** Works, and is idiomatic JS/TS. But it buries the
transition graph inside imperative branches instead of an independently checkable structure.
`ARCHITECTURE.md` §5 names unmodelled transitions as exactly where live-show bugs live
("Every bug in a live game show lives in an unmodelled state transition"). A data table is
directly inspectable and testable as a truth table; a switch statement is not.

**Rejected — nested guards.** Ruled out outright; adds indirection with no offsetting benefit
for this state count.

---

## D2 — Event Log / Undo: generic diff-based inverse patch, unbounded log

**Chosen:** Every applied intent produces an inverse patch computed by a single GENERIC
diffing function — never a hand-written inverse per intent type. The `log` field is
UNBOUNDED (kept for full audit); `runtime.undo.depth` (default 50, `src/config/types.ts:753`)
bounds only how many trailing entries the UI exposes as undoable, not how much history is
retained.

**Correction to `CUSTOMIZATION.md`'s claim (explicitly tested, not inherited on faith).**
`CUSTOMIZATION.md` Layer 4 claims undo, reconnect, and dispute audit all "fall out for free"
from the intent/log architecture. The innovate-agent was asked to verify this claim rather
than repeat it. Verdict per capability:
- **Undo — TRUE.** The generic inverse-patch mechanism genuinely gives one-action undo with
  zero hand-written per-intent-type reversal code.
- **Dispute audit — TRUE, and the strongest of the three.** Every `ScoreDelta` already carries
  a `reason` (`src/registry/index.ts:152-157`); an unbounded append-only log makes "why does
  Class Y have 400?" mechanically answerable from the log alone.
- **Reconnect — OVERSTATED for T1.** The log is irrelevant to what a T1 reconnecting client
  actually needs: a full current-state snapshot on connect. Replaying the log to reconstruct
  state is real future work (persistence/resume is explicitly T5 in the SPEC's Capability
  Inventory), not something T1 needs or should build. Record this correction explicitly so
  a future reader does not assume reconnect is already solved because the log exists.

**Rejected — full event-sourcing replay-from-zero.** Replay cost grows with show length for a
reproducibility guarantee no SPEC acceptance criterion asks for.

**Rejected — snapshot+replay-since.** The right shape for T5 persistence/resume. Building it
now is premature — no persistence driver exists yet (`runtime.persistence.driver` is
`'localStorage'` by default and unused until T5).

**Rejected — bounded undo stack.** Breaks dispute audit past the bound and directly
contradicts the `log` field's own unbounded type (`readonly GameEvent[]`,
`src/registry/index.ts:43`).

**Correction (PVL supplement, 24-08-26):** VALIDATE (PLAN's first-pass
review) found that the generic inverse-patch mechanism as originally
specified operates per-`Intent`, not per-host-action — a single host
action (e.g. selecting a question, marking an answer) can produce 2-3
`Intent`s, so one `undo()` call was only reversing the last of them. The
"Undo — TRUE" verdict above is corrected to: **undo is one-action TRUE
at the HOST-ACTION granularity**, not the `Intent` granularity the
original mechanism implemented. The fix (`log.ts`'s `applyIntentsWithLog`,
Design Lock L2a in the PLAN) batches a whole host action's `Intent[]`
into ONE `GameEvent` before logging, so `undo()`'s own per-event
reversal logic — unchanged from what's described above — now correctly
reverses one host action per call. No change to the chosen approach
(generic diff-based inverse patch, unbounded log) or to the rejected
alternatives above; this correction is scoped entirely to the dispatch
granularity, not the mechanism.

---

## D3 — Turn Ownership: engine owns transitions + generic turn config; style owns board/selectability

**Chosen:** The engine owns phase transitions plus generic, config-driven turn logic
(`rules.turn.picker`, `rules.turn.answerRights` — `src/config/types.ts:397,399`). Each
`StylePlugin` owns board shape, question selectability, and style-specific resolution
consequences via `Intent[]`. This is the correct division of responsibility for T1.

**Two contract gaps found — verified against the real interfaces, DEFERRED TO T2. Do not
pre-build either in T1:**

1. `SessionState` has no generic slot for persistent style-owned state. A style like
   `tictac` needs to remember which team owns which board cell across turns; `consumed`
   (`src/registry/index.ts:35`) tracks which QUESTIONS have been played, not cell ownership,
   and there is no other field that could hold it.
2. `StylePlugin.buildBoard(round, options)` (`src/registry/index.ts:97`) never receives
   `state` — only `round` and its own `options`. Even if a state slot existed, a style
   currently has no way to read it back when reconstructing its board model.

Both gaps are real and verified by direct inspection of `src/registry/index.ts`; they are
irrelevant to T1 because T1 ships exactly one style (`grid`), which has no persistent
per-cell ownership concept — `grid`'s state is fully derivable from `consumed` alone. Adding
speculative fields to close these gaps now would violate the constraint against modifying
`src/registry/index.ts` and `src/config/types.ts` in T1, and would be guessing at a shape
before a second style (`tictac`) exists to validate it against.

**Open modeling question, also deferred to T2:** whether `hangman`'s continuous
letter-by-letter guessing fits the discrete phase-cycle model (`reading → armed → locked →
adjudicate → reveal`) at all, or needs its own sub-loop inside a single phase. Not resolved
here — flagged so T2 planning does not rediscover it from scratch.

---

## D4 — View Sync: local HTTP server, SSE down, POST up

**Chosen:** A local `node:http` server. Server→client push via `text/event-stream` (SSE);
client→server commands via plain HTTP POST. Zero new runtime dependencies — `node:http` and
browser-native `EventSource` are both platform built-ins.

Maps directly onto the existing `TransportPlugin` / `TransportHandle` contract
(`src/registry/index.ts:178-190`) with no interface changes:
- `broadcast(channel, payload)` → write to that channel's open SSE response streams.
- `onCommand(handler)` → the POST route's handler dispatch.
- `rtt(clientId)` → stub returns `0` for T1. Nothing reads it yet — no buzz arbitration
  exists until an input plugin ships (T4).
- `stop()` → close the HTTP server and all open SSE streams.

Redaction is enforced by calling `redactQuestion(q, audience)`
(`src/config/resolve.ts:128-135`) at the exact point of writing to a stream, keyed by which
route/channel is being written to. This is reinforced by a SECOND, independent control: the
stage view (`stage.html`) is built as its own Vite entry point that never imports any
host-only code path, so the projector bundle carries no answers at either the network layer
(redaction) or the bundle layer (import isolation) — two independent failure modes covered,
not one mechanism relied on twice.

**Rejected — `BroadcastChannel`.** Cannot reach a separate physical device at all — it is
same-origin, same-browser-instance only. Architecturally incompatible with the SPEC's
non-negotiable host-device/stage-device split (`ARCHITECTURE.md` §2, Plane 3).

**Rejected — WebSocket via `ws`.** The right choice for T4's precision buzz-timestamp needs,
but buys nothing at T1's low update frequency (state pushes on phase/score change, not
per-frame) and costs a new dependency. The registry pattern (`transport.driver` is a string
key resolved at runtime — `src/config/types.ts:745`) makes the later swap to `websocket` free
when T4 needs it; nothing about the T1 choice forecloses it.

---

## D5 — Timer: server-authoritative anchor, client-rendered countdown

**Chosen:** The server holds a single authoritative anchor — `clockStartedAt`
(`src/registry/index.ts:42`) plus the resolved `questionSec` for the current question
(`src/config/types.ts:452`). Clients render the countdown locally by computing
`questionSec*1000 - (now - clockStartedAt)` on every render tick; no server tick-by-tick
broadcast. Pause = `stopClock` intent (`clockStartedAt → null`). Resume = the host computes
remaining time locally and sends `startClock({ ms })`.

**Zero contract changes required.** `Intent.startClock` already carries `ms`
(`src/registry/index.ts:83`) — orchestrator-verified directly against the source. Pause and
resume are both expressible today with no new intent type and no `SessionState` field
changes.

**Rejected — server tick-by-tick broadcast.** Couples visual smoothness to continuous network
reliability, which directly contradicts the offline-degrade invariant
(`runtime.degradeToOfflineOnNetworkLoss` — SPEC Constraints, invariant #1). A dropped tick
should never freeze or desync the on-screen countdown.

**Rejected — independent per-client timers with no shared anchor.** Drifts between host and
stage over time — this reproduces exactly the projector-vs-host desync `ARCHITECTURE.md` §2
warns about ("If a view has business logic in it, you'll get desyncs — the projector saying
one thing and the host's laptop another, live, on stage").

---

## vc-predict — 5-persona pre-implementation debate

**Verdict: GO.**

| Risk | Severity | Disposition |
|---|---|---|
| Host-command HTTP endpoint sits unauthenticated on venue wifi — any device on the same network could forge host commands (STRIDE: Spoofing/Tampering). | Medium | **Resolved in T1 scope, not deferred.** See orchestrator decision in the PLAN file: a per-session random host token baked into the controller URL, verified server-side on every POST. |
| `ws`/XState rejection reasoning was reasoned from documented behavior, not freshly re-verified against current library docs at decision time. | Low | Accepted as-is — both are REJECTED paths; if either is revisited in a later tier, re-verify then, not now. |

---

## Orchestrator decisions carried into PLAN (not re-litigated here)

- Host-command authentication is IN T1 SCOPE (mitigates the Medium risk above). This is
  host-session authentication, not player/user accounts — it does not cross the SPEC's
  out-of-scope line on "user accounts, multi-tenant auth, or billing."
- The two D3 contract gaps stay DEFERRED TO T2 — no speculative fields added to
  `SessionState` or `StylePlugin` in T1.
- Zero new runtime dependencies. Vite is dev-dependency-only (build tool). Nothing else
  without an explicit argument recorded in the PLAN file.
