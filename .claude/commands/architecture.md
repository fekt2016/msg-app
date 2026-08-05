---
description: Get a binding architecture decision from the architect agent — for standalone design questions not tied to a specific feature being planned.
argument-hint: [the design question]
---

## Purpose

Answer a cross-cutting design question directly, without routing it through `/plan`'s feature-scoping step first — for when the question itself is the whole task ("should X be sharded by Y", "does this need a new module boundary").

## Responsible Agent(s)

`architect` (primary).

## Inputs

$ARGUMENTS — the design question. If it's actually attached to a specific feature request rather than a standalone question, prefer `/plan` instead — that route gets `project-manager`'s scoping context too, which `architect` benefits from.

## Workflow

1. Invoke `architect` with the question and any code/docs context needed to answer it.
2. If the question resolves a conflict between two other agents' recommendations, use `docs/team/templates/adr.md` and save the result to `docs/architecture-decisions/`.
3. If the decision would contradict a **Decided** item in `.opencode/PROJECT_SPEC.md` §15/§20, stop — that requires explicit user override, not an architectural judgment call.
4. Hand off the decision to whichever agent(s) need to implement it.

## Validation Checklist

- [ ] Decision is stated as an actionable rule, not a discussion
- [ ] Claims about existing code verified against the actual repo, not assumed from docs
- [ ] ADR filed if this resolved a conflict or an Open Decision
- [ ] Downstream agents named explicitly

## Best Practices

Prefer the smallest boundary change that resolves the actual tension — see `architect`'s own Best Practices for why.

## Expected Deliverables

A decision, stated as a rule; an ADR if it resolved a conflict or Open Decision; a handoff to the implementing agent(s).
