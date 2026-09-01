# Customisation Architecture

How this engine makes "change anything" tractable without 500 ad-hoc flags.

---

## The governing principle

> **Anything a host might want to CHANGE is data.**
> **Anything that changes how the machine STEPS is a plugin.**

That single line resolves almost every design question you'll hit.

Point values, colours, timer lengths, penalties, copy, sounds, team names — data,
in `src/config/types.ts`. A brand new board format, a scoring formula nobody has
thought of, a hardware buzzer over serial, a webhook that flips an OBS scene —
plugins, in `src/registry/index.ts`.

**The failure signal:** if you ever want to write `if (config.someSpecialCase)` in
the engine, you have found a plugin seam, not a config flag. Adding that `if` is
how a configurable system rots into a pile of special cases.

---

## Layer 1 — The config cascade

Five layers, deep-merged, later wins:

```
defaults → preset (extends) → event config → round override → question override
```

Every layer is a `DeepPartial`. Authors write only deltas; the engine always
reads a fully-resolved object. No `??` chains in the engine, no undefined checks,
no "which layer did this come from" debugging at 8pm the night before the show.

```ts
resolveConfig(input, lookupPreset)     // → complete GameShowConfig
rulesForRound(config, round)           // + round overrides
rulesForQuestion(config, round, q)     // + question overrides (deepest)
```

**Arrays replace, they do not concatenate.** Positionally merging two arrays of
questions produces frankenstein content that is very hard to debug. Asserted in
`resolve.test.ts`.

### What this buys you

A "double points round" needs zero engine code:

```ts
{
  id: 'r2', title: 'Double Trouble',
  overrides: {
    rules: {
      scoring: { multiplier: 2 },
      timer:   { questionSec: 20 },
      wrongAnswer: { allowSteal: false },
    },
    theme: { color: { accent: '#ff6b35' } },   // visual cue that stakes rose
  },
}
```

The engine does not know what "Double Trouble" is. It reads resolved rules for
the current round and steps. **Real game shows change rules between rounds** — if
your config is flat and global, you cannot express that, and you end up
hardcoding round numbers into the engine. That's the trap this layer avoids.

---

## Layer 2 — Design tokens

All visual customisation is data. `themeToCssVars()` flattens the theme into CSS
custom properties on the document root; every component reads `var(--color-accent)`
and nothing else.

Re-skinning for a different event = editing colour and font values. No component
touches a literal colour, ever.

`type.baseSize` deserves special mention: every font size is a multiplier off it,
so **one number rescales the entire stage view** for a bigger room. This is the
most-used knob in the whole schema and the one you'll reach for during your first
projector test.

---

## Layer 3 — Plugin registries

Twelve extension points. Register at boot, reference by string key from config:

| Registry | Extends | Built-ins to write first |
|---|---|---|
| `style` | board formats | grid, trivia, list, wheel, tictac, hangman |
| `scoring` | point formulas | flat, speedWeighted, multiplier |
| `input` | where buzzes come from | keyboard, network, gamepad, serial |
| `transport` | how state reaches clients | local, websocket, durableObject |
| `lifeline` | 50/50, ask audience, … | fiftyFifty, doubleDip, extraTime |
| `specialTile` | daily double, wager, … | dailyDouble, bonus, sabotage |
| `effect` | confetti, shake, flash | confettiBurst, screenShake, teamFlash |
| `handler` | react to game events | webhook, log, obsScene |
| `layout` | whole stage arrangements | classic |
| `transition` | between-phase animation | zoomFromTile, crossFade, wipe |
| `widget` | persistent screen elements | clock, sponsorStrip |
| `timer` | timer visuals | bar, ring, digits |

```ts
register('scoring', {
  key: 'riskReward',
  score({ question, correct, rules }) {
    const v = (question.points ?? 0) * rules.scoring.multiplier
    return [{ teamId, delta: correct ? v * 2 : -v, reason: 'risk/reward' }]
  },
})
```

Then in config: `rules: { scoring: { engine: 'riskReward' } }`. The engine never
imports it.

`validateConfigPlugins(config)` checks every referenced key **before the show
starts** and lists what is registered when one is missing. A typo'd plugin name
should fail in the green room, not on stage.

---

## Writing a style plugin

Read this before writing a new board format. The `StylePlugin<O>` interface
lives in `src/registry/index.ts`:

```ts
export interface StylePlugin<O = Record<string, unknown>> {
  key: RegistryKey
  buildBoard(round: Round, options: O, state: SessionState): BoardModel
  availableQuestions(state: SessionState, board: BoardModel): string[]
  onSelect(state: SessionState, questionId: string): Intent[]
  onResolved(state: SessionState, correct: boolean): Intent[]
  isRoundComplete(state: SessionState, board: BoardModel): boolean
  stageComponent: string
  hostComponent: string
}
```

`buildBoard`'s third parameter, `state`, is READ-ONLY context (notably `state.styleState`) for styles that need to derive
per-cell data from live session state — a style that doesn't need this (like
`grid`) still must accept the parameter for interface compliance, even unused
(convention: name it `_state`).

### The `board.meta.pointLadder` obligation (REQUIRED — silent-failure trap)

**If your style wants audience-visible point-value labels, `buildBoard` MUST
publish `pointLadder` into the returned `BoardModel.meta`.**
`pointLadder` is read by `broadcast.ts`'s `withPointValueLabels` off
`board.meta.pointLadder`, not off the round's style config. Look at
`gridStyle.buildBoard` in `src/styles/grid.ts` for the pattern — its `meta`
object includes `pointLadder: options.pointLadder` alongside the other
board-level fields.

**Consequence of omitting it: audience point-value labels go blank SILENTLY.**
No error, no warning — `withPointValueLabels` just renders empty strings. This
has been reproduced by registering a deliberately non-compliant style. There is
no automated guard for it, so get it right by hand.

### `styleState`: JSON-safe values only

`SessionState.styleState: Record<string, JsonValue>` is your style's opaque
scratch space. Contents must be JSON-safe — plain objects, arrays, strings,
numbers, booleans, `null`.

The `JsonValue` type enforces this: storing a `Set` or a `Map` is a compile
error. That is deliberate. A `Set` typechecks fine against `unknown` and then
silently serialises to `{}`, which is how a `ReadonlySet` once shipped a bug
where consumed tiles would not render. If your style needs set or map
semantics, store an array or a plain keyed object and rebuild the richer shape
in memory where you read it.

### How a style writes state — the `setStyleState` intent, never mutation

Styles never mutate `state.styleState` directly. Return a `setStyleState`
intent from `onSelect`/`onResolved`:

```ts
onResolved(state, correct) {
  return [{ type: 'setStyleState', nextStyleState: { ...state.styleState, revealedCount: n } }]
}
```

This keeps one host action reversible by one `undo()` press. `log.ts`
snapshots the union of touched keys before applying a batch; a direct mutation
happens outside that snapshot, so undo silently stops restoring it.

### Caveat: `setStyleState` adopts your object by reference

`applyIntent` assigns `intent.nextStyleState` directly into `state.styleState`,
and the same object reference is also retained in the undo log's audit entry.
**Do not retain and later mutate an object you have already dispatched** — if
you do, you corrupt both live state and the logged audit record at once. Always
hand over a freshly-built object
(e.g. spread `{ ...state.styleState, ... }` into a new object each time, as
shown above) rather than reusing and mutating a held reference.

---

## Layer 4 — Intents, not mutations

Plugins receive read-only `SessionState` and return `Intent[]`. They never mutate.

```ts
type Intent =
  | { type: 'awardPoints'; teamId: string; delta: number; reason: string }
  | { type: 'setPhase'; phase: Phase }
  | { type: 'lockout'; teamId: string }
  // …
```

The engine applies intents and appends them to an event log. Three things fall
out for free:

1. **Undo** — pop the log, recompute. No hand-written inverse operations. The host
   *will* misclick in front of the whole school.
2. **Reconnect** — replay or snapshot; both work.
3. **Dispute resolution** — every `ScoreDelta` carries a `reason`, so "why does
   Class Y have 400?" is answerable from the host screen.

This is why `ScoringPlugin.score()` must be **pure**. A scoring engine that
mutates state breaks undo silently, and you find out live.

---

## Layer 5 — The redaction boundary

`redactQuestion(q, audience)` strips `answer`, `acceptedAnswers`, `hostNote`,
`correctChoiceIndex`, and `numericAnswer` for `'stage'` and `'player'`.

Call it **at the transport boundary**. Never ship the answer key to a client and
trust that client not to render it — anyone can open devtools, and the projector
bundle should not contain the answers at all. Asserted in `resolve.test.ts`.

---

## The customisation surface, by domain

Everything below is already typed in `src/config/types.ts`.

**Content** — question kinds (text, multiple choice, true/false, numeric-closest,
ordering, matching, image, audio, video, survey, + custom), accepted-answer lists,
fuzzy tolerance, media with clip bounds and reveal timing, host teleprompter notes,
after-answer trivia beats, difficulty, tags.

**Board** — grid dims and point ladders, wheel segments with weights, list slots
and strikes, tic-tac-toe size and win length, hangman letters; selection mode
(free pick / sequential / random), consumed-tile appearance, dramatic category
reveal.

**Flow** — who picks next (host / last winner / rotation / trailing team / random),
answer rights (buzz / turn owner / everyone), attempts, pass, arming, false-start
policy (ignore / lockout / penalty), reopen-after-wrong, steal count and value.

**Timing** — per-question, per-answer, per-steal, per-wager clocks; warning
threshold; auto-advance; host pause. Every one overridable per round and per
question.

**Scoring** — flat / speed-weighted (with a floor, so slow-but-correct isn't
insulting) / multiplier / custom; streaks with caps; comeback boosts for trailing
teams; hidden wagers with a minimum allowance so teams on zero can still play;
score visibility (always / between questions / between rounds / final only);
negative totals; ordered tie-break rules.

**Teams** — pre-authored or lobby-created, colours, logos, handicap starting
scores, captain-only answering, auto-balance, elimination rounds.

**Join** — none (stage-only) / code / QR / both / preassigned; code length and
charset; late join; reconnect grace; profanity filter; name approval; kick;
hide names on stage.

**Presentation** — aspect ratio, projector overscan safe area, swappable stage
layout, scoreboard position and style, logo and lower-thirds, arbitrary widgets.

**Motion & sound** — per-animation durations, easings, named transitions, effects
per outcome, master motion switch and speed multiplier; full SFX and music sets;
**per-team buzz stingers** so the room hears who buzzed before it reads the screen.

**Accessibility** — font scale, high contrast, colourblind-safe palette,
redundant encoding (never colour alone), reduced motion, captions, touch targets.

**Runtime** — offline degradation, media preloading, content snapshotting,
autosave and resume, undo depth, transport driver, OBS overlay route.

**Integration** — subscribe handlers or webhooks to any engine event
(`buzz.locked`, `answer.correct`, `round.ended`, …) to drive lights, OBS, Discord,
a scoreboard LED wall, whatever.

---

## Five invariants worth not breaking

1. **The stage view stays playable with zero players connected.**
   (`runtime.degradeToOfflineOnNetworkLoss`) Venue wifi fails. The show continues
   with the host awarding manually. This is a hard architectural requirement, not
   a nice-to-have.
2. **Content is snapshotted into the session at launch.**
   (`runtime.snapshotContentAtLaunch`) Someone opening the editor mid-show must not
   mutate the live board.
3. **Scoring plugins are pure.** Impurity breaks undo silently.
4. **Answers are redacted at the transport boundary**, not in the view layer.
5. **`styleState` is server-only; it does not go on the wire.**
   `styleState` appears nowhere in
   `src/engine/broadcast.ts` — style-derived data reaches clients only via
   `board.meta`/`board.cells[].meta`, which `buildBoard` constructs and
   `broadcastState` redacts. This is deliberate, not an oversight or a gap to
   "complete" later: because `styleState` never reaches the wire,
   answer-adjacent intermediates a style might compute (e.g. hangman's
   masked-label computation) structurally cannot leak to the projector. **Do
   not add `styleState` to `BroadcastPayload`.** If a client genuinely needs
   some piece of style state, project the specific value through
   `board.meta` (with the same redaction discipline as everything else on
   that path) — do not widen the payload to carry the whole opaque bag.

---

## Files

```
src/config/types.ts     complete schema — the customisation surface
src/config/defaults.ts  base layer; safe-for-live-event defaults
src/config/resolve.ts   the cascade, theme→CSS vars, question redaction
src/registry/index.ts   plugin interfaces, registry, preflight validation
src/engine/phase.ts     the transition table
src/engine/intents.ts   intent application and the touched-key map
src/engine/log.ts       event log and undo
src/engine/session.ts   host actions, content resolution, adjudication
src/engine/broadcast.ts the one place payloads are built and redacted
src/styles/grid.ts      the worked style plugin
src/scoring/flat.ts     the worked scoring plugin
src/transport/local.ts  HTTP server, SSE down, POST up
```

Every `*.ts` file has a `*.test.ts` beside it where it carries logic.

```bash
npm run typecheck
npm test
node scripts/check-stage-host-isolation.mjs
```

---

## What is built, and what is not

Built and playable: the `grid` style, `flat` scoring, the `local` transport, the
phase machine, intents with event-log undo, multi-round programs with intros,
intermissions, score carry and elimination, the stage view and the host
controller.

Modelled in the schema but with no engine behind them yet — a config can set
these, and nothing will happen:

- the other five styles (`list`, `trivia`, `wheel`, `tictac`, `hangman`)
- `speedWeighted`, `multiplier`, streak and comeback scoring, and wagers
- lifelines and special tiles
- every input plugin: buzzers, player devices, join codes
- `integration.hooks` and webhooks
- `GridStyle.selection` — `sequential` and `random` currently behave as
  `freePick`

`flat` scoring warns on the console when it is handed a bonus rule it does not
implement. The rest are silent, so check this list before authoring a show that
depends on one.
