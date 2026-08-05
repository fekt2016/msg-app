# Handoff Note Template

Copy this into the prompt passed to the receiving agent. Keep it short — this is a briefing, not a transcript.

```markdown
## Handoff: <producing-agent> → <receiving-agent>

**Task**: <one-line description of the feature/fix this belongs to — link the TASKS.md item if one exists>

**Decision / output**: <what the producing agent actually decided or built — file paths, schema shape, contract, whatever's concrete>

**Rationale**: <why, in 1-3 sentences — enough for the next agent to not accidentally undo it>

**Open items** (things the receiving agent still needs to resolve):

- <item>

**Do not re-litigate**:

- <anything already decided that the receiving agent might otherwise second-guess — e.g. "soft-delete vs hard-delete for this collection is decided, see DATABASE_DESIGN.md §11">

**Escalate if**: <the specific condition under which the receiving agent should stop and escalate rather than proceed, per docs/team/standards.md's escalation ladder>
```
