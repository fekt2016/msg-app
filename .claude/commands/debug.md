---
description: Investigate whether something is actually a bug and how deep it goes — diagnosis only, no fix committed. Use /fix once you're ready to commit to a regression test and fix.
argument-hint: [the observed behavior or question]
---

## Purpose

Understand a piece of unclear or suspicious behavior before committing to fixing anything — genuinely distinct from `/fix`, which bundles diagnosis with an immediate regression-test-and-fix commitment.

## Responsible Agent(s)

`bug-hunter`, explicitly instructed to stop at diagnosis.

## Inputs

$ARGUMENTS — the observed behavior, error, or question. Doesn't need a confirmed reproduction yet — that's part of what this command is for establishing.

## Workflow

1. Invoke `bug-hunter` with the observation, explicitly scoped to **diagnosis only** — root-cause the behavior, but do not write a fix or a regression test in this mode.
2. It should report: is this actually a defect (vs. intended behavior — check against `CLAUDE.md`/the relevant skill first), root cause if it is one, and severity/blast-radius.
3. Present the diagnosis. If the user wants it fixed, hand off to `/fix` with the diagnosis already established (skips re-diagnosing).

## Validation Checklist

- [ ] Verified against `CLAUDE.md`/relevant skill whether this is actually a defect vs. intended behavior
- [ ] Root cause stated with evidence, not speculation
- [ ] No fix or regression test written in this mode — diagnosis only

## Best Practices

If the investigation naturally produces a clear fix, it's fine to say so in the report — just don't apply it. The distinction that matters is _committing_ to a fix (which starts the regression-test-first discipline `/fix` enforces), not withholding an obvious answer.

## Expected Deliverables

A diagnosis: is it a bug, what's the root cause, how severe — ready to hand to `/fix` if the user decides to proceed.
