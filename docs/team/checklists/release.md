# Release Checklist

Walked by the `release-manager` agent before any go decision.

- [ ] CI green on the target branch: lint, typecheck, test (coverage thresholds met), build
- [ ] `docker compose config` validates
- [ ] Every item in the Definition of Done (`docs/team/standards.md`) checked or explicitly N/A with sign-off
- [ ] `security` agent sign-off present for anything touching auth/E2EE/payments/uploads
- [ ] `.opencode/TASKS.md` updated to reflect what actually shipped
- [ ] No open blocking findings from `code-reviewer`
- [ ] Changelog/version bump reflects the actual scope of the release (not padded, not missing anything)
- [ ] Rollback path is known before shipping, not improvised after

**Veto**: `release-manager` can block even with every upstream sign-off present, if CI is red or the DoD is incomplete. This is the one agent whose "no" cannot be routed around.
