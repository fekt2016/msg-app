---
name: eaz-testing
description: Testing strategy for Eaz Community — unit/integration/API/component test organization, mocking strategy (including the jest.mock hoisting pitfall), and coverage targets. Use when writing or reviewing any test.
---

# Testing

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
4. **Coverage is a floor, not a goal**: enforced in CI at lines/functions/statements 70%, branches 60% (`backend/vitest.config.ts`, `frontend/jest.config.js`).
5. **CI is the gate**: lint, typecheck, and tests must pass before merge.

## Required Patterns

### Test Organization (as implemented)

Backend (Vitest) and frontend (Jest/`jest-expo`) tests are co-located next to the module they cover, suffixed `.test.ts`/`.test.tsx` — not in a parallel `__tests__` tree, except frontend's top-level `frontend/__tests__/App.test.tsx` and `frontend/src/db/__tests__/database.test.ts`.

### Unit Testing

- Services: mock repositories, assert business rules, error paths, and state transitions.
- Repositories: test against a real/in-memory MongoDB for query/index correctness; don't mock Mongoose.
- Pure utilities: direct, exhaustive edge cases (pagination, envelope, validation schemas, phone normalization).

### Integration Testing

- Spin up the app with real DB + Redis (or substitutes); exercise service → repository → DB.
- Use an in-memory Mongo for isolation; seed fixtures per test.

### API Testing

- `supertest` against the mounted Express app.
- Assert on: status code, response envelope shape, `meta` pagination, `error.code`/`details`, and validation failures.
- Cover auth middleware (`401/403`), ownership checks, and rate limiting behavior.
- Every public endpoint documented in OpenAPI must have at least one happy-path and one error-path test.

### Component Testing (frontend)

- React Testing Library (`@testing-library/react-native`): render, user interaction, assert accessible roles/behavior — not implementation internals.
- Test forms: validation errors, submit pending state, success/failure toasts.
- Test screens: pagination, empty/error/loading states.

### Mocking Strategy — the load-bearing rule for this codebase

Modules mocked across many test files are mocked **once**, globally, in `frontend/jest.setup.ts` (`expo-secure-store`, `expo-application`, `expo-constants`, `expo-contacts`, `react-native-safe-area-context`). Individual test files then cast the import to `jest.Mock`/`jest.Mocked<typeof x>` and interact with it — see `frontend/src/auth/tokenStorage.test.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
const mockStore = SecureStore as unknown as { getItemAsync: jest.Mock /* ... */ };
```

When a test genuinely needs a **local** mock not shared globally (e.g. mocking `../api/client` for one test file), define the `jest.fn()`s **inline inside the `jest.mock()` factory** — see `frontend/src/api/users.test.ts`:

```ts
jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
const mockClient = apiClient as jest.Mocked<typeof apiClient>;
```

**Do not** declare `const mockFoo = jest.fn()` _outside_ the factory and reference it _inside_ the factory, even though it looks like a valid pattern (Jest's "prefix with `mock`" hoisting exception makes it compile). In practice, when the module-under-test's own `require()` of the mocked module runs — which happens before the outer `const mockFoo = jest.fn()` line executes, due to import hoisting — the factory captures `undefined` instead of the real mock function, and the mocked methods are `undefined` at runtime. This is a live, confirmed bug in `frontend/src/e2ee/{groupCrypto,groupE2eeApi,groupKeyStore}.test.ts` — fix by switching to the inline-factory pattern above, not by adding more mock variables.

Never hit real Cloudinary/Paystack/Africa's Talking/SMTP in tests — mock the HTTP boundary and assert on the request the service makes.

### Regression Testing

- When fixing a bug, add the regression test first, then the fix.
- Snapshot only stable, small outputs (envelope shape); avoid brittle snapshots of generated markup.

### Performance Testing

- Load-test realtime (Socket.IO) and high-traffic endpoints; a light pass runs after Phase 1 and Phase 4 (`.opencode/ROADMAP.md`).
- Test pagination/cursor stability under concurrency.
- Profile slow queries; assert query plans use indexes.

### Security Testing

- Test auth flows: token expiry, refresh rotation/reuse, brute-force rate limiting, OTP single-use.
- Test input sanitization and webhook signature verification (see `eaz-paystack`).

## Best Practices

- Run the fast suite (unit + API) on every push; run integration/slow in CI on PR and before release.
- Keep tests independent and order-independent; parallel-safe.
- Coverage thresholds live in the test runner config (`vitest.config.ts` / `jest.config.js`) and fail CI below them — don't write tests just to nudge a number up.

## Anti-Patterns to Avoid

- Testing implementation details (calling private functions, asserting internal mocks).
- Snapshotting entire rendered trees.
- Real network calls to external services in tests.
- Skipping error-path tests.
- Tests that pass by asserting on mocks they themselves defined without exercising real behavior.

## Common Mistakes

- Not covering the money/stock invariants (double fulfillment, overselling) once Marketplace exists.
- Unit tests that share a database and fail depending on run order.
- Forgetting to test the `N/A`/skip decision paths (e.g., CRUD without sockets).
- The outer-`const`-mock hoisting bug described above.

## Implementation Checklist

1. Read `CLAUDE.md` §10 and the coverage targets before writing tests.
2. For each feature, write unit tests for services/repositories, then API tests for the routes, then component tests on the client.
3. Add the regression test for any bug before fixing it.
4. A feature is not complete until its tests pass and coverage meets the floor — update `.opencode/TASKS.md`.
