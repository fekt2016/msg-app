---
description: Structural cleanup via the refactoring agent — behavior-preserving only.
argument-hint:
  [what to refactor and why — a specific duplication/layering/cohesion problem, not "clean this up"]
---

## Purpose

Fix a specific, evidenced structural problem (duplication, layering violation, low cohesion) with zero behavior change.

## Responsible Agent(s)

`refactoring` (primary).

## Inputs

$ARGUMENTS — must resolve to a specific, evidenced problem, not a vague "clean this up." If the user doesn't already have one, get one first: run `/review` for a duplication/layering finding, or `graphify god-nodes`/a community-cohesion check (`graphify-out/GRAPH_REPORT.md`) for a structural signal — don't proceed on a hunch.

## Workflow

1. Confirm the target is a specific, evidenced finding (see Inputs). If not, produce one via `/review` or graphify before proceeding.
2. Invoke `refactoring` with the finding.
3. Confirm the existing test suite passes unmodified (assertions unchanged; only test _structure_, like import paths, may move) both before and after.
4. If the refactor turns out to require an API/schema/contract change to do properly, stop — that's a feature change, not a refactor. Escalate to `api`/`database`/`architect` instead of proceeding.
5. Run `/review` on the result.

## Validation Checklist

- [ ] Evidenced finding existed before starting (not a vague ask)
- [ ] Test suite passes unmodified before and after
- [ ] No behavior change — verified by running tests, not by reading the diff
- [ ] No contract/schema change snuck in under "refactor"

## Best Practices

Small, reviewable refactor commits — a refactor that's hard to review defeats its own purpose.

## Expected Deliverables

A behavior-preserving diff, with the originating finding resolved and the test suite green.
