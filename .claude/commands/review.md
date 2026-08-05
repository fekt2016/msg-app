---
description: Run the code-reviewer agent's holistic review pass on the current diff/branch.
argument-hint: [optional — specific files or area to focus on]
---

## Purpose

Final holistic quality pass on a diff — naming, reuse, layering, and whether prerequisite domain reviews actually happened, not just whether they're mentioned.

## Responsible Agent(s)

`code-reviewer` (primary), conditionally preceded by `security` and/or `performance` if their domains are touched and no sign-off exists yet.

## Inputs

$ARGUMENTS — optional focus area. Defaults to the full current diff: prefer the diff against the branch's base if one exists, falling back to `git diff`/`git diff --staged` against the working tree otherwise. State which target was used so results are reproducible run to run.

## Workflow

1. Get the actual diff.
2. Check whether the diff touches `security`'s domain (auth/E2EE/payments/uploads) or `performance`'s domain (hot paths/list endpoints/money-stock writes) and no sign-off exists yet — if so, run those agents first. `code-reviewer` checks that their sign-off exists and was resolved; it doesn't redo their analysis.
3. Invoke `code-reviewer` with the diff and `docs/team/checklists/code-review.md`.
4. Present findings split into blocking vs. non-blocking. Blocking findings route to the owning implementer agent — this command does not fix anything itself.

## Validation Checklist

See `docs/team/checklists/code-review.md` in full.

## Best Practices

A review output maps directly onto `docs/team/templates/pr-description.md`'s Definition of Done section — structure findings so they can drop straight in.

## Expected Deliverables

A checklist-shaped review report: blocking items (with owning agent named) separated from non-blocking suggestions.
