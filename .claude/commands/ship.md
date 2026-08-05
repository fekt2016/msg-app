---
description: Run the full pipeline end-to-end for a feature — plan through release, per docs/team/README.md's workflow.
argument-hint: [feature or task description]
---

## Purpose

Execute `docs/team/README.md`'s full collaboration workflow as one command — this file owns the _executable_ form of that workflow; the README owns the _why_. If they ever disagree, the README is authoritative and this file should be updated to match.

## Responsible Agent(s)

Potentially all 21, per the workflow below — most steps conditional on what the change actually touches.

## Inputs

$ARGUMENTS — a feature or task description.

## Workflow

1. `project-manager` scopes it (equivalent to `/plan`'s first step): check `TASKS.md`/`ROADMAP.md`, decide in/out, assign owners, record N/A sign-offs.
2. `architect` — only if scoping surfaced a cross-cutting design question; otherwise explicitly N/A, not silently omitted.
3. Design step, only for what's actually impacted: `database` (schema), `api` (contract), `realtime` (socket events), `authentication`/`e2ee` (auth/crypto surface).
4. `backend` and `mobile` implement in parallel where independent, per the agreed design.
5. `testing` — unit/integration/API/component tests, coverage floor.
6. In parallel: `security` (if auth/E2EE/payments/uploads touched), `performance` (if a hot path/list endpoint/money-stock write touched), `ui-ux` (if a mobile screen changed).
7. `bug-hunter` — only if step 5 or 6 surfaced a real defect; loops back to the owning implementer, then re-enters at step 5.
8. `code-reviewer` — final holistic pass; confirms step 6's sign-offs are present and resolved.
9. `documentation` — updates `CLAUDE.md`/Swagger/`TASKS.md`/skills as needed.
10. `release-manager` — final go/no-go gate per `docs/team/checklists/release.md`.

## Validation Checklist

- [ ] Every step above is either done or explicitly recorded N/A — never silently omitted
- [ ] Stopped and surfaced to the user if a step produced a finding only the user can resolve (e.g. an Open Decision from `PROJECT_SPEC.md` §20)

## Best Practices

Don't skip a step silently to save time — a silently-skipped step is indistinguishable from a forgotten one when this is reviewed later.

## Expected Deliverables

A fully implemented, tested, reviewed, documented change with a release-manager go/no-go decision at the end.
