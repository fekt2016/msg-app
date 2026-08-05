---
model: anthropic/claude-sonnet-4-6
---

# Skill: Testing

## Purpose

Standardize how backend and frontend code is tested so coverage is meaningful, CI is reliable, and regressions are caught before merge.

## Scope

- Unit, integration, API, component, regression, performance, security testing
- Test organization and naming
- Mocking strategy
- Coverage targets and CI enforcement

## Architecture Principles

1. **Test the contract, not the implementation**: tests exercise behavior through public APIs/services and assert on the response envelope, not on internal calls.
2. **Layered, in proportion**: unit-test services/repositories fast; integration-test across real layers; API tests exercise HTTP end-to-end.
3. **Deterministic and isolated**: no shared mutable state, no reliance on network/external services, clean database per test.
4. **Coverage is a floor, not a goal**: enforce the agreed threshold (e.g., 70% on services/repositories, higher on auth/payment paths) in CI — see `ENGINEERING_RULES.md` §9.
5. **CI is the gate**: lint, typecheck, and tests must pass before merge (`ENGINEERING_RULES.md` §12).

## Required Patterns

### Test Organization

```text
backend/src/modules/auth/
├── __tests__/
│   ├── auth.service.unit.test.ts
│   ├── auth.repository.unit.test.ts
│   ├── auth.api.test.ts          # supertest against mounted app
│   └── fixtures.ts

web/src/features/products/
├── __tests__/
│   ├── useProducts.test.tsx       # hook tests
│   ├── ProductForm.test.tsx       # component tests
│   └── mocks.ts
```

- Co-locate tests next to the module; name with `.unit.test.ts` / `.integration.test.ts` / `.api.test.ts` suffix.
- One fixture/mock file per module to avoid duplication.

### Unit Testing

- Services: mock repositories, assert business rules, error paths, and state transitions (e.g., order state machine in `ecommerce-order-management.md`).
- Repositories: test against a real in-memory MongoDB (mongodb-memory-server) for query/index correctness; don't mock Mongoose.
- Pure utilities: direct, exhaustive edge cases (pagination, envelope, validation schemas).

### Integration Testing

- Spin up the app with real DB + Redis (or substitutes); exercise service → repository → DB.
- Test transactional flows end-to-end at the service layer: reserve → confirm → ship (see `ecommerce-inventory.md`).
- Use `mongodb-memory-server` for isolation; seed fixtures per test.

### API Testing

- `supertest` against the mounted Express app.
- Assert on: status code, response envelope shape, `meta` pagination, `error.code`/`details`, and validation failures.
- Cover auth middleware (`401/403`), ownership checks, and rate limiting behavior.
- Every public endpoint documented in OpenAPI must have at least one happy-path and one error-path test.

### Component Testing (frontend)

- React Testing Library: render, user interaction, assert accessible roles/behavior — not implementation internals.
- Wrap components in QueryClientProvider + router; mock feature hooks or the api-client.
- Test forms: validation errors, submit pending state, success/failure toasts.
- Test tables/filters: pagination, sorting, empty/error/loading states.

### Regression & Mocking Strategy

- Mock at the boundary, not deep inside: mock the `api-client` or repository interface, never Mongoose internals.
- Never hit real Cloudinary/Paystack/SMTP in tests — mock the HTTP calls and assert on the request the service makes.
- Snapshot only stable, small outputs (envelope shape); avoid brittle snapshots of generated markup.
- When fixing a bug, add the regression test first, then the fix.

### Performance Testing

- Load-test realtime (Socket.IO) and high-traffic endpoints with k6/artillery; run a light pass after Phase 1 and Phase 4 (see `ROADMAP.md`).
- Test pagination/cursor stability under concurrency.
- Profile slow queries; assert query plans use indexes.

### Security Testing

- Run dependency audits (`npm audit`/Snyk) in CI with a severity policy (`ENGINEERING_RULES.md` §6).
- Test auth flows: token expiry, refresh rotation/reuse, brute-force rate limiting, OTP single-use.
- Test input sanitization and webhook signature verification (see `ecommerce-paystack.md`).
- Review with the Security Engineer before marking security-sensitive features complete.

## Best Practices

- Run the fast suite (unit + api) on every push; run integration/slow in CI on PR and before release.
- Use Vitest (backend) and Jest/Vitest (frontend) consistently per workspace.
- Keep tests independent and order-independent; parallel-safe.
- Add coverage thresholds to the test runner config and fail CI below them.
- Log test coverage and flaky-test artifacts for review.

## Anti-Patterns to Avoid

- Testing implementation details (calling private functions, asserting internal mocks).
- Snapshotting entire rendered trees.
- Real network calls to external services in tests.
- One giant test file that needs the whole app seeded.
- Skipping error-path tests.
- Tests that pass by asserting on mocks they themselves defined.

## Common Mistakes

- Not covering the money/stock invariants (double fulfillment, overselling).
- Unit tests that share a database and fail depending on run order.
- Forgetting to test the `N/A`/skip decision paths (e.g., CRUD without sockets).
- Coverage that ignores the auth/payment hot paths.

## AI Implementation Instructions

1. Read `ENGINEERING_RULES.md` §9 (Testing Rules) and the coverage targets before writing tests.
2. For each feature, write unit tests for services/repositories, then API tests for the routes, then component tests on the client.
3. Add the regression test for any bug before fixing it.
4. Wire the suite into CI as a required check (`ecommerce-code-review.md` checklist).
5. Update `TASKS.md`; a feature is not complete until its tests pass and coverage meets the floor.
