---
name: report:gameshow-engine-t2-evl-001
description: "EVL confirmation run — T2.1 contract revision. All 4 fully-automated gates re-run green; adversarial verification of styleState JSON-safety, undo atomicity, D3 style-author obligation, D5 numbers, and two residual risks."
date: 27-08-26
status: COMPLETE
feature: general
plan: process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2_PLAN_24-08-26.md
phase: T2.1-EVL
metadata:
  node_type: memory
  type: report
  feature: general
  phase: T2.1-EVL
---

# EVL CONFIRMATION RUN — T2.1 Contract Revision

**Scope:** independent re-verification of `dca6b48` against baseline `8d0f118`. VALIDATE was
skipped for this phase; this is the only independent check the change gets. Execute-agent's
own green result is treated as a hypothesis, not evidence — everything below was re-run or
independently exercised.

## TL;DR

All 4 gates re-run green from clean. Every hard constraint holds. Execute-agent's claims
verified TRUE on all three adversarial checks (JSON-safety trap, undo atomicity, D3
style-author obligation) and both residual risks (unbounded `advanceRound`, by-reference
`styleState` corruption). D5 numbers independently recomputed and match execute-agent's
correction (19 members, 7→8 reachable, fallbacks 6→7, unreachable 12→11 — plan's 11→10 was
wrong). One new finding beyond what execute-agent reported: `styleState` is not actually on
`BroadcastPayload` at all yet, so the JSON-safety property is currently unobservable on the
wire — it only exists at the `SessionState` level. No weakened or deleted assertions found.
**EVL PASSES. No fix cycle needed.**

## STEP 1 — Gates from clean (real output)

```
rm -rf dist && npm run typecheck && npm test && node scripts/check-stage-host-isolation.mjs && npm run build
```

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0, no output |
| `npm test` | PASS, exit 0, `12 test file(s) passed in 0.1s` (all 12 named files individually reported PASS) |
| `node scripts/check-stage-host-isolation.mjs` | PASS, exit 0, `1 stage file(s) checked, no host imports` |
| `npm run build` | PASS, exit 0, `built in 38ms`, 5 artifacts |

Chained exit code: 0. Matches execute-agent's claim.

## STEP 2 — Hard constraints

| Check | Result |
|---|---|
| (a) `git diff 8d0f118 HEAD -- src/config/types.ts` | EMPTY — confirmed (0 lines) |
| (b) `src/registry/index.ts` diff | Contains EXACTLY the 3 agreed changes: `SessionState.styleState` added (with doc comment), `Intent` gains `setStyleState`+`advanceRound`, `StylePlugin.buildBoard` gains `state` param. `isRoundComplete` untouched. No deviation. |
| (c) `package.json`/`package-lock.json` diff | EMPTY — confirmed, no new dependencies |
| (d) `grep "as GridStyle" src/engine/broadcast.ts` | exit 1, no match — confirmed removed |
| (e) test-file diff audit | See below — no deletion, no weakening |

**(e) detail** — diffed all 7 touched test files against `8d0f118` line by line:

| File | Change type |
|---|---|
| `broadcast.test.ts` | 1 fixture line changed (added `meta`), 1 state literal gained `styleState: {}`, +55 lines pure addition (new block) |
| `host-manual-round.test.ts` | 1 line: 2-arg → 3-arg call site (required by signature change) |
| `intents.test.ts` | 1 state literal gained `styleState: {}`, `EXPECTED` array gained 2 entries (both sides sorted before compare — not weakened), +41 lines pure addition |
| `log.test.ts` | 1 state literal gained `styleState: {}`, +52 lines pure addition |
| `session.test.ts` | +1 line, pure addition (`styleState` assertion) |
| `scoring/flat.test.ts` | 1 state literal gained `styleState: {}` |
| `grid.test.ts` | 2 call sites gained a 3rd arg (`makeState()`) |

Every pre-existing assertion in every file stands verbatim. Zero deletions of assertion
lines. The only non-additive edits are the mechanical literal/call-site updates the type
change forces (adding `styleState: {}` to hand-built `SessionState` objects, adding the
required 3rd `buildBoard` argument) — none of these relax what is being checked.

## STEP 3 — Adversarial verification (independently exercised, not re-reading the tests)

Wrote a standalone script (`__evl_verify_tmp.mjs`, deleted after use — repo tree is clean,
confirmed via `git status --short`) that imports the real `broadcastState`, `createSession`,
`applyIntentsWithLog`, `undo` from source and drives them directly, rather than trusting the
phase's own added test assertions.

### (i) JSON-safety of `styleState`

| Check | Result |
|---|---|
| Is `styleState` present on the actual `host`/`stage`/`player` wire payload? | **NO** — `Object.prototype.hasOwnProperty(payload, 'styleState')` is `false` on all 3 channels |
| Nested arrays/objects round-trip on `SessionState.styleState` itself | Byte-identical, confirmed via `JSON.parse(JSON.stringify(...))` deep-equal |
| `Set` in `styleState` | `{"picked":{}}` — collapses to `{}`, confirmed |
| `Map` in `styleState` | `{"scores":{}}` — collapses to `{}`, confirmed |

**Finding beyond the execute-agent's report:** `BroadcastPayload` (in `broadcast.ts`) does
NOT carry `styleState` as a field at all in this tier — confirmed by reading `broadcast.ts`
and empirically confirmed above. This means the Set/Map JSON-safety trap the interface doc
comment warns about is currently **dormant** — it cannot fire yet because nothing ships
`styleState` over the wire. The property is proven only at the `SessionState` object level
(which is what the phase's `broadcast.test.ts` block actually tests, and says so honestly in
its own comment). This is not a defect — it is accurately scoped in the report's Residual
Risk #5 ("`BroadcastPayload` still does not carry `styleState`") — but the literal EVL
instruction ("confirm the values survive the round trip" on "the actual stage/host/player
payloads") cannot be satisfied as written because the field isn't there yet. **Flag for T2.2/
T2.3: the moment a style's `onSelect`/`onResolved` starts writing answer-derived text into
`styleState` AND a later phase adds `styleState` to `BroadcastPayload`, the Set/Map trap and
the R3 redaction risk both go live — re-run this exact check at that point.**

### (ii) Undo atomicity for new intents

All 4 sub-checks independently exercised (not the phase's own test blocks — separate script,
separate fixtures):

| Check | Result |
|---|---|
| `setStyleState` batch reverses in exactly one `undo()` | PASS |
| `advanceRound` batch reverses BOTH `roundIndex` AND `styleState` together in one `undo()` | PASS — confirms the plan's item 18 gap (single-key only) was real and the execute-agent's added two-key test (log.test.ts block (g)) is not vacuous; my independent script reproduces the same result via a fresh fixture |
| A batch mixing `setStyleState` with another intent type (`selectQuestion`) reverses atomically | PASS — one event logged, one undo restores both fields together |
| Over-undo (undo with empty log, and undo-after-the-only-undo) | PASS — returns `{ undone: false }` cleanly, no throw |

### (iii) New style-author obligation (D3 — Concern #1)

Confirmed TRUE and reproduced independently: a style plugin that omits `meta.pointLadder`
from its `buildBoard` return value produces **blank audience labels** (`label: ""`) rather
than an error — verified by registering a deliberately non-compliant style and calling
`broadcastState` against it; output cell label was `""`.

Documentation check: `grep -in "pointLadder|buildBoard|board.meta" CUSTOMIZATION.md
ARCHITECTURE.md` returns **zero matches** — but this is because neither doc has a
StylePlugin-authoring section AT ALL yet (not a regression from this phase; the section
doesn't exist to update). This needs to land before T2.3's first new style plugin is
authored, whichever comes first: (a) a StylePlugin-authoring guide, or (b) this specific
`board.meta.pointLadder` obligation documented inline in that guide. Confirmed: yes, this
needs to reach `CUSTOMIZATION.md` before T2.3 style authors hit it — recommend adding it as
part of the first T2.3 plan's touchpoints, not deferred further.

## STEP 4 — D5 numbers, independently recomputed

Counted `GameEventName` members directly from `src/config/types.ts:778-786`: **19 total**
(session.created/started/ended, player.joined/left/kicked, round.started/ended,
question.selected/armed/revealed, buzz.received/locked, answer.correct/wrong/timeout,
score.changed, lifeline.used, phase.changed).

Counted unique values in `INTENT_EVENT_NAMES` (`src/engine/log.ts`) before/after by hand:

| | Before | After |
|---|---|---|
| Reachable (unique event names used) | 7 (`phase.changed, score.changed, question.revealed, question.selected, buzz.locked, question.armed, round.ended`) | 8 (+ `round.started`, newly reachable via `advanceRound`) |
| Unreachable | 12 | 11 |
| Fallback rows (comment-marked `// fallback`) | 6 | 7 (+ `setStyleState`) |

**Independently confirmed: execute-agent's correction is right, the plan's stated baseline
(11→10) is wrong.** True figures: unreachable 12→11, fallbacks 6→7. This is a Hybrid-tier
gate per the plan (`T2 SPEC AC#12`) requiring explicit human sign-off on whether
`setStyleState → phase.changed` is an acceptable 7th fallback — that judgment call is
correctly left open by the execute-agent and remains open here; it is not a code defect.

## STEP 5 — Residual risks, independently confirmed

### `advanceRound` unbounded

Confirmed real via direct reproduction: with a 1-round `program.rounds`, dispatching
`advanceRound` sets `roundIndex: 1` successfully (no bound check on write), and the very next
`broadcastState` call throws: `[session] no round at index 1; program.rounds has 1`. So the
failure is deferred from the intent to the next broadcast, exactly as reported.

Reachability: repo-wide `grep -rn "advanceRound"` across all `.ts`/`.tsx`/`.js` (excluding
`node_modules`, `dist`, and `*.test.ts`) finds it only in `registry/index.ts` (type decl +
doc comments), `engine/intents.ts` (touched-keys + apply case), `engine/log.ts` (event-name
mapping). **No dispatch call site exists anywhere in application code** — `dispatchHostAction`
is the sole call site of `applyIntentsWithLog` (Design Lock L16) and nothing in `session.ts`
or elsewhere constructs an `advanceRound` intent. Confirmed genuinely unreachable in T2.1.
**Must be bounded before T2.2 wires a real "next round" host action** — agree with the
execute-agent's flag.

### `setStyleState` reference-adoption corruption

Confirmed real and reproduced independently, including the specific corruption chain the
report describes: built a caller-owned object, dispatched `setStyleState` with it, then
mutated the caller's object AFTER dispatch. Result: **both** `state.styleState` and
`state.log[0].payload.intents[0].nextStyleState` reflected the post-dispatch mutation —
i.e. a retained-and-later-mutated caller object corrupts live state AND rewrites the
already-appended audit-log entry in place (since it's the same object reference, not a
snapshot). This is a real structural risk, correctly flagged by the execute-agent as "same
class as the existing `custom` intent's payload handling" — i.e. not a new pattern in this
codebase, but now a second instance of it. No test currently guards against this failure mode
happening in the field (the existing test only documents current-behavior-by-reference, it
doesn't test the corruption path) — recommend a defensive-clone follow-up ticket for T2.2/
T2.3, not a blocker for this phase.

## STEP 6 — Weak-test scan

Reviewed every new test block added this phase (broadcast.test.ts's styleState block,
intents.test.ts's setStyleState/advanceRound blocks, log.test.ts's blocks (f)/(g),
session.test.ts's one-line addition) for assertions that would still pass if the named
behavior were broken.

No vacuous assertions found: `grep` for `assert.ok(true`, `.skip`, `TODO`/`FIXME` markers
across all touched test files returns zero hits. All new assertions are value-based (deep-
equal against concrete expected shapes, or explicit reference-identity checks), not
type-only or existence-only checks. The `EXPECTED`/`INTENT_TOUCHED_KEYS` union-completeness
check in `intents.test.ts` sorts both sides before comparing, so it isn't order-fragile in a
way that would mask a missing entry.

One noted-but-not-a-defect gap (already self-reported by execute-agent, independently
confirmed true): no test asserts `withPointValueLabels`'s input contract, so a style that
forgets `board.meta.pointLadder` fails silently (blank labels) rather than loudly — reproduced
in Step 3(iii) above. Recommend a follow-up test/guard, not required to close this phase.

## Verdict

All 4 fully-automated gates independently re-run: **GREEN**. All hard constraints:
**CONFIRMED**. All three adversarial claims: **CONFIRMED TRUE**, with one additional
finding (styleState absent from BroadcastPayload — dormant risk, correctly scoped in the
execute-agent's own Residual Risk #5, but worth stating explicitly since the EVL brief asked
to test the wire payload directly and it currently doesn't carry the field). No weakened or
deleted test found. D5 numbers independently match the execute-agent's correction, not the
plan's original claim.

**EVL PASSES. No fix cycle required.** Two items remain open by design, not as defects: (1)
the Hybrid-tier `INTENT_EVENT_NAMES` human sign-off (plan's own AC#12 requirement, not
resolvable by any agent), (2) the `board.meta.pointLadder` style-author obligation needs to
land in `CUSTOMIZATION.md` before/at T2.3 — recommend UPDATE PROCESS capture this as a
carried-forward action item.

---

## EVL HANDOFF SUMMARY:
```yaml
gates_green: [typecheck, test, stage-host-isolation, build]
known_gaps: ["INTENT_EVENT_NAMES Hybrid-tier human sign-off still open (plan AC#12, not agent-resolvable)", "styleState not yet on BroadcastPayload — JSON-safety/redaction risk is dormant until a later phase wires it in; re-verify then", "board.meta.pointLadder style-author obligation undocumented in CUSTOMIZATION.md/ARCHITECTURE.md — no StylePlugin-authoring section exists yet", "advanceRound unbounded — must be bounded before T2.2 adds a live dispatch site", "setStyleState adopts caller object by reference — no defensive clone, corruption path reproduced but not yet guarded by a test"]
follow_up_stubs: none
context_partial: []
preliminary_packet_path: "process/general-plans/active/gameshow-engine-t2_24-08-26/gameshow-engine-t2-evl-iteration-001_REPORT_27-08-26.md"
closeout_classification: WITH_GAPS
```
