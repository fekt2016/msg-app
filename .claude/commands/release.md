---
description: Run the release-manager agent's go/no-go gate — CI, Definition of Done, and every prerequisite sign-off.
argument-hint: [optional — what's being released, if not obvious from context]
---

## Purpose

Synthesize every prior sign-off into one honest, verified go/no-go call — the last checkpoint before shipping.

## Responsible Agent(s)

`release-manager` (primary, review-only except changelog/version).

## Inputs

$ARGUMENTS — optional description of what's being released.

## Workflow

1. Invoke `release-manager` with `docs/team/checklists/release.md`.
2. It verifies directly — runs the commands, doesn't trust a claim — rather than reading `docs/team/checklists/release.md` as a formality.
3. On go: updates the changelog/version (its only permitted edit) and states a rollback path.
4. On no-go: presents the specific blocking list, each routed to its owning agent.

## Validation Checklist

See `docs/team/checklists/release.md` in full.

## Best Practices

This decision has veto power per `docs/team/README.md` — it cannot be routed around even with every other sign-off present, except by explicit user override. If asked to approve around a missing sign-off, say so plainly rather than complying or refusing silently.

## Expected Deliverables

A go/no-go decision. On go: changelog/version updated, rollback path stated. On no-go: an actionable blocking list.
