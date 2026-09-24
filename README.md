# TriviaMaker

**A game-show engine for live events.** The projector shows the board, you hold the
controls on a second screen, and the projector never receives an answer you have not
revealed. Nothing to install, no accounts, no internet once the page has loaded.

**[Run the show →](https://machtumens.github.io/TriviaMaker/local/index.html?show=studio&token=local)** ·
**[Build your own →](https://machtumens.github.io/TriviaMaker/admin/index.html)** ·
**[Read this guide as a page →](https://machtumens.github.io/TriviaMaker/guide/index.html)**

This page is the whole manual: how to run the show on the day, how to change the
questions, and how to build a different show from scratch. Written for whoever is
holding the laptop.

## Links

| Screen | Open this |
| --- | --- |
| **Host controls — the show** | [.../local/index.html?show=studio&token=local](https://machtumens.github.io/TriviaMaker/local/index.html?show=studio&token=local) |
| **Studio — change the show** | [.../admin/index.html](https://machtumens.github.io/TriviaMaker/admin/index.html) |
| Host controls — flat Family Feud (one round, all 16 groups) | [.../local/index.html?show=feud&token=local](https://machtumens.github.io/TriviaMaker/local/index.html?show=feud&token=local) |
| Projector | [.../local/stage.html](https://machtumens.github.io/TriviaMaker/local/stage.html) |
| Host controls — Quiz Bowl | [.../local/index.html?show=assembly&token=local](https://machtumens.github.io/TriviaMaker/local/index.html?show=assembly&token=local) |
| Host controls — Demo | [.../local/index.html?show=demo&token=local](https://machtumens.github.io/TriviaMaker/local/index.html?show=demo&token=local) |
| Source code | [github.com/machtumens/TriviaMaker](https://github.com/machtumens/TriviaMaker) |

All of them start `https://machtumens.github.io/TriviaMaker/`.

Open the **host controls** link only. The projector link is there in case you need it,
but the normal way is the **Open projector window** button inside the host page — it
opens the projector already paired to your show. A projector window opened by hand still
works, as long as the host window is open on the same machine.

The `token=local` on the end is not a password. It means nothing in this mode and the
show runs without it; it exists for the wifi setup further down, where it does matter.

## Quick start

**The week before**

1. Open the [Studio](https://machtumens.github.io/TriviaMaker/admin/index.html) on the laptop
   that will run the show. It builds the whole thing on first open — sixteen groups, four
   heats, a final, all sixteen questions dealt out.
2. **Teams** tab: put the real class names in.
3. **Rounds** tab: look at the draw (`Heat 1: Group 6, Group 5, …`). **Redraw the groups at
   random** until you like it, then leave it. Tell the groups which heat they are in.
4. That is it. It saves itself on that laptop, in that browser.

**On the day**

| # | Do this |
| --- | --- |
| 1 | Open the [host controls](https://machtumens.github.io/TriviaMaker/local/index.html?show=studio&token=local) on the laptop |
| 2 | Press **Open projector window**, drag it to the projector, press **F11** |
| 3 | Press **Start round** |
| 4 | Tap a question — it opens on the projector with the answers hidden |
| 5 | Tap **the group that answered**, then tap **the answer they said**. It flips over and pays them |
| 6 | Wrong answer → **Strike**. Three strikes is just an X on the screen; you decide what it means |
| 7 | Heat over (its 3 questions done) → **Who goes through?** → tap the group → **Send through →** |
| 8 | Repeat for all four heats, then the final. Highest score in the final wins |

**The two rules of the room**

- The host window has the answers on it. Keep it facing you, never at the projector.
- **Undo last action** is at the bottom of the host screen and reaches back through
  everything — wrong group, wrong answer, wrong winner. Use it instead of arguing.

Everything below is the long version.

## Running the show

Open one link, press one button, and you have both screens.

1. On the laptop, open [the host controls](https://machtumens.github.io/TriviaMaker/local/index.html?show=studio&token=local).
   This window runs the whole show — keep it open. The first time a browser opens it, the
   show is the one below: four heats and a final, with the shipped questions already dealt.
2. Press **Open projector window**. A second window appears showing the board.
3. Drag that window to the projector and press **F11** for fullscreen.
4. Back in the host window, press **Start round**.
5. Tap a question from the list. It opens on the projector with its answers hidden.

The host window is the one with the answers on it, so keep it facing you. The projector
window only ever receives what has been revealed — the hidden answers are not in it at
all, so nobody can find them by looking.

The two windows talk to each other inside the browser. Once the page has loaded, the show
needs no internet, no server and no accounts. You can close the projector window and
reopen it mid-show; it comes back showing the current state.

## The format this is set up for

Sixteen groups, four heats, one final.

| Round | Who plays | What it does |
| --- | --- | --- |
| Heat 1 | four groups, drawn at random | 3 questions; one group goes through |
| Heat 2 | four more | 3 questions; one group goes through |
| Heat 3 | four more | 3 questions; one group goes through |
| Heat 4 | the last four | 3 questions; one goes through, then an intermission |
| Final | the four heat winners | the last 4 questions; highest score wins the show |

**The groups are drawn at random, not 1–4, 5–8, 9–12, 13–16.** The draw is made when the
show is created and then saved, so it is the same on the laptop, on the projector and on
whatever you read it off — a group can be told which heat it is in before the show starts.
To see it, or to draw again, open the Studio's **Rounds** tab: the draw is printed there
(`Heat 1: Group 6, Group 5, Group 14, Group 12 → 1 continue`) with a **Redraw the groups at
random** button above it. Redrawing keeps each heat the same size and reshuffles who is in
it.

Sixteen questions, dealt 3 / 3 / 3 / 3 / 4. **No question is ever asked twice** — each round
holds its own, and the Studio deals them in order.

Scores do **not** carry between rounds. Every heat starts at zero, and so does the final,
so a group that won its heat 300–20 does not walk into the final 300 points up.

During a heat the projector shows only the four groups playing it. The other twelve are
not on screen and cannot be given points — the host controls do not draw their buttons.
A group that has won its heat shows as *not this round* on the host until the final; a
group that lost its heat shows as *out*.

**One thing it does not do:** pair groups against each other. "Group 1 vs Group 2, winner
plays Group 3" is not how this runs. Inside a heat all four play the same questions and the
best of them goes through.

**You decide who goes through, not the software.** When a heat finishes, the host screen
asks **Who goes through?** and shows the four groups with their scores. The leader is
already picked, so the normal case is one tap on **Send [group] through →**. A tie opens
with every tied group picked and you narrow it down; you can also send two through if that
is what the room decides, or send through a group that did not top the heat, if something
happened that the scoreboard does not know about. Whatever you choose is what the show
records — and **Undo last action** reaches back through it like anything else.

## Hosting a round

Awarding an answer is two taps: **who said it**, then **what they said**.

| You do | What happens |
| --- | --- |
| Tap a question | It opens on the projector, answers hidden, clock starts |
| Tap a group chip | That group is selected; the answer buttons light up |
| Tap the answer they said | It flips over on the projector and pays that group its points |
| Tap another answer | Same group again — they stay selected while they are on a roll |
| Tap a different chip first | Switches to that group |
| **Strike** | Puts a red X on the projector |
| **Send [group] through →** | Ends the heat: that group carries on, the rest are out |
| **Next** | Back to the question list |
| **Undo last action** | Reverses the whole last action, points included |

The group stays selected on purpose, so a group calling three answers in a row costs
three taps rather than six. The catch: tapping a selected group's chip *again* deselects
them. If the answer buttons go grey, that is why — tap their chip once more.

When the last answer is revealed the question closes itself and the board returns. A
question does not have to be finished: press **Next** whenever you want to move on, and
the unrevealed answers simply never show.

**Strike is decoration.** In real Family Feud a strike ends a family's turn, but every
group here competes on every question, so there is no turn to lose. It puts an X on the
screen and does nothing else.

**Undo** goes back 50 actions and reverses everything an action did at once — a wrong
award takes the points back and re-hides the answer in one press.

## Building your own show

Everything above runs the show that ships. To make your own — your questions, your groups,
your colours — open the **Studio**: [.../admin/index.html](https://machtumens.github.io/TriviaMaker/admin/index.html)

Nothing is installed and nothing is uploaded. What you build is saved in that browser on
that laptop, so build it on the machine that will run the day — or export it and carry the
file.

Seven tabs:

| Tab | What you set |
| --- | --- |
| **Show** | Title and subtitle (the two projector corners), the default clock, scoring, penalties, how far Undo reaches |
| **Rounds** | How many rounds, what each one is, and what happens to the field when it ends |
| **Questions** | The questions themselves, per round, or a spreadsheet to bring in |
| **Teams** | How many groups, their names, their colours, and any starting handicap |
| **Look** | Palette, every colour, fonts, text sizes, spacing, corners, shadow |
| **Motion** | Whether the show animates, how fast, and each individual timing |
| **Words** | Every button label and on-screen string — rename them into your language |

Two board formats, chosen per round:

- **Survey board** — one question, its answers hidden in slots, highest value first. Family Feud.
- **Point grid** — categories across, point rows down. Quiz Bowl.

Your questions for the format a round is *not* using are kept, so switching back and forth
costs nothing.

### How the show progresses

A show can be several rounds, and each round decides what happens to the field when it
ends:

| When this round ends | What happens |
| --- | --- |
| Everyone continues | Nobody is out; scores carry (or reset — that is on the Show tab) |
| The lowest score is out | One team eliminated. A tie stops and asks you which one |
| Only the top N continue | Everyone below the Nth score is out. **A tie on the line advances both**, so the field can stay larger than N rather than the software picking a loser for you |

Four ready-made shapes rewrite every round in one click:

- **Everyone plays** — no eliminations, highest total wins.
- **Knockout ladder** — one team out after every round but the last.
- **Survival bracket** — the field halves each round: 16 → 8 → 4 → 2.
- **Heats and a final** — the format above: four heats, each with its own groups, each
  sending one winner to the final. It rebuilds the rounds and re-deals the questions.
- **Grand final** — everyone plays the whole show; only the top two reach the last round.

**Redraw the groups at random** reshuffles who is in which heat, keeping every heat the same
size. Each round also has a **Groups in this round** picker for setting it by hand. Leave it
empty and everyone still in plays; name four groups and only they play, only they can score, and only they can be
knocked out at the end of it. That is what makes a heat a heat. The final names nobody on
purpose — by the time it runs, the only groups left in the show are the four winners.

Underneath them the Studio prints the field walking down the programme —
`Round 1: 16 play → 8 continue` — so you can see the shape before anybody is in the room.

**It is survival, not a draw sheet.** The engine never pairs two teams against each other;
who advances is decided by score. If you need "Class A vs Class B, winner plays Class C",
this software does not run it, and no setting here will.

A round can also be **skipped unless N teams are still in**, which is how you keep a
semifinal from running when only two groups are left.

The right-hand column is what the projector will look like, and underneath it, whether the
show will run. Red has to be fixed before **Start the show →** turns on. Amber still plays
— a half-filled column, say — but is worth a look.

**Start the show →** hands what you built to the host controls, projector button in the
usual place. To come back and change something later: **Customise…** in the host window.

**Export** writes the whole show to a `.json` file: a backup, or the way to move it to
another laptop. **Import…** — or dropping the file anywhere on the page — loads it back.
The same button takes a questions spreadsheet, which is the next section.

What the Studio still does not do: per-round themes, and anything that needs a second
scoring engine. A show with those is a preset in `presets/`, the route the next two
sections describe.

## Changing the questions

Questions live in a spreadsheet, one row per **answer**, grouped by the question above it.

```csv
question,answer,points
Sebutkan tempat wisata Indonesia yang terkenal!,BALI,30
Sebutkan tempat wisata Indonesia yang terkenal!,RAJA AMPAT,25
Sebutkan alasan siswa datang terlambat ke sekolah!,BANGUN KESIANGAN,30
```

Three columns are required: `question`, `answer`, `points`. Repeat the question on every
one of its answers — that is how rows group.

**Highest-scoring answer first.** Row order is the order the slots run down the board, so
the first answer for a question becomes slot 1.

A question can have four answers or five; they do not all have to match. Point totals do
not have to add to 100 either — the current set mixes 100, 75 and 50.

To use an edited file, drop it on the Studio — it lands in the round you are looking at,
and **Deal all questions across the rounds** shares them out again (3 / 3 / 3 / 3 / 4 for
sixteen). You can also drag it onto the host window, or press **Load questions…** there,
but that route replaces the whole board with a single round. The
show reloads with your questions and keeps its groups, colours and rules — only the board
changes. Questions can only be swapped **before** you press Start round; once a show is
running the picker refuses, because changing the board would invalidate the answers
already played and everything Undo knows about them.

The file that ships is `packets/family-feud.csv` in the repository. Download it, edit it
in Excel or Google Sheets, export as CSV, drop it on the page.

To check a file before the day without starting a show:

```
npm run check-packet packets/family-feud.csv
```

It reports missing answers by spreadsheet row number, so `row 14` means row 14 in your
sheet.

## Groups, names and the look

> For a show you built in the Studio, all of this is in the **Teams** and **Look** tabs and
> takes effect immediately. The rest of this section is about the shipped Feud preset.

These live in `presets/family-feud.ts` and need a rebuild, so change them before the day
rather than during it.

| What | Where | Note |
| --- | --- | --- |
| Group names | The `GROUPS` list | Currently `Group 1`…`Group 16`; put the real class names in |
| How many groups | Same list | Add or remove entries; both screens resize themselves |
| Group colours | The `COLORS` list | One per group, in the same order |
| Corner text | The round's `title` and `subtitle` | Shown exactly as typed — `GLUE` on the left, `Family Feud` on the right |
| Clock per question | `rules.timer.questionSec` | 60 seconds now |
| Animation speed | `motion.speed` | Below 1 is slower; `motion.enabled: false` turns movement off |

After editing, run `npm run build` and the change is in. If you are running from the
published link rather than your own laptop, the change has to be pushed to GitHub first,
which rebuilds the site automatically.

Group names are shrunk to fit rather than cut off, so a long class name is safe. The
scoreboard wraps at eight per row, so sixteen groups make two rows.

One thing worth doing before the day: the current questions name four teachers in
question 8, and question 2 has `MASALAH KENDARAN` where it probably means `KENDARAAN`.
Both are in the CSV.

## Host on a phone, projector on the laptop

The setup above puts both windows on one machine. If you would rather hold the controls
on your phone while the laptop drives the projector, run it as a server instead. Both
devices need to be on the same wifi; no internet is required.

```
npm install
npm run build
npm run show presets/family-feud.ts
```

It prints two addresses:

```
Stage: http://192.168.1.10:8080/stage.html
Host:  http://192.168.1.10:8080/host.html?token=...
```

Put **Stage** on the projector and open **Host** on your phone. The host link carries the
session token, so keep it off the screen — anyone who reads it off the projector can award
themselves points.

Three differences from the one-laptop setup. Questions come from the `packets/` folder on
disk, so **Load questions…** is not there — edit the CSV and restart instead. The server is
the one machine that must stay awake: if the laptop sleeps, both screens stop. And —
importantly — **this route runs `presets/family-feud.ts`, which is still the flat
single-round show**: all sixteen groups, all sixteen questions, no heats. The heats-and-a-final
format lives in the Studio, which is the one-laptop route. Use the laptop setup on the day
unless someone ports the heats into a preset first.

## The other show formats

Family Feud is one of two board types. The other is a Jeopardy-style grid: categories
across the top, point tiles down, one right answer each. The **Show** links at the top of
the host window switch between them.

| Show | Board | Groups |
| --- | --- | --- |
| Family Feud | Survey board, answers in hidden slots | 16 |
| Quiz Bowl | 4 × 3 grid, two rounds | 4 classes |
| Demo | 3 × 3 grid, two rounds | 3 |

On a grid round the flow is different: tap a tile, press **Arm Buzzers** to start the
clock, then **Correct** or **Wrong** for the group that answered. With six groups or fewer
each gets its own button; above that you pick the group first, the same as Feud.

Six sets of grid questions ship in `packets/`: general knowledge, science, world, history,
film and TV, and a longer five-by-four school assembly set. A whole show can be built from
them without writing any questions — `presets/quiz-night.ts` is three rounds that do
exactly that.

A packet of survey questions always builds a Feud board and a packet of single-answer
questions always builds a grid, so dropping a file on the page gets the right format
automatically.

## If something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Projector says "Waiting for the show to start" | It has not heard from the host window yet | Give it a second; if it stays, reload it while the host window is open |
| Answer buttons all grey | No group is selected | Tap a group chip — you may have deselected them by tapping twice |
| Projector window closed by accident | — | Press **Open projector window** again; it comes back at the current question with scores intact |
| Wrong group got the points | — | **Undo last action**, then award it again |
| Questions look like the old ones after editing | The browser cached the page | Reload with Ctrl+Shift+R |
| Nothing happens when you press things | The host window was closed or reloaded | The host window owns the show; reloading it starts over |

**The host window is the show.** Closing or reloading it loses the scores — the projector
window is only a display and can be closed and reopened freely. If you must reload the
host, do it before you start, not during.

Worth doing once before the day: run it end to end on the actual laptop and the actual
projector. Most of what bites at a live event is the room, not the software — the
projector's aspect ratio, a screen that sleeps, or a laptop that will not do two displays.

## What it does not do

- **Buzzers and player devices.** There is no phone-buzz-in mode; the host decides who
  answered first.
- **Turn rotation.** The engine has no idea whose turn it is, which is why the host picks
  the group by hand.
- **A finale.** A finished show shows a plain scoreboard and the words "Show Complete" —
  no podium, no dramatic reveal, no stats.
- **Sound.** No music, no buzzers, no sound effects. If the show needs music on the night,
  play it from something else.
- **Effects.** No confetti, no screen shake.
- **Paired brackets.** Elimination is by score, never by head-to-head pairings. There is
  no "winner of match 1 plays winner of match 2".

What does work: the question opening, the answers flipping, strikes landing, and the
scores counting up with the bars moving under them. Those read their timings from the
config, so `motion.speed` genuinely slows the show down and `motion.enabled: false`
genuinely stops it.


## About this project

- Built for **OSIS SMAKC** — the student council's yearly school celebration.
- Sixteen groups in four heats of four, drawn at random, each heat sending one winner to
  a final; sixteen questions dealt across the five rounds, none asked twice.
- Written as an **open-source alternative to [TriviaMaker](https://triviamaker.com)**,
  which is a paid, account-bound, internet-dependent hosted product.
- **Richard Amadeus** — creator and author. Free to copy, fork and run.

## Running it yourself

```bash
npm install
npm run build
npx http-server dist
```

Open `admin/index.html` to build a show, or `local/index.html?show=studio&token=local` to
run the one you built. To host from a phone instead, see *Host on a phone* above.

## Layout

```
src/config/     schema, defaults, the merge cascade, redaction
src/engine/     phase machine, intents, event log and undo, broadcast
src/registry/   plugin interfaces and registration
src/styles/     board formats (grid, list)
src/scoring/    scoring engines (flat)
src/transport/  local HTTP server, SSE down, POST up
src/stage/      projector view
src/host/       host controller
src/local/      one-laptop mode: engine in the host window, packet picker
src/admin/      Studio: build a show in the browser (draft → config), panels/ per tab
src/ui/         the stylesheet the control surfaces share
src/guide/      the guide, published as a page of the site
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

- Tests are plain scripts using `node:assert` — no test framework.
- `check-stage-host-isolation.mjs` fails if anything under `src/stage/` imports host code.
- The config schema describes only what the engine implements. If a setting is in
  `src/config/types.ts`, something reads it.

## License

MIT
