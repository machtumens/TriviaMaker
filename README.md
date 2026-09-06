# TriviaMaker

**[Play the demo →](https://machtumens.github.io/TriviaMaker/)** — the real engine
running entirely in your browser.

A configurable game show engine. Runs a Jeopardy-style quiz off a laptop on
local wifi — projector on one screen, host controls on another device.

Built for live events: no internet at runtime, no accounts, no player app.

## Quick start

```bash
npm install
npm run build
npm run show presets/assembly-show.ts
```

It prints two URLs:

```
Stage: http://192.168.1.10:8080/stage.html
Host:  http://192.168.1.10:8080/host.html?token=...
```

Put **Stage** on the projector and open **Host** on your phone. The host link
carries the session token, so keep it off the screen.

Omit the preset argument for a shorter demo show.

## The two views

**Stage** is read-only. Board, current question, timer, scoreboard. It never
receives the answer key: `src/engine/broadcast.ts` redacts every payload before
handing it to the transport. `node scripts/check-stage-host-isolation.mjs` fails
if anything under `src/stage/` imports host code — run it yourself, it is a
source-level scan and is not wired into `npm run build`.

**Host** shows the answers, plus controls: pick a tile, arm, mark correct or
wrong, undo, advance the round, end the show.

Undo reverses a whole action in one press. Marking an answer changes a score,
consumes a tile and moves the phase; one press puts all three back.

## Writing a show

Shows are typed config files under `presets/`. Copy `assembly-show.ts` and
edit it. `demo-t1.ts` is a shorter smoke test; `school-assembly.example.ts`
exercises features this build does not implement yet and will not start. See [CUSTOMIZATION.md](CUSTOMIZATION.md) for the full surface —
themes, rules, scoring, timers, teams — and for what a style plugin must do.

Round-level overrides are deep-merged over the event config, so a
double-points round is config, not code:

```ts
overrides: {
  rules: { scoring: { multiplier: 2 }, timer: { questionSec: 20 } },
  theme: { color: { accent: '#ff6b35' } },
}
```

The one setting worth tuning for your room is `theme.type.baseSize`. Every
font size is a multiple of it.

## Question packets

Questions can live outside the show, in their own file. A packet is a plain JSON
file of categories and questions — no rules, no theme, no rounds — so the same
questions play in any show that names them.

```json
{
  "packet": 1,
  "title": "General Knowledge",
  "categories": [
    { "title": "Space", "questions": [
      { "prompt": "Which planet is known as the Red Planet?", "answer": "Mars" },
      { "prompt": "What is the name of the galaxy we live in?",
        "answer": "The Milky Way", "accept": ["Milky Way"] }
    ]}
  ]
}
```

**Only `prompt` and `answer` are required.** Ids, `kind` and point values are
filled in when the file loads. Point values come from the round's ladder, so one
packet plays at 100/200/300 in one round and 200/400/600 in the next without
being edited. Optional per question: `accept` (other answers to allow) and
`note` (host-only, not shown on the projector).

The order of questions inside a category is the order of the tiles, top to
bottom — put the easiest first.

Drop `.json` or `.csv` files in `packets/`. Every one is loaded at startup and
any round can play it by name:

```ts
{ id: 'r1', title: 'Round 1', bankId: 'general-knowledge', categoryIds: ['space', 'words'] }
```

The id comes from the title unless you set one (`General Knowledge` →
`general-knowledge`), and category ids the same way.

### Writing questions in a spreadsheet

Most questions start life in a document, so a packet can also be a CSV — one
question per row, exported from Excel, Numbers or Google Sheets:

```csv
category,prompt,answer,accept,note
Animation,Which animated film features a rat who wants to be a chef?,Ratatouille,,
Animation,What is the name of the toy cowboy in Toy Story?,Woody,Sheriff Woody,
Space Opera,What is the name of Han Solo's ship?,The Millennium Falcon,Millennium Falcon,
```

`category`, `prompt` and `answer` are required; `accept`, `note`, `points` and
`title` are optional. Header names are forgiving — `question` works as well as
`prompt`, `topic` as well as `category`.

Alternative answers go in one cell separated by `|`, because a comma would end
the field. Rows group into categories in the order they first appear, and the
row order inside a category is the tile order.

The packet is named after the file (`film-and-tv.csv` → "Film And Tv") unless a
`title` column says otherwise. `packets/film-and-tv.csv` is a working example.

Anything a spreadsheet exports is handled: quoted fields with commas, quotes
doubled inside them, line breaks inside a cell, and the byte order mark Excel
writes at the top of the file.

A packet is also enough to run a show on its own — no preset to copy:

```bash
npm run show packets/example-general-knowledge.json
```

That builds one grid round from the packet's own shape: one column per category,
one row per question, 100/200/300 point ladder, three teams, host picks.

To check a file before the day of the show:

```bash
npm run check-packet
```

It reports missing answers by row, duplicate ids, and categories with too few
questions for the board they are being asked to fill. CSV problems are reported
with the spreadsheet row number, so `row 14` means row 14 in the sheet. The same
checks run at startup, and the show refuses to start on an error.

### Loading questions without restarting

In one-laptop mode the browser runs the engine, so questions can be swapped from
the page itself. Press **Load questions…** in the host window, or drop a `.json`
or `.csv` file anywhere on it.

The show keeps its rules, theme and teams; only the board changes. That is the
whole point of the split — a school can keep its own colours and class names and
play a different set of questions each week.

Packets you load are remembered in the browser, so the next show is one click
from the dropdown. Choosing **Built-in show** goes back to the preset.

Questions can only be swapped before the show starts. Once you press **Start
round** the picker refuses, because changing the board mid-show would invalidate
the tiles already played and everything undo knows about them.

## Running it on one laptop

If the projector is on HDMI from the laptop, both surfaces are the same machine,
so no server is needed at all:

```bash
npm run build && npx http-server dist
```

Open `local/index.html?token=local` for the host controls, click **Open
projector window**, drag that window to the projector and press F11.

The two windows sync over `BroadcastChannel`. The host window owns the engine;
the projector window only renders what it is sent. Redaction is unchanged — the
projector's JavaScript bundle contains no answers at all, not merely a view that
hides them.

Use `npm run show` instead when the host is a separate device such as a phone.

## The demo

[machtumens.github.io/TriviaMaker](https://machtumens.github.io/TriviaMaker/) runs
the actual engine client-side — same phase machine, same scoring, same undo. It
swaps the Node transport for an in-memory one, which is the plugin seam working
as intended.

It is a demo, not the product. Everything is in one browser tab and the answers
are in the bundle, so it can only ever show sample content. A real show runs the
server, keeps the answer key on the host device, and puts nothing but the board
on the projector.

## Project layout

```
src/config/     schema, defaults, the merge cascade, redaction
src/engine/     phase machine, intents, event log and undo, broadcast
src/registry/   plugin interfaces and registration
src/styles/     board formats (grid)
src/scoring/    scoring engines (flat)
src/transport/  local HTTP server, SSE down, POST up
src/stage/      projector view
src/host/       host controller
src/local/      one-laptop mode: engine in the host window, packet picker
presets/        shows
packets/        question packets (.json / .csv)
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm run check-packet
node scripts/check-stage-host-isolation.mjs
```

Tests are plain scripts using `node:assert`; there is no test framework.

## Status

Grid rounds, flat scoring, multi-round programs with intros, intermissions,
score carry and elimination, host-manual adjudication. Buzzers and audience
devices are not implemented — the config models them, the engine does not
serve them yet.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and what is
deliberately left out.

## License

MIT
