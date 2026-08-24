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

## Four invariants worth not breaking

1. **The stage view stays playable with zero players connected.**
   (`runtime.degradeToOfflineOnNetworkLoss`) Venue wifi fails. The show continues
   with the host awarding manually. This is a hard architectural requirement, not
   a nice-to-have.
2. **Content is snapshotted into the session at launch.**
   (`runtime.snapshotContentAtLaunch`) Someone opening the editor mid-show must not
   mutate the live board.
3. **Scoring plugins are pure.** Impurity breaks undo silently.
4. **Answers are redacted at the transport boundary**, not in the view layer.

---

## Files

```
src/config/types.ts        complete schema — the customisation surface
src/config/defaults.ts     base layer; safe-for-live-event defaults
src/config/resolve.ts      cascade, theme→CSS vars, redaction
src/config/resolve.test.ts self-check for the cascade  (npm test)
src/registry/index.ts      plugin interfaces + registry + validation
presets/school-assembly.ts worked 3-round example
```

`npm test` · `npm run typecheck`

---

## Build order

The schema is the contract; everything else plugs into it.

1. **`grid` style + `flat` scoring + `local` transport** — one round, end to end
2. Phase machine (`lobby → board → reading → armed → locked → adjudicate → reveal`)
3. Intent application + event log + **undo**
4. Stage view driven purely by `themeToCssVars()`
5. Host controller as a separate route (never a second tab — one alt-tab on stage
   and the answer key is on the projector)
6. `keyboard` input plugin — hardware buzzers, ~6 lines, may be all you need
7. `network` input + join codes + compensated buzz arbitration
8. Remaining styles, lifelines, special tiles

Steps 1–5 are a complete, usable game show. Everything after is depth.
