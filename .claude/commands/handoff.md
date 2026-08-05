---
description: Produce a formatted handoff note for the next agent/session, per docs/team/templates/handoff-note.md — for manual command chaining outside /ship's automatic sequencing.
argument-hint: [what was just done, and what's next]
---

## Purpose

Formalize context passed between agents when a user is manually chaining commands (rather than using `/ship`, which does this automatically) — so the next step doesn't have to re-derive what was already decided.

## Responsible Agent(s)

None (main-loop) — this is a formatting/summarization step, not a domain judgment call.

## Inputs

$ARGUMENTS — a description of what was just done and, if known, which agent/command is next.

## Workflow

1. Fill out `docs/team/templates/handoff-note.md`'s shape from the actual work just completed: decision/output, rationale, open items, what must not be re-litigated, and the escalation condition if there is one.
2. If the receiving agent/command is known, address the note to it directly and pass it as that command's next input.
3. If not known yet, present the note as a standalone artifact the user can paste into whichever command they run next.

## Validation Checklist

- [ ] Note is short — a briefing, not a transcript
- [ ] "Do not re-litigate" list actually names anything already decided that could otherwise be second-guessed
- [ ] Escalation condition stated if one applies

## Best Practices

Don't pad this with implementation detail the receiving agent can just read from the code — a handoff note is for decisions and rationale that aren't otherwise visible in the diff.

## Expected Deliverables

A short, structured handoff note ready to feed the next agent or command.
