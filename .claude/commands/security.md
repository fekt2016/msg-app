---
description: Run the security agent's audit against the current diff — binding findings per docs/team/README.md.
argument-hint: [optional — specific area to focus on]
---

## Purpose

Audit a change for the specific security failure modes this project has already named as rules — auth bypass, E2EE boundary violations, injection, secret leakage, rate-limit gaps.

## Responsible Agent(s)

`security` (primary), plus `e2ee` if the diff touches `backend/src/modules/e2ee/**` or `frontend/src/e2ee/**` for a domain-specific pass alongside the general audit.

## Inputs

$ARGUMENTS — optional focus area; defaults to the current diff/module.

## Workflow

1. Get the actual diff or module in question.
2. Invoke `security` with it and `docs/team/checklists/security.md`.
3. If E2EE paths are touched, also invoke `e2ee`.
4. Present findings with severity (blocking/high/low), each routed to its owning implementer agent — this command does not apply fixes.

## Validation Checklist

See `docs/team/checklists/security.md` in full.

## Best Practices

Findings here are binding — see `docs/team/README.md` § Agent Communication for the full rule. This is the one review domain where "I'll fix it in a follow-up" is not a valid resolution.

## Expected Deliverables

A severity-ranked findings report, each finding routed to the agent that owns the fix.
