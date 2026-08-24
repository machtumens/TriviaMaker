---
name: plan:gameshow-engine-spec
description: "SPEC — permanent, highly customisable game-show engine (config layer built; engine/UI/plugins outstanding)"
date: 24-08-26
feature: general
---

# SPEC — Game Show Engine

## Summary

We are building a **permanent, reusable game-show engine** — not a one-off script for a
single event. It lets a show author configure almost anything about a live trivia/game
show (board style, scoring, rules, look, sound, team setup) without touching code, while a
host runs the live show from a controller device and an audience watches a projector/stage
view. The first real use is the user's own student council game show, but the software is
built to be picked up again for the next event, the next council, or someone else's show,
with the config schema as the reusable contract. Because there is no player input device
yet, the first usable version is **host-manual adjudication only** — buzzers and phone/
network participation come in later phases, deliberately sequenced, not dropped.

## User Stories / Jobs To Be Done

**Show author** (builds the show content and rules ahead of time)
- As a show author, I want to define categories, questions, point values, and round
  structure in a config file, so that I can build a full show without writing code.
- As a show author, I want to pick a game style per round (grid, list, trivia, wheel,
  tic-tac-toe, hangman) and change scoring/timing/theme per round, so that a show can vary
  in format (e.g. Jeopardy-style round, then a wager finale) without hand-coding each round.
- As a show author, I want to re-skin the whole show (colors, fonts, logo, copy) via config
  only, so that the same engine works for a completely different event later without
  forking the codebase.
- As a show author, I want a preflight check that tells me if I referenced a plugin key
  that doesn't exist, so that a typo is caught in the green room, not on stage.

**Host / operator** (runs the live show)
- As a host, I want a controller view that shows me the question, the answer, and simple
  controls (select, reveal, award, deduct, undo, next), so that I can run the show without
  exposing the answer key to the audience.
- As a host, I want to manually mark an answer correct or wrong for a team, so that the
  show works even before any buzzer or network input plugin exists.
- As a host, I want one-tap undo, so that a misclick under pressure in front of an audience
  is recoverable in one action, not several.
- As a host, I want the stage view to keep working if all player devices disconnect or wifi
  dies, so that the show is never blocked on a device or network I don't control.

**Stage / projector audience** (the room watching)
- As the audience, I want to see the current board, question, timer, and scoreboard on the
  projector, so that I can follow the game without needing my own device.
- As the audience, I want the projector to never show the answer before reveal, so that the
  game stays fair and the surprise is real.

**Player** (later phase — audience members participating via their own device or a buzzer)
- As a player, I want to buzz in and have my buzz ranked fairly even if my wifi is worse
  than someone else's, so that the game rewards reflexes, not network quality.
- As a player, I want to join a session by code or QR and see my own answer options / buzz
  button, so that I can participate directly instead of only shouting from my seat.

## What The User Wants (Behavioral Outcomes)

- A show author can produce a complete, playable show from configuration alone — no new
  code is required to add a round, change a scoring rule, or reskin the show.
- Changing one round's rules (e.g. "double points" or "no steals this round") does not
  require understanding or touching any other round.
- The engine never needs a `if (config.someSpecialCase)` branch for a new host request —
  new behavior is either expressible as config, or it is a missing plugin, not a special
  case wired into the core.
- The host can run an entire round using only manual adjudication (click a tile, read the
  question, click correct/wrong for the team that answered) with zero devices other than
  the host's own and the projector.
- If every player device disconnects or the venue wifi fails outright, the show visibly
  keeps running: the host can still select questions, reveal answers, and award points.
- The audience-facing (stage) view never displays the answer before the reveal step, and
  never displays it at all if the current round/question doesn't call for a reveal step.
- The host can undo the single most recent scoring/state action in one interaction, and the
  scoreboard reflects the corrected state immediately.
- A show author who mistypes a plugin key (e.g. a scoring engine that isn't registered)
  gets a clear, specific error before the session starts — not a silent fallback or a crash
  mid-show.
- (Later phase) A player buzzing on a phone with poor wifi is not unfairly ranked behind a
  player with better wifi purely because of network speed.

## Flow / State Diagram

### Phase machine (session plane — authoritative, applies to every style)

```
        ┌────────┐
        │ LOBBY  │  join code / QR shown (or skipped if stage-only)
        └───┬────┘
            │ host starts
        ┌───▼────┐
        │ BOARD  │◄─────────────────────────────┐
        └───┬────┘                               │
            │ host picks question                │
        ┌───▼─────┐                               │
        │ READING │  buzzers/answering DEAD       │
        └───┬─────┘                               │
            │ host arms                            │
        ┌───▼───┐                                  │
        │ARMED  │  buzzers/answering LIVE           │
        └───┬───┘                                  │
     ┌──────┴───────┐                               │
     │ first input   │ timeout, nobody answered      │
┌────▼────┐          └──────────────┐                │
│ LOCKED  │                          │                │
└────┬────┘                         │                │
     │ host/engine adjudicates       │                │
┌────▼─────────┐                     │                │
│ ADJUDICATE   │──wrong, re-open────►│ (back to ARMED, if steals enabled)
└────┬─────────┘                     │
     │ correct, or attempts spent    │
     └──────────────┬────────────────┘
                ┌────▼────┐
                │ REVEAL  │  answer shown to everyone
                └────┬────┘
                     │ next
                     └──────────────► BOARD (loop) ──► FINAL when round/show consumed
```

Notes reflected from `ARCHITECTURE.md` §5 and already encoded as `Phase` in
`src/registry/index.ts`: `lobby | roundIntro | board | reading | armed | locked |
adjudicate | reveal | wager | intermission | final`. The extra states (`roundIntro`,
`wager`, `intermission`) are program-level (multi-round show) additions the code already
anticipates; the diagram above shows the per-question core loop.

### Three-plane data flow (already the intended architecture — CUSTOMIZATION.md / ARCHITECTURE.md §2)

```
AUTHORING (durable)          SESSION (ephemeral, authoritative)      PRESENTATION (dumb views)
config + presets  ──snapshot──►  SessionState (phase machine,   ──state──►  Stage / projector (read-only)
(show author edits)              intent application, event log) ──state──►  Host controller (sees answers)
                                                                  ──state──►  Player (later phase)
```

Editing config while a session is live must never change the running show (`snapshotContentAtLaunch`).

## Acceptance Criteria (Testable Outcomes)

Each criterion below is grounded in what already exists (`resolve.test.ts`, `typecheck`,
`validateConfigPlugins`) or in the manual/E2E verification path already named as a known
gap in `process/context/tests/all-tests.md`. Where automation does not exist yet, that is
recorded honestly as **Known-Gap**, not invented as a fictitious passing gate — per
`all-tests.md`'s own "Known Gaps" section (no engine/UI/E2E tests exist yet), and this is
an explicitly-justified residual, not a default.

1. **Config-only show authoring** — a complete 3-round show (mixed styles, at least one
   rule override per round) resolves to a single, fully-merged config object with no
   `undefined` gaps and no engine code changes.
   `proven by:` `src/config/resolve.test.ts` cascade assertions + `presets/school-assembly.ts` as a worked fixture.
   `strategy:` Fully-Automated.

2. **Arrays replace, not concatenate** — a round overriding its question list fully
   replaces the base list; it never merges positionally into a frankenstein list.
   `proven by:` `src/config/resolve.test.ts`.
   `strategy:` Fully-Automated.

3. **Plugin preflight catches typos before showtime** — referencing an unregistered
   plugin key anywhere in config (scoring engine, transport, style, lifeline, handler,
   widget, layout) produces a specific error naming the bad key and the registered
   alternatives; it never silently falls through.
   `proven by:` `validateConfigPlugins()` unit coverage in `src/registry/index.ts` (exists as a function today; needs a dedicated test file — currently exercised only indirectly).
   `strategy:` Fully-Automated (test file to be added — tracked as build work, not a SPEC gap).

4. **Answer redaction holds at the transport boundary** — a `Question` sent toward the
   `'stage'` or `'player'` audience never contains `answer`, `acceptedAnswers`,
   `hostNote`, `correctChoiceIndex`, or `numericAnswer`.
   `proven by:` `src/config/resolve.test.ts` redaction assertions.
   `strategy:` Fully-Automated.

5. **Zero-player playability** — with no player devices connected and no network input
   plugin active, a host can complete a full round end-to-end using only host-manual
   adjudication (select question → reveal → award/deduct → next).
   `proven by:` a to-be-written engine integration test once the phase machine exists (`src/engine/*.test.ts`, not yet created) + a manual dry-run on the real venue network before the live event (`ARCHITECTURE.md` §9 pre-show checklist).
   `strategy:` Known-Gap (engine integration test) + Agent-Probe / manual pre-show checklist (the human dry-run is not automatable and is intentionally kept manual per §9).

6. **Undo is one action** — the most recent scoring or phase-changing action can be
   reversed in a single host interaction, and the scoreboard/log reflect the reversal
   immediately, with no hand-written inverse logic per action type.
   `proven by:` engine-level test on intent log replay (`src/engine/*.test.ts`, not yet created — depends on the event log existing).
   `strategy:` Known-Gap (engine does not exist yet; this is a Tier 1 build item, not yet testable).

7. **Stage view never renders host-only content** — no stage-facing code path holds a
   reference to unredacted question data.
   `proven by:` redaction test (see #4) plus a code-level import boundary check once the
   stage view exists (static check, not yet written).
   `strategy:` Hybrid (automated redaction test today; import-boundary lint is a future addition).

8. **Scoring plugin purity** — a scoring plugin never mutates `SessionState`; running the
   same `ScoreInput` twice produces identical `ScoreDelta[]` output.
   `proven by:` a purity/determinism test to be written once a first concrete scoring
   plugin (`flat`) exists (not yet built — no concrete plugin exists today).
   `strategy:` Known-Gap (no concrete scoring plugin exists yet — this is Tier 1 build work).

9. **Theming is data-only** — changing `ThemeTokens` values changes the rendered stage
   view with zero component code edits.
   `proven by:` visual/manual check once the stage view exists (`all-tests.md` notes no
   visual regression tooling exists yet) — Playwright screenshot comparison is the named
   future plan.
   `strategy:` Known-Gap (stage view doesn't exist) — visual regression explicitly planned
   as future automation, not invented as present-tense coverage.

10. **Buzzer fairness (later phase)** — when two players buzz within the grace window,
    ranking uses latency-compensated tap-time estimates, not raw server-arrival order.
    `proven by:` a dedicated arbitration unit test simulating variable RTTs, to be written
    when the `network` input plugin is built (Tier 4 — not yet built).
    `strategy:` Known-Gap, explicitly deferred — this criterion only applies once the
    network input plugin ships; it is listed now so the requirement isn't lost.

11. **Content snapshot isolation** — editing the show config/preset while a session is
    running never changes the live session's board, questions, or rules.
    `proven by:` engine test once session launch/snapshot exists (`src/engine/*.test.ts`,
    not yet created).
    `strategy:` Known-Gap (Tier 1 build item).

12. **`npm run typecheck` and `npm test` both stay green** as the contract for "the
    schema and cascade still work" at every phase of the build.
    `proven by:` `npm run typecheck`, `npm test` (existing commands, already passing).
    `strategy:` Fully-Automated.

## Out Of Scope

- **Any input plugin in the first build phase.** No buzzer (keyboard/USB/serial) and no
  network (phone/QR join) input ships until later phases (see Capability Inventory). The
  first usable engine is host-manual only.
- **Hosted/cloud deployment.** The runtime target is a laptop on the venue LAN. A hosted
  transport (Durable Objects, websocket relay, etc.) is a future concern; the transport
  interface must stay pluggable for it, but nothing is deployed to the internet now.
- **User accounts, multi-tenant auth, or billing.** This is not a SaaS. There is one
  author (the user / their council), not a marketplace of hosts.
- **AI question generation, CSV import, game library/sharing marketplace.** Not part of
  this engine's scope; content is authored directly as typed config/presets.
- **Redesigning `src/config/types.ts`.** The schema is treated as settled input to this
  SPEC. Genuine gaps are recorded under Open Questions, not redesigned here.
- **A UI framework.** Vite + vanilla TypeScript only, per locked decision — no React/Vue/
  Svelte, no component framework.
- **Full accessibility certification.** Accessibility config surface (font scale, high
  contrast, reduced motion, captions) is part of the schema and should be honored as
  built, but a full WCAG audit is not a goal of this SPEC.
- **Anti-cheat for buzz timing.** `ARCHITECTURE.md` §6.3 explicitly accepts the residual
  risk of a client lying about its own RTT measurement as "good enough" — building
  cryptographic proof-of-tap is out of scope.

## Constraints

- **Frontend stack:** Vite + vanilla TypeScript, no UI framework (user-locked).
- **Scope:** the full engine — all six game styles (grid, list, trivia, wheel, tictac,
  hangman), multiple scoring engines, lifelines, special tiles, and eventually network
  play — is the target end state (user-locked "full engine" decision).
- **Runtime:** local-first. Runs off a laptop on the venue LAN with no internet
  dependency at runtime. Hosted deployment is a later concern, but the transport
  interface must remain pluggable so it can be added without an engine rewrite
  (user-locked).
- **Input sequencing:** no input plugin exists at first. Host-manual adjudication is the
  only supported input path in the earliest usable phase; buzzer and network input are
  explicitly later phases (user-locked).
- **Four invariants (hard requirements, not preferences)** — from `CUSTOMIZATION.md`:
  1. The stage view stays fully playable with zero players connected
     (`runtime.degradeToOfflineOnNetworkLoss`). Venue wifi failing must never stop the show.
  2. Content is snapshotted into the session at launch
     (`runtime.snapshotContentAtLaunch`). Editing the show mid-session must never mutate
     the live board.
  3. Scoring plugins are pure. `ScoringPlugin.score()` must never mutate state — impurity
     breaks undo silently.
  4. Answers are redacted at the **transport boundary** (`redactQuestion`), never left to
     the view layer to hide.
- **Do not modify `src/config/types.ts`.** Treated as the settled contract for this SPEC.
- **Engine must never special-case host requests.** If a new requirement can only be
  expressed as `if (config.someSpecialCase)` in engine code, that is a signal a plugin
  seam is missing, not a license to add the branch (`CUSTOMIZATION.md` "governing
  principle").
- **Live-event operational requirements are hard requirements, not nice-to-haves** (see
  dedicated section below) — this reflects `ARCHITECTURE.md` §9 being written from real
  failure-mode analysis, not aspirational polish.

## Live-Event Operational Requirements

These come directly from `ARCHITECTURE.md` §9 and are binding requirements for any build
phase that claims to be "usable for a real event," not optional hardening:

- The stage view must render and remain fully operable with **zero** player devices
  connected — this is invariant #1 above, restated as an operational requirement.
- Undo must be reachable in one host action, not buried in a menu (see invariant/AC #6).
- All media (images/audio/video used in questions) must be preloadable before the show
  starts — no network fetch is allowed to happen mid-question. A stalled fetch on the
  projector during a live show is treated as a defect, not an edge case.
- The engine must never read from the authoring/config layer mid-session — only from the
  frozen session snapshot (invariant #2).
- The system should support (not necessarily automate) the pre-show checklist from
  `ARCHITECTURE.md` §9: projector resolution/aspect ratio test, legibility from the back
  row, host laptop notifications/sleep/screensaver disabled, a full dry run on the real
  venue network, and a moderation/kick control for join-based modes.
- A visible manual fallback (e.g., an on-screen or printable scoreboard mirror) should
  remain possible so that a dispute can be settled without trusting a single screen.

## Capability Inventory — Tiers Mapped to Phase Sequence

This tiering is the requirements-level input to the phase program; it does not choose
implementation approach (that's INNOVATE/PLAN). "Built" = exists and passes
`typecheck`/`test` today. Everything else is outstanding.

| Tier | Capability | Status |
|---|---|---|
| **T0 — Foundation (built)** | Config schema (`types.ts`), cascade resolver (`resolve.ts`), defaults, redaction, all 12 plugin registry interfaces, preflight validation, one worked preset (`school-assembly.ts`) | **DONE** |
| **T1 — Playable core, host-manual only** | Phase machine, intent application + event log + undo, one style (`grid`), one scoring engine (`flat`), `local` transport, stage view, host controller — a complete host-manual show is runnable end to end with zero player devices | Outstanding |
| **T2 — Full style + scoring breadth** | Remaining styles (`list`, `trivia`, `wheel`, `tictac`, `hangman`), remaining scoring engines (`speedWeighted`, `multiplier`, streaks, comeback boosts), lifelines, special tiles (daily double, wager), full round-program sequencing (multi-round shows with per-round overrides) | Outstanding |
| **T3 — Local hardware input** | `keyboard`/USB buzzer input plugin — deterministic, zero-network, teams-on-stage buzzing | Outstanding — first input plugin, still local-only |
| **T4 — Network / audience participation** | `network` input plugin, join codes/QR, `websocket`/pluggable transport upgrade from `local`, latency-compensated buzz arbitration, reconnect handling, player view/UI | Outstanding — this is where "player" role and buzzer fairness become real requirements |
| **T5 — Depth & polish** | Integration hooks (webhook/OBS/Discord), persistence/autosave/resume across sessions, accessibility depth (captions, colourblind-safe palette enforcement), hosted transport option (Durable Objects/relay), theming/preset library beyond the one worked example | Outstanding |

Sequencing logic: T1 alone is "a complete, usable game show" per `ARCHITECTURE.md` §10.2's
own framing (their "Tier 1 — a weekend" recommendation), it's just config-driven rather than
hardcoded. T3 (hardware buzzers) is cheap and local before T4 (network) is attempted, matching
`ARCHITECTURE.md` §6.4's explicit recommendation to prefer hardware buzzers over a wifi
buzz system when the format allows it. T4 is where the "player" user story and the buzzer
fairness acceptance criterion (AC #10) actually apply — they are requirements for T4, not
for the phases before it.

## Open Questions

None blocking. The two items below are genuine gaps surfaced by this SPEC pass but do not
block SPEC completion — they are flagged for INNOVATE/PLAN to resolve, and the second is
explicitly a schema question deferred rather than answered here (per the constraint not to
redesign `types.ts`).

- **Wrong-answer policy default.** `ARCHITECTURE.md` §10.3 leaves open whether a wrong
  answer (a) costs nothing and the question dies, (b) costs nothing and re-opens to other
  teams ("steal"), or (c) deducts points and allows a steal. `WrongAnswerRules` in
  `types.ts` already models this as config (not hardcoded), so this is a **preset/default
  values** decision for the show author, not an engine design question — owner: user,
  to be set when the first real preset for the actual event is authored, not before T1
  ships.
  Owner: user (game-design decision, not a build blocker).
- **`validateConfigPlugins()` test coverage gap.** The function exists and is used in
  redaction/cascade tests indirectly, but there is no dedicated test file asserting its
  error messages and coverage of every checked field (transport, scoring, style, lifeline,
  handler, widget, layout). Recorded as a build item for T1, not a schema question.
  Owner: next PLAN pass (T1 scope).

## Background / Research Findings

Sourced from `ARCHITECTURE.md` (reverse-engineered TriviaMaker teardown, verified against
the live product August 2026) and `CUSTOMIZATION.md` (this repo's own customisation design,
already implemented in `src/config/` and `src/registry/`):

- **Two orthogonal axes** define the category: *game style* (grid/list/trivia/wheel/
  tictac/hangman — "what the board looks like") × *play mode* (presenter/crowd/classroom/
  buzz — "where input comes from and who judges"). Fusing these concerns duplicates
  scoring code per style and board code per mode; keeping them as separate interfaces is
  why this repo has a `style` registry and a `scoring` registry as distinct extension
  points (`CUSTOMIZATION.md` Layer 3).
- **Three-plane architecture** (Authoring / Session / Presentation) is the load-bearing
  structural decision. Session state is snapshotted from Authoring at launch and is the
  single source of truth; Presentation views are pure renders of Session state with zero
  business logic, to avoid stage/host desyncs live on stage.
- **The buzzer-fairness problem** is real engineering, not a nice-to-have: naive
  first-packet-wins ordering measures network quality, not reflexes, and is visibly unfair
  on shared venue wifi. The fix is latency-compensated ranking with a grace window
  (`ARCHITECTURE.md` §6.2) — this is deferred to T4 (network input) per the user's locked
  "no input plugin yet" decision, but the requirement itself (AC #10) is preserved so it
  is not lost when that phase starts.
- **Undo, snapshot isolation, and answer redaction are the three invariants that most
  directly prevent live, on-stage failures** (misclicks, editor-mid-show mutation, and
  answer leaks respectively) — this is why they are elevated to hard constraints in this
  SPEC rather than left as implicit good practice.
- **Config layer is complete and tested; engine, UI, and every concrete plugin are not.**
  Confirmed by direct inspection of `src/config/types.ts` (847 lines, typechecks clean),
  `src/config/resolve.ts` + `resolve.test.ts` (passing), `src/registry/index.ts` (12
  interfaces + `validateConfigPlugins`, no concrete plugins registered), and
  `process/context/all-context.md`'s own "Outstanding work" list, which independently
  states: no engine core, no concrete style/scoring/input/transport implementation, no UI,
  no persistence, and no automated tests beyond the config cascade.
- **User's explicit prior-turn rejection:** a one-off-event scope (hardcoded single style,
  single mode, no reusability) was proposed and rejected in favor of building the
  permanent, fully customisable engine — this SPEC reflects that reversal; it does not
  re-litigate it.
