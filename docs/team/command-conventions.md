# Command Library Conventions

Read this once; individual commands in `.claude/commands/` don't repeat it. This is the shared mechanics + structure template for every slash command in this repo.

## Mechanics (how a command actually runs)

A command file's body is a prompt injected into the orchestrating session. It does not run code directly — it instructs the orchestrator (you, talking to the main Claude) to invoke one or more subagents via the `Agent` tool, using `subagent_type` set to the agent's `name` field from `.claude/agents/<name>.md`. `$ARGUMENTS` in a command file is replaced with whatever text followed the slash command. Sequencing, parallelism, and handoffs between agents are the command's job to specify — Claude Code does not infer an execution order on its own.

## Standard Command Structure

Every command in this library follows this shape. Not every section needs to be long — a one-line "Inputs" section is fine if the input really is that simple — but every section should be present so the library reads as one system, not eleven one-offs.

```markdown
---
description: <one line, shown in command palette>
argument-hint: <what $ARGUMENTS should contain>
---

## Purpose

<one or two sentences: what this command is for>

## Responsible Agent(s)

<which .claude/agents/*.md subagents this invokes, and in what role>

## Inputs

<what $ARGUMENTS / repo state this command expects>

## Workflow

<numbered steps — the actual orchestration logic>

## Validation Checklist

<what must be true before this command's job is considered done — point to
docs/team/checklists/*.md where one already covers this domain, rather than
restating it>

## Best Practices

<short, command-specific guidance — not a restatement of the invoked agent's
own Best Practices section>

## Expected Deliverables

<what the user should have when this command finishes>
```

## Shared Rules (apply to every command, not restated per-file)

- **Findings from `security` are binding**; findings from `performance` need evidence before they block anything. See `docs/team/README.md` § Agent Communication for the full rule — commands remind the user of this only where it changes how the command behaves, not as boilerplate.
- **Review-only agents don't fix.** A finding from `security`/`performance`/`code-reviewer`/`release-manager` always routes to the owning implementer or `bug-hunter` — no command applies a fix on a review-only agent's behalf.
- **CI and the Definition of Done are non-negotiable gates** (`docs/team/standards.md`) — no command should present a way around them, including `/release`.
- **Escalation ladder** (`docs/team/standards.md`): a command that hits a cross-cutting design question routes to `architect`; a scope question routes to `project-manager`. Individual commands only restate this where the routing is non-obvious.

## When to Add a New Command

Add one when a real, recurring workflow exists that isn't already a natural step inside `/plan`, `/implement`, or `/ship` — not for every agent 1:1 (a thin wrapper that only says "invoke agent X" adds a maintenance surface without adding orchestration value; use the `Agent` tool directly for that, or extend `/implement`'s routing table instead). See `docs/team/README.md`'s roster before proposing a new one — check whether an existing agent or command already covers the need.
