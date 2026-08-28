---
name: plan:gameshow-engine-t2.2-eliminated-team-score-display
description: "backlog — product decision: should carryScores:false zero the score of a team eliminated in the same round-boundary batch, or should the finale podium keep it?"
date: 27-08-26
feature: general
---

# BACKLOG NOTE — Eliminated-Team Score Display at the Finale

**Deferred from:** T2.2 EXECUTE + EVL (`gameshow-engine-t2.2_27-08-26`), captured at UPDATE
PROCESS 2026-08-28.

**Why deferred:** this is a product/host-experience question, not an engineering defect. The
code does exactly what the plan specifies (T2.2-L4); nobody has decided which behaviour a real
show host actually wants for the finale podium.

## The situation

`advanceToNextRound`'s round-boundary batch, when `program.carryScores: false`, resets EVERY
team's score to 0 in the same batch — including a team simultaneously eliminated by that same
batch's `Round.eliminateLowest` action. The score-reset loop iterates `state.teams` unfiltered;
it does not exclude the team being eliminated in this pass.

**Confirmed empirically by EVL:** a fresh fixture with a nonzero-scoring team (score 10) that is
also the lowest scorer under `eliminateLowest` ends the batch at `score: 0, eliminated: true`.
The finale podium (or any mid-show scoreboard after this point) then shows that team at 0, not
the score they actually earned before being cut.

This only bites shows that use `Round.eliminateLowest` together with `program.carryScores:
false` on the round the team is eliminated in — `demo-t1.ts` uses neither, so the shipped demo
never exercises this path.

## The two options (neutral framing — this is the USER's call)

1. **Keep the score, mark them eliminated.** Exclude the team being eliminated THIS batch from
   the score-reset loop, so their pre-elimination score survives for the podium/scoreboard even
   after `carryScores: false` resets everyone else. Communicates "here's what they earned before
   they were cut."
2. **Zero it, as today.** Current behaviour. Communicates "eliminated teams are out of the
   running entirely" — score no longer matters once eliminated, consistent with `carryScores:
   false`'s broader intent of "scores don't carry across this boundary."

Neither is more "correct" engineering-wise — both are one small, well-understood code change
(add an `eliminated`/`this batch's chosen.id` exclusion check to the score-reset loop, or leave
it as is). The only reason this is a backlog item and not a silent pick is that nobody has asked
a host which one they'd want to see on stage.

## Recommendation

Do not decide this speculatively. Resolve it when either (a) a real show is being configured
that uses `eliminateLowest` + `carryScores: false` together, or (b) the user is asked directly
during a future phase's INNOVATE/PLAN pass.

## Source

Full detail: `process/general-plans/active/gameshow-engine-t2.2_27-08-26/gameshow-engine-t2.2_REPORT_27-08-26.md`
("Observation (implemented verbatim, flagged for product review)"),
`gameshow-engine-t2.2-evl-iteration-001_REPORT_27-08-26.md` (§STEP 5, Unresolved Question 1).
