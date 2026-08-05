# Cross-Agent Operating Standards

This file covers only what's specific to _how the agent team operates_. Engineering standards themselves (coding style, API conventions, DB conventions, security requirements, testing strategy) live in `CLAUDE.md` and the `eaz-*` skills — every agent is instructed to read those, not have them re-stated here. Duplicating them here would just create a second copy that drifts.

## Definition of Done (reused by every agent)

Identical to `CLAUDE.md` §7 — repeated here only because every agent's Quality Checklist references it directly:

- [ ] Backend · Mobile · Database (or N/A) · API · Socket (or N/A) · Validation · Error handling
- [ ] Testing (coverage floor met) · Documentation updated · Security reviewed · Code reviewed
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` clean for every workspace touched
- [ ] Merged

An N/A on Database/Socket requires the same sign-off rigor as a ✅ — it's `project-manager`'s or `architect`'s call to record, never a silent default by the implementing agent.

## Handoff Protocol

Use `docs/team/templates/handoff-note.md` whenever one agent's work is the direct input to another's (e.g. `database` → `backend`, `architect` → everyone downstream of a decision). A handoff note is short — decision, rationale, open items, explicit "do not re-litigate" list. It is not a full transcript of the producing agent's reasoning.

## Escalation Ladder

1. Implementer agent hits a question inside its own domain → resolves it itself, citing `CLAUDE.md`/the relevant skill.
2. Implementer agent hits a cross-cutting design question → escalate to `architect`.
3. Implementer agent hits a scope/priority question → escalate to `project-manager`.
4. Any agent hits a security question → escalate to `security`; treat its answer as binding, not advisory.
5. Two agents produce conflicting recommendations → escalate to `architect`, record the resolution as an ADR (`docs/team/templates/adr.md`).

Never guess past step 1. Guessing on a cross-cutting decision is exactly the failure mode `architect`/Opus exists to prevent.

## Commit & PR Conventions

Branch prefixes `feature/`, `fix/`, `chore/` (per `CLAUDE.md` §16). One feature per branch/PR. PR descriptions use `docs/team/templates/pr-description.md`. CI (lint, typecheck, test) is a required, non-overridable status check — no agent merges around a red CI run, including `release-manager`.

## Review-Only Agents Cannot Self-Approve

`security`, `performance`, `code-reviewer`, `release-manager` produce findings, not fixes — they have no `Write`/`Edit` tool access, so this is enforced by the harness, not just convention. A finding always routes back to the owning implementer or to `bug-hunter`.

## When an Agent Is Unsure Which One It Is

If a task doesn't cleanly map to one agent's scope (e.g. "the search results are slow and also wrong"), start with `project-manager` — its job is exactly this triage, and it routes to the right specialist(s) rather than one agent overreaching into another's domain.
