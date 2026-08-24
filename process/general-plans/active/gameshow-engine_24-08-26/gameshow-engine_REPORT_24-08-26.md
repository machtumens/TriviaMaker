---
phase: gameshow-engine-t1-execute
date: 2026-08-24
status: COMPLETE
feature: general
plan: process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md
---

# EXECUTE REPORT — Game Show Engine T1 (Playable Core, Host-Manual)

## TL;DR

All 32 checklist items implemented. All four gate commands green from a clean
`dist/`. 12 test files pass, typecheck clean, stage/host isolation clean, build
clean. A full round was additionally played end-to-end over real HTTP against
the built bundles, which is stronger evidence than the automated suite alone.

Six places where the plan was wrong, self-contradictory, or under-specified are
documented below with what was done instead. None required touching
`src/config/types.ts` or `src/registry/index.ts` — both are byte-identical to
their pre-EXECUTE state (`git diff` empty).

---

## What Was Done

| Sub-phase | Items | Files |
|---|---|---|
| 0 — preflight coverage | 1, 2 | `src/registry/validateConfigPlugins.test.ts` |
| 1 — phase machine | 3, 4, 5 | `src/engine/phase.ts`, `phase.test.ts` |
| 2 — intents, log, undo, session | 6-11, 11a | `src/engine/intents.ts`, `intents.test.ts`, `log.ts`, `log.test.ts`, `session.ts`, `session.test.ts` |
| 3 — grid + flat | 12-16 | `src/styles/grid.ts`, `grid.test.ts`, `src/scoring/flat.ts`, `flat.test.ts` |
| 4 — broadcast + transport | 17, 17a, 18-20 | `src/engine/broadcast.ts`, `broadcast.test.ts`, `src/transport/local.ts`, `local.test.ts` |
| 5 — stage view | 21, 22 | `src/stage/index.html`, `src/stage/main.ts` |
| 6 — host controller | 24, 25 | `src/host/index.html`, `src/host/main.ts` |
| 7 — integration | 27, 27a, 27b, 28, 29 | `src/registry/bootstrap.ts`, `bootstrap.test.ts`, `presets/demo-t1.ts`, `src/server.ts`, `package.json` |
| 8 — cross-cutting gates | 30-34 | `vite.config.ts`, `tsconfig.json`, `scripts/check-stage-host-isolation.mjs`, `scripts/run-tests.mjs` |
| Test Plan extras | — | `src/engine/host-manual-round.test.ts` |

27 new files, 3 modified (`package.json`, `tsconfig.json`, `package-lock.json`).

### Hard constraints — verified, not assumed

| Constraint | Evidence |
|---|---|
| Zero edits to `src/registry/index.ts`, `src/config/types.ts` (also `resolve.ts`, `defaults.ts`, `school-assembly.ts`) | `git diff --stat` on those five paths returns empty |
| Zero new runtime dependencies | `dependencies` still `{tsx, typescript}`; `vite` is `devDependencies` only |
| L2a — batch-union snapshot before any apply | `log.ts:64-78`; proven by `log.test.ts` (d)/(e) and by live HTTP undo (below) |
| L9/L17 — one broadcast call site | `grep '\.broadcast('` → only `broadcast.ts:183-185` |
| L17 — one `buildBoard` call site | `grep 'buildBoard('` → only `broadcast.ts:130` (plus the interface decl and grid's own impl) |
| L16 — one `applyIntentsWithLog` caller | `grep` → only `session.ts:193` (`dispatchHostAction`) |
| Deferred D3 gaps left open | `SessionState` has no `board` field; `buildBoard` still receives no `state`; `StylePlugin` signature untouched |

---

## Test Gate Outcomes

Command run verbatim from the plan (item 34), from a clean `dist/`:

```
rm -rf dist && npm run typecheck && npm test \
  && node scripts/check-stage-host-isolation.mjs && npm run build
```

**Exit code 0.**

```
> tsc --noEmit                                    (no output = clean)

> tsx scripts/run-tests.mjs
PASS src/config/resolve.test.ts
PASS src/engine/broadcast.test.ts
PASS src/engine/host-manual-round.test.ts
PASS src/engine/intents.test.ts
PASS src/engine/log.test.ts
PASS src/engine/phase.test.ts
PASS src/engine/session.test.ts
PASS src/registry/bootstrap.test.ts
PASS src/registry/validateConfigPlugins.test.ts
PASS src/scoring/flat.test.ts
PASS src/styles/grid.test.ts
PASS src/transport/local.test.ts
12 test file(s) passed in 0.1s

✓ stage/host isolation: 1 stage file(s) checked, no host imports

> vite build
dist/host/index.html                            5.08 kB
dist/stage/index.html                           6.02 kB
dist/assets/modulepreload-polyfill-P2Xu9kJm.js  0.67 kB
dist/assets/stage-B7jb8kHW.js                   3.61 kB
dist/assets/host-BaCWSXoc.js                    4.60 kB
✓ built in 36ms
```

### Additional evidence beyond the plan's gates

**Bundle inspection** (`dist/assets/stage-*.js`) — zero occurrences of any demo
answer string (`Mars`, `Gravity`, `Milky Way`, `Neil Armstrong`,
`Photosynthesis`) and zero occurrences of `hostNote` / `acceptedAnswers`. The
host bundle contains both field names (it renders them). No `node:` import
leaked into either browser bundle.

**Live HTTP round** — booted `npx tsx src/server.ts` against the built `dist/`
and played through the transport. Verbatim results:

```
retained frame on connect: stage phase=lobby cells=9 labels=["100","100","100"]
host board labels        : ["Which planet is known as the Red Planet?", ...]
stage payload has 'Mars'?  false   host config banks: 1
POST /command wrong token -> 401
POST /command no token    -> 401
start       -> phase=board available=9
select      -> phase=reading
  host  question: prompt="Which planet is known as the Red Planet?" answer="Mars"
  stage question: prompt="Which planet is known as the Red Planet?" answer=undefined
arm         -> phase=armed clockRunning=true questionSec=30
pause       -> clockRunning=false
resume 12s  -> clockRunning=true remaining≈12s
markCorrect -> phase=reveal scores=[["Red",100],...] log=6 consumed=1
undo        -> phase=armed scores=[["Red",0],...]   log=7 consumed=0
next        -> phase=board available=8 consumed=1
stage tile after play -> label="100" consumed=true
GET /../../../etc/passwd      -> 403 "forbidden"
GET /%2e%2e/%2e%2e/etc/passwd -> 403
```

The `undo` line is the one that matters: a 3-intent host action was reversed —
score, consumption AND phase — by ONE press, over the wire, and the log GREW
(6 → 7) rather than shrinking. That is L2a and L3 proven at runtime, not just in
a unit test. SIGTERM shutdown was verified separately (process exits cleanly).

---

## Where The Plan Was Wrong, Ambiguous, Or Self-Contradictory

Six findings. Each names what the plan said, why it could not be followed
literally, and what was built instead.

### 1. Item 17a case (d) contradicts item 17 / L9 / L17 (MATERIAL)

Item 17a(d) and Acceptance Criterion 17 say *"no payload on **any** channel
contains `answer`, `acceptedAnswers`, `hostNote`, `correctChoiceIndex`, or
`numericAnswer` anywhere."*

That is not implementable. Item 17, Design Lock L9 and Design Lock L17 all say
the host gets the current question **unredacted** — and the host must, since
adjudicating requires the answer key and the teleprompter note. Acceptance
Criterion **7** states the correct, narrower rule: *"no payload broadcast to the
`'stage'` or `'player'` channel"*.

**Built:** AC#7's rule. `broadcast.test.ts` asserts the five fields are absent
from stage and player, and additionally asserts the host payload **does** carry
`answer` and `hostNote` — so the split is proven deliberate rather than
accidental.

### 2. The plan never noticed that `state.config` leaks every answer (MATERIAL, would have been a live incident)

Item 17 says stage and player get *"a state view where the current question is
replaced by `redactQuestion(...)`"*. `SessionState.config` is the full resolved
`GameShowConfig`, which contains `content.banks` — **every question and every
answer in the show**. A literal "state view" sent to the projector would have
leaked the entire answer key on the very first broadcast, and the plan's own
redaction test would not have caught it: a key-name scan trips over the config's
legitimate `copy.answer` section.

**Built:** `broadcast.ts` strips `content.banks` for stage and player
(`withoutContent`). `broadcast.test.ts` uses unique sentinel strings and scans
the entire serialised payload by VALUE, not by key name.

### 3. `SessionState` Sets do not survive JSON (MATERIAL, blocking)

`consumed` and `lockedOutTeamIds` are `ReadonlySet<string>`.
`JSON.stringify(new Set(['a']))` is `{}`. Broadcasting the state object as-is
would have delivered empty objects, and no client could have rendered a
consumed tile. The plan does not mention serialisation anywhere.

**Built:** `BroadcastPayload` is an explicit JSON-safe view; both Sets travel as
arrays. Asserted in `broadcast.test.ts`.

### 4. Item 12's `cells[].consumed` cannot be computed where the plan puts it

Item 12: *"`cells[].consumed` is computed from `state.consumed`."* But
`buildBoard(round, options)` receives no `state` — that is deferred gap D3(ii),
which I was explicitly told not to close.

**Built:** `buildBoard` emits `consumed: false`; `broadcastState` derives the
real value per cell from `state.consumed` (`withDerivedConsumption`). This
satisfies item 12's actual requirement ("derived from `state.consumed`, not
stored separately") at the one place that has state, and closes no D3 gap.

### 5. Item 18's literal path-resolution line would 403 every asset

Item 18 specifies `path.resolve(staticDir, decodeURIComponent(req.url...))`.
`path.resolve('dist', '/assets/x.js')` returns `/assets/x.js` — an absolute
second argument wins — so the containment check would reject **every** normal
asset request, not just traversal attempts.

**Built:** leading slashes are stripped before `path.resolve`, so requests
resolve relative to the root. The containment check itself (the actual security
control) is unchanged and still refuses both traversal variants with 403 —
verified with raw `node:http` requests, because `fetch`/WHATWG-URL silently
normalises `/../../etc/passwd` to `/etc/passwd` client-side and would have made
the traversal test pass without the server ever being asked.

### 6. Item 10 case (b) asks for something L3 makes impossible

Item 10(b): *"apply N events where N > `depth`, undo `depth` times."* Under L3
every undo APPENDS a reversal event, so reversals consume window slots and mark
their targets reversed. With N=10, depth=5 only **three** undos succeed before
`undone: false`. "Undo `depth` times" cannot happen for any depth ≥ 2.

**Built:** the test undoes until refusal, then asserts what the item actually
asks for — the loop terminated with `undone: false`, the reach was bounded
(`successes < depth`), and the (N-depth)th event was never reversed.

### Smaller items

- **Item 1(a) / AC#5 say the preflight error lists "registered alternatives".**
  `validateConfigPlugins`'s `check()` emits `${where}: unknown ${kind} plugin
  "${key}"` with no such suffix (`registry/index.ts:264-269`) — the plan itself
  admits this in item 27's citation correction, but items 1 and AC#5 were never
  updated. Adding the suffix would require editing a protected file. The test
  asserts what the function actually produces. `validateConfigPluginsT1` DOES
  list alternatives, per item 27's template, and `bootstrap.test.ts` asserts it.
- **Item 1's "fake `RegistryKind` string"** cannot make `validateConfigPlugins`
  return zero errors for case (c) — it only checks real kinds. Used unique
  `vcp-test-` KEYS under real kinds instead: same isolation from `bootstrap.ts`,
  and case (c) becomes writable.
- **`bootstrap.test.ts` asserts `'grid'` is listed**, not that it is the only
  entry: `broadcast.test.ts` registers a fixture style and
  `validateConfigPlugins.test.ts` registers `vcp-test-style` in the same process.
- **L1's "exercised path" lists `adjudicate`**, but item 25's button list has no
  adjudicate control and item 10(e) locks `resolveAnswer` to exactly 3 intents
  with one trailing `setPhase`. T1 therefore walks `armed -> reveal` and
  `adjudicate` is reachable-but-unexercised, same status as `locked`/`wager`.
- **`undo(state, depth)` has no `seq`/`at` parameter**, so the reversal event
  derives `seq` from the last log entry and `at` from `Date.now()`.

---

## Decisions The Plan Left Open

Documented because a reviewer should see them as choices, not accidents.

1. **`layout: 'classic'` had to be registered.** `validateConfigPlugins` checks
   `layout.stageLayout` for every config and the default is `'classic'`. Nothing
   in the plan registers a layout plugin, so preflight would have rejected
   **every** config including `demo-t1` and `npm run show` could never start.
   `bootstrap.ts` registers a marker `{ key: 'classic' }` with a comment.
2. **`availableQuestionIds` added to the payload.** Item 25 says the host calls
   `grid.availableQuestions(state, board)`, but the host has a payload, not a
   `SessionState`, and faking one needs a cast. Computing it server-side (where
   the style plugin lives) keeps style semantics on the server, consistent with
   L17's "clients never call `buildBoard`".
3. **Retained SSE frame.** Item 28 broadcasts "after every mutation" only, so a
   projector opened mid-show would sit blank until the host next pressed
   something. `local.ts` retains the last frame per channel and replays it on
   connect. `broadcastState` is still the only producer. Covered by a test.
4. **`next` vs `endRound` are separate commands.** L17 forbids any file other
   than `broadcast.ts` from calling `buildBoard`, so `server.ts` cannot evaluate
   `isRoundComplete`. The host already receives `round.isComplete` and picks the
   command. No second board-building site.
5. **`STATIC_ALIASES` in `local.ts`.** Vite emits `dist/stage/index.html`; item
   28 prints `/stage.html`. A three-entry alias map (`/`, `/stage.html`,
   `/host.html`) reconciles them.
6. **`resolvedQuestionSec` follows the full cascade** (event → round →
   question), not just "the resolved round's timer config" as item 6 says. Same
   helper is used by `applyIntent`'s clock arithmetic and by the payload, so the
   engine and the on-screen countdown can never disagree — which they would for
   any question carrying a `timer.questionSec` override (`school-assembly.ts`
   has one).
7. **A short category contributes fewer tiles** rather than throwing. Item 12
   says T1 does not validate question ordering at runtime; throwing inside
   `buildBoard` would crash on every broadcast.

---

## Bugs Found And Fixed During Implementation

Three defects that a green-looking implementation would have shipped:

1. **`flat.score()` returned `-0`** for a zero penalty (`-(0)` is `-0` in JS).
   Caught by `assert.equal`, which uses `Object.is`. Fixed with a `negate()`
   helper.
2. **The stage question overlay stacked.** `render()` appended a new overlay to
   `document.body` without removing the previous one, so every state push added
   another layer. Fixed to remove-then-append.
3. **The host controller re-rendered its entire DOM once per second** to update
   the countdown, which would reset scroll position mid-tap on a phone. Fixed to
   update only the phase pill's text.

Plus one hygiene fix: `server.ts` no longer consumes a sequence number when a
command is rejected, so the audit trail has no holes.

---

## What Was Skipped Or Deferred

- **D3's two contract gaps** — untouched, as instructed. `SessionState` has no
  style-state slot and `buildBoard` still receives no `state`.
- **Everything T2+** — no other styles, no other scoring engines, no lifelines,
  no special tiles, no input plugin, no buzz arbitration, no persistence.
- **`school-assembly.ts`** — left byte-identical, as the plan requires.
- **Manual gates (items 23, 26, and the pre-show dry run)** — see below.

---

## Plan Deviations

All deviations are within blast radius. Every one is listed in the two sections
above. No hard-stop class deviation occurred: nothing touched auth, billing,
schema, a public external API, container lifecycle, or secret management. The
host token remains a local-LAN session secret generated per run.

---

## Test Infra Gaps Found

- **No CI.** `npm run typecheck && npm test` is still a local-only gate.
  Recommend a minimal workflow before the first live dry run.
- **Import isolation is source-level only.** `check-stage-host-isolation.mjs`
  reads import specifiers; a transitive import through a third module would not
  be caught. The bundle-content scan performed manually this session (`grep` for
  answer strings in `dist/assets/stage-*.js`) is stronger and could be
  scripted — recommended as a cheap follow-up.
- **Tests share one process.** `run-tests.mjs` imports every test file into the
  same process so the registry is shared. Test files must register unique keys;
  the registry throws on duplicates, which is the intended signal.
- **9 test files now, past `all-tests.md`'s ~8-file Vitest trigger.** Handled by
  the aggregator per L11 rather than adding a dependency. Re-evaluate at T2.

---

## Known Gaps Carried Forward

- **T1 plays ROUND 1 only.** No `Intent` variant touches `roundIndex`, so there
  is no way to advance rounds without a contract change. `demo-t1.ts` authors two
  rounds (as item 27b asks) and documents this in a header comment. This is a
  consequence of the settled `Intent` union, not an implementation shortcut, and
  belongs in the T2 SPEC.
- **Duplicate `categoryIds`** — unguarded, as recorded in the plan's Open Item 6.
- **`GridStyle.columns` is not reconciled** against the resolved category count.
  Column count is driven by `categories.length`.
- **Host token comparison is not constant-time** — plan Open Item 4, accepted.
- **Buzzer fairness / visual regression** — correctly out of T1 scope.

---

## Manual Gates (NOT satisfied — human confirmation required)

These three are Agent-Probe/Manual by design and remain open. No agent judgment
substitutes for them.

| Gate | Item | Status |
|---|---|---|
| Projector legibility from the back of a room | 23 | **NOT DONE** — needs a real external display |
| Host token visibly required from a browser network tab | 26 | Partially covered: 401 confirmed via raw HTTP (both no-token and wrong-token). The browser-tab confirmation itself is not done. |
| Full pre-show dry run on the real venue network | AC#11 | **NOT DONE** |

---

## Closeout Packet

- **Selected plan:** `process/general-plans/active/gameshow-engine_24-08-26/gameshow-engine_PLAN_24-08-26.md`
- **Finished:** all 32 checklist items; 27 new files; 3 modified files.
- **Verified:** all four plan gate commands green from a clean `dist/`; plus
  bundle-content inspection and a live HTTP round including one-press undo,
  pause/resume, token rejection and path-traversal rejection.
- **Unverified:** the three manual gates above.
- **Remaining cleanup:** context docs (`process/context/all-context.md` still
  says "Not yet built: engine core... any UI... any concrete plugins", and
  `tests/all-tests.md` still lists `npm test` as `tsx src/config/resolve.test.ts`)
  — both are UPDATE PROCESS scope, deliberately not edited during EXECUTE.
- **Next valid state:** `Keep in active/testing` — code-complete and
  automated-gate-green, but the three manual gates are genuinely open and the
  plan's own Phase Completion Rules say the plan is VERIFIED only once those are
  confirmed by a human.

## Forward Preview

### Test Infra Found
Framework-free `tsx` + `node:assert/strict`, now aggregated by
`scripts/run-tests.mjs` (auto-discovers `src/**/*.test.ts`). Registry is shared
across test files in one process — new tests must register unique plugin keys.

### Blast Radius Changes
Seven new top-level directories: `src/engine`, `src/styles`, `src/scoring`,
`src/transport`, `src/stage`, `src/host`, `scripts`, plus root `vite.config.ts`.
`src/config/**` and `src/registry/index.ts` remain untouched and should stay so.

### Commands to Stay Green
```
npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build
npm run show                 # boots the demo on :8080 (PORT env to override)
```

### Dependency Changes
`vite@^8.2.2` added to `devDependencies`. Runtime `dependencies` unchanged.
