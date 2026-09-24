# STATE

## What this is
TriviaMaker: a game-show engine. Projector screen + host screen, one laptop, no internet
at showtime. Built for the OSIS SMAKC school celebration (Family Feud, 16 groups).

## The format the show actually runs (2026-09-24)
Sixteen groups → four heats of four, **drawn at random** (not 1-4/5-8/...) → a final between
the four heat winners. The draw is made once at creation and saved with the show. Sixteen questions dealt 3/3/3/3/4, never reused. Scores do NOT carry:
every heat and the final start level. This is `heatsAndFinalDraft()` in
`src/admin/draft.ts` and it is what a fresh browser gets.

NOT a paired bracket. Inside a heat all four play the same questions. **The host names who
goes through** at the end of a heat (`advanceTeamIds` on the advanceRound command) — the
picker pre-selects the score leader(s), so the normal case is one tap, but the decision is
recorded as a human one. With no names given the score rule applies and a tie on the line
sends both. `presets/family-feud.ts` (server / phone-host mode)
is still the OLD flat single-round show — the heats format is browser-mode only.

## Where it stands (2026-09-24)
- Two ways to run: browser-only (`src/local/`, BroadcastChannel between windows) and
  server mode (`npm run show`, SSE down / POST up).
- **Studio** (`src/admin/`) — new. A light-grey screen that builds a whole show in the
  browser across seven tabs: Show, Rounds, Questions, Teams, Look, Motion, Words. Saves a
  `Draft` to localStorage under `triviamaker.studio`; `src/local/host.ts` picks it up as
  `?show=studio`.
- `src/admin/draft.ts` is the only bridge from Draft to `GameShowConfigInput`. Everything
  else in the app still speaks config, not draft. Panels live in `src/admin/panels/`,
  shared mutable state in `src/admin/store.ts` (refresh = repaint preview+checks,
  rerender = rebuild the panel; typing must never trigger rerender or focus is lost).
- Multi-round Studio shows: one bank per round (`bankId === round.id`), question ids
  prefixed with the round id so nothing collides.
- **`Round.advanceTop`** and **`Round.teamIds`** are new in the schema
  (`src/config/types.ts`). `advanceTop` keeps the top N by score (tie on the line advances
  both); `teamIds` is the round's roster — only those teams play, only they can score, and
  elimination at the end applies inside that list. `rosterFor()` in `engine/session.ts` is
  the one definition; `broadcast.playingTeamIds` carries it to both screens, which is why
  the projector shows four bars during a heat and the host draws no buttons for the rest.
- Control surfaces (host controller, Studio, guide) share `src/ui/controls.css` and are
  light grey. The projector stays fully themable per show.
- 15 test files pass (incl. 4 new `advanceTop` cases + the Studio draft suite), typecheck
  clean, build clean.

## Shape worth knowing
- Config cascade: DEFAULT_CONFIG → preset → round overrides → question overrides
  (`src/config/resolve.ts`). Theme walks to CSS custom properties; the stage reads only vars.
- Grid rounds get `question.points` stamped from the round's ladder (`stampLadderPoints`).
  The Studio relies on this — it never writes per-question points.
- The projector payload has no answer key in it at all (`src/engine/broadcast.ts`);
  `scripts/check-stage-host-isolation.mjs` guards that.

## Deliberately not built
- **Paired brackets.** No match concept; advancement is by score only. Saying otherwise in
  the UI would be a lie the day cannot survive.
- Per-round themes (schema allows it, Studio does not expose it).
- No buzzers, no sound, no finale screen.

## Next, if asked
- A "print the answer key" view for the host.
- Per-round theme overrides in the Studio.
- Drag-to-reorder (up/down buttons exist for rounds, questions and columns).
