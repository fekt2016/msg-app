---
model: anthropic/claude-sonnet-4-6
---

# Skill: Code Review

## Purpose

Standardize the review checklist applied to every PR so quality, security, and consistency are enforced mechanically rather than by luck.

## Scope

- Pull request checklist
- Naming, folder organization, reusability
- Performance, security, validation, error handling review
- Documentation review

## Architecture Principles

1. **Review before merge, always**: no PR merges without an approved review (`ENGINEERING_RULES.md` §12). CI (lint, typecheck, tests) must be green first.
2. **Review against the skills, not taste**: each checklist item maps to a concrete pattern from the skills in this folder.
3. **Small reviews only**: one feature per PR, focused diff, readable scope.
4. **The checklist is the gate**: if any checkbox fails, the PR is not mergeable — fix or explicitly sign off.

## Required Patterns

### Pull Request Checklist

- Title/description state the feature and link `TASKS.md` items and related docs.
- Diff is scoped to one feature; no unrelated refactors or formatting noise.
- CI passes: lint, typecheck, tests, coverage floor.
- Tests cover happy path + error paths for the changed behavior.
- Documentation updated (README/spec/rules/skills where behavior changed).
- Reviewed by the owning agent per `AGENTS.md` scope.

### Naming & Folder Organization

- Controllers/services/repositories/routes named after the module and placed in `modules/<feature>/` (see `ecommerce-backend-architecture.md`).
- Feature folders on the client, not file-type folders (see `ecommerce-nextjs-architecture.md`).
- Naming is consistent: nouns for resources, `camelCase` variables, `PascalCase` components/types, `UPPER_SNAKE` env/constants.
- No dead code, no unused imports/variables, no leftover debug logs.

### Validation Review

- Every mutation endpoint has a Zod schema (body/query/params) — see `ecommerce-api-patterns.md`.
- Unknown fields rejected; types cast at the edge; no unvalidated `req.body` usage.
- Pagination limits and filter whitelists enforced server-side.

### Error Handling Review

- All expected failures raise typed `AppError`s; controllers/route handlers don't `try/catch` silently (see `ecommerce-backend-architecture.md`).
- Central error handler is the only place that formats errors; no ad-hoc error responses.
- Error paths covered by tests: `401/403/404/409/422/429` as appropriate.
- No swallowed exceptions; async handlers wrapped.

### Performance Review

- Queries are indexed; list endpoints paginated and projected; no N+1.
- No read-modify-write on stock/money paths — atomic operations only (see `ecommerce-inventory.md`).
- Heavy work (notifications, media) queued, not awaited in the request path.
- Redis caching used on hot reads; invalidation correct on writes.

### Security Review

- Ownership checks on every resource mutation; RBAC via middleware (see `ecommerce-authentication.md`).
- No secrets in code, client components, or commits; env-only config.
- Webhook signatures verified; payment flows idempotent (see `ecommerce-paystack.md`).
- Input sanitized; no SQL/NoSQL injection or XSS reflection vectors.
- Rate limiting on public/auth/OTP/upload endpoints.
- Sensitive data (tokens, passwords, payment data) never logged.
- Review with the Security Engineer per `AGENTS.md`.

### Reusability Review

- No duplicated logic — the change reuses existing services/repositories/utilities (search first, per `AGENTS.md` Global Rule 3).
- Shared client primitives used instead of per-feature copies (DataTable, form field, query hooks).
- New abstractions only when a real second use exists — no speculative abstraction.
- Cross-feature constants/schemas live in shared locations, not inline copies.

### Documentation Review

- Public API documented in OpenAPI/Swagger (`ENGINEERING_RULES.md` §3).
- Socket events documented with naming convention (`ENGINEERING_RULES.md` §5).
- `TASKS.md` updated: items checked or added.
- Any decision affecting the spec/rules is reflected there; major decisions noted (per `AGENTS.md` Behaviour Rules).

## Best Practices

- Review the diff in small logical commits; comment on intent and edge cases, not style nits.
- Use blocking comments for checklist failures; non-blocking notes for suggestions.
- Verify the feature's tests actually fail without the change (meaningful tests).
- Re-run the checklist on the final state of the branch, not only the first commit.
- Keep the checklist as a living doc — update it when a new skill or rule is added.

## Anti-Patterns to Avoid

- Approving "after fixing in a follow-up PR" for blocking items.
- Reviewing only the diff hunks without reading surrounding context.
- Letting formatting/noise bloat obscure the real change.
- Skipping the security checklist for auth/payment PRs.
- Merging with failing CI or unresolved comments.

## Common Mistakes

- Forgetting that new endpoints need tests and OpenAPI docs.
- Approving ownership checks that only filter in the controller (not enforced in the service).
- Missing idempotency on retried webhook/transition paths.
- Accepting unindexed filters that will blow up at scale.

## AI Implementation Instructions

1. On any PR, run the checklist top to bottom; do not proceed past a failure.
2. Verify CI results and coverage first; only then review the diff.
3. Check each skill's patterns against the code (backend architecture, API patterns, auth, inventory, paystack, image upload, frontend, testing).
4. Run the security pass explicitly for auth/payment/upload changes.
5. Leave blocking comments per failure and confirm the final branch state before approving.
