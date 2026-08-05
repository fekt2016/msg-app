---
description: Update documentation (CLAUDE.md, Swagger, TASKS.md, eaz-* skills) via the documentation agent, verified against actual current code.
argument-hint: [what changed and needs documenting]
---

## Purpose

Keep documentation true to the actual codebase — this project has already shipped stale docs once (a skill describing a Next.js frontend that never existed), so verification against real code is the actual point of this command, not a formality.

## Responsible Agent(s)

`documentation` (primary), coordinating with `project-manager` for any `.opencode/TASKS.md` status/checkbox change.

## Inputs

$ARGUMENTS — what changed and needs documenting.

## Workflow

1. Invoke `documentation`.
2. It verifies every claim against the actual current code (reads the file, runs the command) before writing — never transcribes from a prior doc or from memory of the change.
3. Scope: `CLAUDE.md`, Swagger annotations, `.claude/skills/**`, `README.md`. For `TASKS.md` status, coordinate with `project-manager` — `documentation` writes what's true, `project-manager` decides what counts as "done."
4. For a larger documentation pass (not a single small edit), optionally cross-check claims about what connects to what against `graphify query`/`graphify explain` — this repo has `graphify` installed specifically for this kind of check.
5. If verification surfaces a doc-vs-code mismatch unrelated to the current request, report it separately rather than silently expanding scope to fix it.

## Validation Checklist

- [ ] Every factual claim verified against current code, not assumed
- [ ] No duplication introduced — info lives in one authoritative place
- [ ] Swagger matches the actual validation schema, not just the controller signature
- [ ] Any status/design-only/speculative banner (e.g. on Phase 3+ skills) still accurate

## Best Practices

Merge and synthesize rather than copy verbatim — this project's docs were deliberately de-duplicated once already.

## Expected Deliverables

Updated, verified documentation reflecting the actual current state of the code.
