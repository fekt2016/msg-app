---
description: Scope and plan a feature/fix — routes through project-manager (and architect if it's cross-cutting) before any code is written.
argument-hint: [feature or task description]
---

## Purpose

Turn a request into a scoped, owned plan before any implementation starts — this project's own rules require scope and owner to be explicit, not implied.

## Responsible Agent(s)

`project-manager` (always) → `architect` (conditionally, if scoping surfaces a cross-cutting question).

## Inputs

$ARGUMENTS — a feature or task description, as raw as the user gives it. This command's job is to turn that into a scoped plan, not to require it pre-scoped.

## Workflow

1. Invoke `project-manager` with the request. It must: check `.opencode/TASKS.md`/`.opencode/ROADMAP.md` for current status and phase fit, decide scope (what's in/out), and decide which agents own which piece and in what order, per `docs/team/README.md`'s workflow.
2. If scoping surfaces a cross-cutting design question (new schema, new module boundary, an Open Decision from `.opencode/PROJECT_SPEC.md` §20), invoke `architect` next with that specific question.
3. Synthesize both into a plan: scope, owning agent(s) in order, any N/A sign-offs, any open architecture questions still needing a user decision.
4. `EnterPlanMode` and present the plan for confirmation. Do not begin implementing from this command — that's `/implement`'s job.

## Validation Checklist

- [ ] `TASKS.md`/`ROADMAP.md` actually checked, not assumed
- [ ] Scope is written down, not left implicit
- [ ] Owning agent(s) named in execution order
- [ ] Any N/A sign-off recorded with a reason

## Best Practices

Scope narrower rather than bundle unrelated work — a plan covering two unrelated changes just means `/implement` has to re-split it later.

## Expected Deliverables

A plan surfaced via `EnterPlanMode`: scope, ordered owning agents, N/A sign-offs, open questions — ready for `/implement` once approved.
