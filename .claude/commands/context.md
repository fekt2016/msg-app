---
description: Get oriented on an area of the codebase before touching it — uses graphify plus CLAUDE.md/skills, not just a file read.
argument-hint: [a file, module, symbol, or area you're about to work on]
---

## Purpose

Answer "what do I need to know before touching this" using this repo's actual navigation tooling — `graphify` is installed and already run here specifically for this — rather than a cold grep-and-read pass.

## Responsible Agent(s)

None (main-loop tool use) — `graphify` is a CLI, not an agent, and this command is meant to be fast/cheap. Hand off to `architect` only if the investigation surfaces a genuine design question.

## Inputs

$ARGUMENTS — a file, module, symbol, or area.

## Workflow

1. Check `graphify-out/` is reasonably current — if it looks stale relative to recent changes, run `graphify update .` first (no LLM cost).
2. Use `graphify explain "<node>"` for a plain-language neighbor summary, `graphify path "A" "B"` if the question is about how two things connect, or `graphify affected "X"` if the question is "what breaks if I change this."
3. Cross-reference with `CLAUDE.md` and the relevant `eaz-*` skill for the documented pattern this area is supposed to follow.
4. Summarize: what this area does, what depends on it / what it depends on, which agent owns it per `docs/team/README.md`, and any documented gotcha (e.g. the known mock-hoisting bug class, or a skill's speculative/design-only banner) relevant to it.

## Validation Checklist

- [ ] `graphify-out/` freshness checked, updated if stale
- [ ] Cross-referenced against `CLAUDE.md`/skill, not graph output alone (the graph can be stale or wrong; docs and graph should agree — flag it if they don't)

## Best Practices

This command is meant to be cheap and fast — if the question turns out to need a real design decision, stop and route to `/architecture` rather than trying to answer it here.

## Expected Deliverables

A concise orientation: what the area does, its dependencies/dependents, its owning agent, and any known gotcha — enough to start work confidently, not a full audit.
