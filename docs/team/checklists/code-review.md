# Code Review Checklist

Walked by the `code-reviewer` agent. This is the terse checkbox form of the `eaz-code-review` skill — read that skill for the full rationale per item.

- [ ] Diff is scoped to one feature — no unrelated refactors or formatting noise
- [ ] Naming matches `CLAUDE.md` §4 conventions
- [ ] No duplicated logic — reuses existing services/repositories/components
- [ ] No dead code, unused imports, or leftover debug logs
- [ ] Controller → Service → Repository layering respected (backend) / feature-folder structure respected (mobile)
- [ ] Error paths tested, not just the happy path
- [ ] `TASKS.md` updated
- [ ] Public API documented in Swagger; socket events follow `namespace:action`
- [ ] `security` and `performance` sign-off present where their domains apply

Blocking items must be fixed and re-reviewed. Non-blocking notes are suggestions the owning agent can take or leave — don't let bikeshedding hold a merge.
