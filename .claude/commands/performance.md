---
description: Run the performance agent's audit against the current diff or a specified hot path.
argument-hint: [optional — specific endpoint, query, or area to focus on]
---

## Purpose

Audit a change or hot path for the specific performance failure modes this project names as rules — missing indexes, unbounded reads, read-modify-write on money/stock, unpaginated lists.

## Responsible Agent(s)

`performance` (primary), looping in `database` if a finding turns out to be a schema-shape problem rather than a query problem.

## Inputs

$ARGUMENTS — a specific endpoint/query/area to audit. If empty and no current diff exists, ask the user what to scope to rather than silently scanning the whole repo — a full-repo audit is expensive and usually not what's wanted from a quick command invocation.

## Workflow

1. Establish scope: the given argument, or the current diff if none given.
2. Invoke `performance` with it and `docs/team/checklists/performance.md`.
3. Require evidence per finding — an actual index list, `explain()` output, or a concrete scale estimate. A finding without evidence goes back for measurement rather than blocking anything (unlike `/security`'s findings, which are unconditionally binding).
4. Route findings to the owning implementer agent (`backend`/`database`/`realtime` as applicable).

## Validation Checklist

See `docs/team/checklists/performance.md` in full.

## Best Practices

Distinguish "slow now" from "will be slow at scale" explicitly in the finding — both are worth raising, but conflating them either over-blocks a small collection or under-flags a real future incident.

## Expected Deliverables

An evidence-backed findings report, routed to owning agents; or, if nothing was scoped, a request for the user to specify what to audit.
