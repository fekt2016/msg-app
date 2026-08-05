---
description: Diagnose and fix a bug via the bug-hunter agent — regression test written before the fix.
argument-hint: [bug description, reproduction steps, or a failing test name]
---

## Purpose

Root-cause and fix a confirmed defect — for investigation _without_ committing to a fix yet, use `/debug` instead.

## Responsible Agent(s)

`bug-hunter` (primary).

## Inputs

$ARGUMENTS — a bug description, reproduction steps, or a failing test name. Proceed once there's a failing command/test or a concretely observed behavior; a report that's purely "it feels broken" isn't enough to proceed on — establish a repro first.

## Workflow

1. If reproduction isn't already clear, establish it first.
2. Invoke `bug-hunter` with whatever reproduction/evidence exists, using `docs/team/templates/bug-report.md`'s shape.
3. It writes the regression test first, confirms it fails without a fix, then fixes the root cause — not just the first symptom.
4. If the bug is a known pattern with multiple instances (e.g. this codebase's documented `jest.mock` hoisting bug in the e2ee test files), it fixes every instance, not just the one reported.
5. If diagnosis reveals a design flaw rather than a coding mistake, stop and escalate to `architect` rather than patching around it.
6. Run `/review` on the fix.

## Validation Checklist

- [ ] Reproduction established before proceeding
- [ ] Regression test written first, confirmed failing, then passing after the fix
- [ ] Root cause addressed, not just the reported symptom
- [ ] Checked for the same pattern elsewhere in the codebase

## Best Practices

A fix that weakens a test or a validation check to make a symptom disappear isn't a fix — if that's what's needed, the bug isn't understood yet.

## Expected Deliverables

A regression test, a root-cause fix, and a plain-language explanation of what was actually wrong.
