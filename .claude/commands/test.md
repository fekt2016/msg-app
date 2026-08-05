---
description: Write/run tests for the current change via the testing agent, enforcing the coverage floor and this codebase's mocking convention.
argument-hint: [optional — specific file or feature to focus tests on]
---

## Purpose

Ensure a change is verified by tests that would actually fail without it — not padding for a coverage number.

## Responsible Agent(s)

`testing` (primary); hands off to `bug-hunter` if a real bug is found rather than a coverage gap.

## Inputs

$ARGUMENTS — optional focus area; defaults to the current diff.

## Workflow

1. Invoke `testing` against the current diff (or specified area). Infer which workspace(s) are affected from the changed file paths — only run `pnpm --filter backend test` / `pnpm --filter frontend test` for what actually changed, not both by default.
2. It writes unit tests for services/repositories, API tests for routes, component tests for screens/hooks — covering error paths, not just happy path.
3. It applies the documented mocking convention exactly (`CLAUDE.md` §10 / `eaz-testing` skill): global mocks cast at point of use, local mocks defined inline inside the `jest.mock()` factory — never as an outer `const mock* = jest.fn()` referenced from the factory.
4. Confirm the coverage floor is met (lines/functions/statements 70%, branches 60%).
5. If a test reveals a real bug rather than a coverage gap, do not weaken the test — file it via `docs/team/templates/bug-report.md` and hand off to `bug-hunter`.

## Validation Checklist

- [ ] Error paths covered, not just happy path
- [ ] Mocking convention followed exactly — no outer-const-in-factory pattern
- [ ] Coverage floor met without meaningless assertions
- [ ] No real network calls to external services in tests

## Best Practices

If you find the outer-const-mock-in-factory pattern in a file this command didn't target, fix it too rather than let another instance ship — this is a known, documented bug class in this codebase.

## Expected Deliverables

Passing tests for the change, coverage floor met, `pnpm test` clean.
