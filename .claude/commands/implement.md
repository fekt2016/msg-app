---
description: Implement a scoped feature — dispatches to the correct implementer agent(s) (backend/mobile/database/api/realtime/authentication/e2ee) based on what the change touches.
argument-hint: [feature or task description, ideally already scoped by /plan]
---

## Purpose

Route a scoped change to the right implementer agent(s), in the right dependency order, and not consider it done until it's tested.

## Responsible Agent(s)

One or more of: `database`, `api`, `authentication`, `e2ee`, `realtime`, `backend`, `mobile`, `marketplace`_, `ai-integration`_ (*confirm active before invoking — see their own files). Ordering and parallelism follow `docs/team/README.md`'s workflow diagram, which is the source of truth — this command's dispatch table below is a quick-reference, not a replacement for it.

## Inputs

$ARGUMENTS — a feature or task description. If it hasn't already been scoped (no plan/handoff note in context), run `/plan` first rather than guessing scope here.

## Workflow

1. Confirm scope exists (from `/plan` or prior context); if not, run `/plan` first.
2. Determine which domain(s) this touches and invoke the matching agent(s):
   - Schema/collection change → `database`, before anything that depends on it.
   - New/changed endpoint contract → `api`, before `backend`/`mobile` build against it.
   - Auth/session/RBAC → `authentication`.
   - Message encryption/keys → `e2ee`.
   - Socket/realtime event → `realtime`.
   - General backend business logic → `backend`.
   - Mobile screens/hooks/navigation → `mobile`.
   - Phase 3 commerce → `marketplace` (confirm active first).
   - Phase 5 AI features → `ai-integration` (confirm active first).
3. Run in dependency order per `docs/team/README.md` (schema → contract → implementation); run `backend` and `mobile` in parallel once the contract is fixed, since they're independent past that point.
4. Pass a handoff note (`docs/team/templates/handoff-note.md`) between dependent steps.
5. Run `/test` on the result — `/implement` isn't finished until tests exist and pass.

## Validation Checklist

- [ ] Schema (if any) agreed before `backend` starts building against it
- [ ] Contract (if any) fixed before `backend`/`mobile` implement against it
- [ ] `/test` run and passing before considering this done

## Best Practices

When a change spans many domains, resist the urge to run everything in parallel — only what's genuinely independent past the schema/contract step should overlap; the rest has a real dependency order.

## Expected Deliverables

Working implementation, tested, with `pnpm lint`/`typecheck`/`test` clean for every workspace touched.
