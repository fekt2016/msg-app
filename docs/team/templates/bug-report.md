# Bug Report Template

Used by any agent that discovers a defect outside its own fix authority (e.g. `testing` finds a bug in code it doesn't own), and as the intake format for `bug-hunter`.

```markdown
## Bug: <short description>

**Found by**: <agent name>
**Owning domain**: <which implementer agent should fix this — backend/mobile/database/etc.>
**Severity**: blocking | high | low

**Reproduction**:

1. <step>
2. <step>

**Expected**: <what should happen>
**Actual**: <what happens instead>

**Evidence**: <failing test name, stack trace, log line — whatever's concrete>

**Suspected root cause** (if known): <don't guess past what the evidence supports>

**Regression test**: <does one exist yet? per CLAUDE.md §10, the regression test is
written before the fix — this field should be filled in by bug-hunter before the
fix is considered done>
```
