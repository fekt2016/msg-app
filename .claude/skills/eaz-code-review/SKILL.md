---
name: eaz-code-review
description: Eaz Community's PR review checklist — naming/reuse, validation, error handling, performance, security, documentation. Use when reviewing a PR or diff in this repo (distinct from Claude Code's built-in /code-review command).
---

# Code Review (Eaz Community checklist)

## Purpose

Standardize the review checklist applied to every PR so quality, security, and consistency are enforced mechanically rather than by luck. This is a project-specific checklist that complements (not replaces) Claude Code's built-in `/code-review` command — use `/code-review` to actually run an automated review pass, and this skill for the project-specific bar that pass should be held to.

## Scope

- Pull request checklist
- Naming, folder organization, reusability
- Performance, security, validation, error handling review
- Documentation review

## Architecture Principles

1. **Review before merge, always**: no PR merges without an approved review (`CLAUDE.md` §16). CI (lint, typecheck, tests) must be green first.
2. **Review against the skills, not taste**: each checklist item maps to a concrete pattern from the other `eaz-*` skills.
3. **Small reviews only**: one feature per PR, focused diff, readable scope.
4. **The checklist is the gate**: if any checkbox fails, the PR is not mergeable — fix or explicitly sign off.

## Required Patterns

### Pull Request Checklist

- Title/description state the feature and link `.opencode/TASKS.md` items and related docs.
- Diff is scoped to one feature; no unrelated refactors or formatting noise.
- CI passes: lint, typecheck, tests, coverage floor.
- Tests cover happy path + error paths for the changed behavior.
- Documentation updated (`CLAUDE.md`/spec/rules/skills where behavior changed).

### Naming & Folder Organization

- Controllers/services/repositories/routes named after the module and placed in `modules/<feature>/` (see `eaz-backend-architecture`).
- Naming is consistent: nouns for resources, `camelCase` variables, `PascalCase` components/types, `UPPER_SNAKE` env/constants — see `CLAUDE.md` §4.
- No dead code, no unused imports/variables, no leftover debug logs.

### Validation Review

- Every mutation endpoint has a Zod schema (body/query/params) — see `eaz-api-patterns`.
- Unknown fields rejected; types cast at the edge; no unvalidated `req.body` usage.
- Pagination limits and filter whitelists enforced server-side.

### Error Handling Review

- All expected failures raise typed `AppError`s; controllers/route handlers don't `try/catch` silently.
- Central error handler is the only place that formats errors; no ad-hoc error responses.
- Error paths covered by tests: `401/403/404/409/422/429` as appropriate.
- No swallowed exceptions; async handlers wrapped.

### Performance Review

- Queries are indexed; list endpoints paginated and projected; no N+1.
- No read-modify-write on stock/money paths — atomic operations only (see `eaz-inventory`).
- Heavy work (notifications, media) queued, not awaited in the request path.
- Redis caching used on hot reads; invalidation correct on writes.

### Security Review

- Ownership checks on every resource mutation; RBAC via middleware (see `eaz-authentication`).
- No secrets in code, client components, or commits; env-only config.
- Webhook signatures verified; payment flows idempotent (see `eaz-paystack`, once built).
- Input sanitized; no NoSQL injection or XSS reflection vectors.
- Rate limiting on public/auth/OTP/upload endpoints.
- Sensitive data (tokens, passwords, payment data) never logged.

### Reusability Review

- No duplicated logic — the change reuses existing services/repositories/utilities.
- Shared client primitives used instead of per-feature copies (`frontend/src/components/`, `frontend/src/hooks/`).
- New abstractions only when a real second use exists — no speculative abstraction.

### Documentation Review

- Public API documented in OpenAPI/Swagger.
- Socket events documented with the `namespace:action` naming convention.
- `.opencode/TASKS.md` updated: items checked or added.

## Best Practices

- Review the diff in small logical commits; comment on intent and edge cases, not style nits.
- Use blocking comments for checklist failures; non-blocking notes for suggestions.
- Verify the feature's tests actually fail without the change (meaningful tests).
- Re-run the checklist on the final state of the branch, not only the first commit.

## Anti-Patterns to Avoid

- Approving "after fixing in a follow-up PR" for blocking items.
- Reviewing only the diff hunks without reading surrounding context.
- Skipping the security checklist for auth/payment PRs.
- Merging with failing CI or unresolved comments.

## Common Mistakes

- Forgetting that new endpoints need tests and OpenAPI docs.
- Approving ownership checks that only filter in the controller (not enforced in the service).
- Missing idempotency on retried webhook/transition paths.
- Accepting unindexed filters that will blow up at scale.

## Implementation Checklist

1. Run `/code-review` for the automated pass, then walk this checklist top to bottom on what it surfaces (and what it might have missed) — do not proceed past a failure.
2. Verify CI results and coverage first; only then review the diff.
3. Check each relevant `eaz-*` skill's patterns against the code.
4. Run the security pass explicitly for auth/payment/upload changes.
