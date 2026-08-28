---
name: plan:gameshow-engine-dom-test-harness
description: "backlog — cross-phase decision: adopt a DOM/browser test harness (jsdom or Playwright) so host/stage render branches stop being Agent-Probe/Manual-only"
date: 27-08-26
feature: general
---

# BACKLOG NOTE — DOM/Browser Test Harness Adoption

**Deferred from:** T2.2 EXECUTE + EVL (`gameshow-engine-t2.2_27-08-26`), captured at UPDATE
PROCESS 2026-08-28. Cross-phase tooling decision, not scoped to any single phase.

**Why deferred:** T2.2 confirmed this is a genuine, repo-wide tooling ABSENCE, not a testing
oversight in T2.2 (or T1) specifically. Building a harness is a real infrastructure decision
(new devDependency, new test-writing pattern) that deserves an explicit choice, not an
incidental addition inside an engine-capability phase.

## The situation

`package.json` `devDependencies` contains only `@types/node` and `vite`. No jsdom, happy-dom,
Playwright, Puppeteer, or Testing Library exists anywhere in this repo. No test file imports
`src/host/main.ts` or `src/stage/main.ts`.

This means every host/stage render branch — button labels, conditional controls, phase-gated
banners — is provably UNTESTABLE by the existing `tsx` + `node:assert/strict` pattern, which has
no DOM. As of T2.2, this includes:

- Host: "Next Round" vs "End Show" button selection, per-team "Eliminate & continue" tie
  buttons, the `roundIntro`/`intermission` "Continue" control, the `final`-phase "Show complete"
  banner.
- Stage: the `final`-phase "Show Complete" title card.

All of these are currently verified only by (a) live HTTP command-layer drives (which prove the
SERVER'S response to a command is correct, not that the CLIENT renders the right control) and
(b) a human's read-through of the straight-line conditional code. The plan's own Phase
Completion Rules require a human browser click-through before claiming VERIFIED — this backlog
item does not change that requirement, it is about whether a FUTURE automated gate could
eventually replace or reduce it.

## Why this matters more starting now

T2.3 adds five more style plugins (`list`, `trivia`, `wheel`, `tictac`, `hangman`), each with its
own host/stage render branches. Every phase that ships UI without a harness adds to the same
Agent-Probe/Manual backlog with no way to shrink it later except a one-time infrastructure
investment. The cost of adopting a harness does not grow much whether it happens now or in three
phases; the cost of NOT having one grows every phase.

## The decision to make

Adopt a DOM/browser test harness, or don't — and if yes, which one:

1. **jsdom (or happy-dom)** — lightweight, runs in the existing `tsx` + `node:assert` process,
   no browser needed, good for asserting DOM structure/text content/button presence. Weaker for
   real click/interaction fidelity and CSS-dependent behaviour.
2. **Playwright** — real browser, strongest fidelity (matches the plan's own Agent-Probe/Manual
   click-through description almost exactly), but a heavier dependency and a genuinely new test
   style for this codebase (`tests/all-tests.md`'s "No E2E" gap already names Playwright as "the
   plan" for when more UI exists).
3. **Stay Manual/Agent-Probe-only** — explicit decision to keep host/stage UI verification
   human-only, accepting the growing backlog of unclosed manual gates as a deliberate tradeoff
   against the zero-new-runtime-dependency preference this project has held through T1/T2.1/T2.2.

## Recommendation

Raise this explicitly before or during T2.3 PLAN, since T2.3 is the first phase that will
noticeably compound the gap (five new style plugins' worth of render branches). Do not let it
default silently to "stay manual" by nobody choosing.

## Source

Full detail: `process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_REPORT_27-08-26.md`
("Test Infra Gaps Found"), `gameshow-engine-t2.2-evl-iteration-001_REPORT_27-08-26.md`
(§STEP 5, Unresolved Question 2), `process/context/tests/all-tests.md` (§Known Gaps).
