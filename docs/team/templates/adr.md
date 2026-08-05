# Architecture Decision Record Template

Used by `architect` when resolving a cross-cutting decision or an inter-agent conflict (see `docs/team/README.md` § Conflict Resolution). Save completed ADRs to `docs/architecture-decisions/NNNN-short-title.md`, numbered sequentially.

```markdown
# ADR NNNN: <short title>

**Status**: Proposed | Accepted | Superseded by ADR NNNN
**Date**: <YYYY-MM-DD>
**Deciding agent**: architect
**Affected agents**: <who needs to know this happened>

## Context

<What decision was needed and why. If this resolves a conflict between two agents,
name them and state each position plainly.>

## Decision

<The actual decision, stated as a rule someone can follow without re-reading the
context — this is what future agents will grep for.>

## Consequences

<What this makes easier, what it makes harder, what it forecloses. If it updates
an Open Decision in PROJECT_SPEC.md §20, note that it needs to be reflected there
too — file that as a documentation task.>

## Alternatives considered

<Briefly — enough to stop the same alternative from being re-proposed without new
information.>
```
