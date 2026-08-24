---
name: context:all-planning
description: "plan artifacts, task folders, and phase programs — the planning group entrypoint/router"
keywords: plan, planning, phase program, task folder, umbrella plan, validate contract, PRD, roadmap
related: []
date: 24-08-26
---
# Planning Context

Last updated: 2026-08-24

This file is the canonical planning context entrypoint for TriviaMaker Engine.

Use it after `process/context/all-context.md` when the task needs to create, find, resume,
or archive a plan artifact.

---

## Scope

**Covers:** where plan artifacts live, the task-folder convention, phase-program structure,
validate-contracts, and how work is archived.

**Does NOT cover:** the RIPER-5 protocol itself (see
`process/development-protocols/all-development-protocols.md`), or what to build
(see the active plan and `ARCHITECTURE.md`).

## Read When

- Creating any new plan
- Resuming interrupted work (always check `active/` before creating anything new)
- Archiving completed work
- Deciding between a general plan and a feature folder

## Where Plans Live

| Location | Use for |
|---|---|
| `process/general-plans/active/{slug}_{dd-mm-yy}/` | current work — the default |
| `process/general-plans/completed/{slug}_{dd-mm-yy}/` | finished, archived |
| `process/general-plans/backlog/` | deferred, blocked, or noted-for-later |
| `process/features/{feature}/active/{slug}_{dd-mm-yy}/` | when a feature accumulates 5+ artifacts |

**Task-folder convention.** A plan is a *folder*, not a loose file. The folder holds the
plan (`{slug}_PLAN_{dd-mm-yy}.md`) plus every colocated artifact: reports, references,
iteration logs, `results.tsv`. Do not create sibling `reports/` or `references/` dirs —
those are deprecated.

## Rules

1. **Always check `active/` before creating a new plan.** Resuming beats recreating.
2. One plan file per task folder. If work splits, create a phase program with an umbrella plan.
3. Every non-trivial plan gets a validate-contract before EXECUTE.
4. A plan without a validate-contract must state why VALIDATE was skipped.
5. Archive to `completed/` during UPDATE PROCESS, never mid-execution.

## Phase Programs

Use a phase program (umbrella plan + per-phase plans) when the work has 3+ dependent
phases, needs gates between milestones, or must survive context compaction.

The umbrella plan carries the Program Goal Charter (north star, definition of done, what
"verified" means, scope tiers → phase mapping, out-of-scope, hard safety constraints) and a
`## Current Execution State` section the orchestrator reads to decide what to spawn next.

Template: `.claude/skills/vc-generate-phase-program/references/program-goal-charter-template.md`

## Source Paths

- `process/general-plans/` — plan storage (see `_GUIDE.md` in each subfolder)
- `process/features/` — feature-scoped storage
- `process/development-protocols/plan-lifecycle.md` — canonical naming and lifecycle rules
- `process/development-protocols/phase-programs.md` — the multi-phase program protocol

## Update Triggers

Refresh this file when plan storage locations change, the task-folder convention changes,
or a new feature folder is created.
