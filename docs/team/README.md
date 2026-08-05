# Eaz Community — AI Engineering Team

This document is the org chart for the multi-agent Claude Code workspace defined in `.claude/agents/`. It explains who exists, why each model was chosen, how work flows between agents, and how conflicts get resolved. Read this before invoking `/plan`, `/implement`, `/ship`, or any individual agent.

**How "agents" actually work here**, concretely: each file in `.claude/agents/<name>.md` is a Claude Code subagent — a separate context window with its own system prompt, its own restricted tool set, and (per this doc) its own model. The orchestrating session (you, talking to the main Claude) invokes them via the `Agent`/`Task` tool, one or several at a time, and threads their output into the next step. There is no persistent chat between agents — "communication" means the orchestrator carrying context forward, structured with the handoff template in `docs/team/templates/handoff-note.md`. Slash commands in `.claude/commands/` are pre-written orchestration scripts that do this sequencing for you.

## Roster

| #   | Agent             | Model  | One-line purpose                                                |
| --- | ----------------- | ------ | --------------------------------------------------------------- |
| 1   | `architect`       | Opus   | System architecture, module boundaries, Open Decisions sign-off |
| 2   | `project-manager` | Opus   | Scoping, prioritization, TASKS.md/ROADMAP.md ownership, routing |
| 3   | `mobile`          | Sonnet | React Native/Expo screens, hooks, navigation                    |
| 4   | `backend`         | Sonnet | Express modules: controller/service/repository/routes           |
| 5   | `database`        | Sonnet | Mongoose schemas, indexes, migrations                           |
| 6   | `api`             | Sonnet | REST contract, validation, envelope, versioning                 |
| 7   | `authentication`  | Opus   | JWT/refresh/RBAC/OTP implementation                             |
| 8   | `e2ee`            | Opus   | Signal-Protocol 1:1 + group sender-key crypto                   |
| 9   | `security`        | Opus   | OWASP/auth/webhook/rate-limit audit (review-only)               |
| 10  | `performance`     | Opus   | Index/query/pagination/caching audit (review-only)              |
| 11  | `testing`         | Sonnet | Unit/integration/API/component tests, coverage                  |
| 12  | `ui-ux`           | Sonnet | Design system, accessibility, interaction review                |
| 13  | `documentation`   | Sonnet | CLAUDE.md, Swagger, TASKS.md, skill docs                        |
| 14  | `devops`          | Sonnet | Docker, CI, env config, infra                                   |
| 15  | `code-reviewer`   | Opus   | Final holistic PR review (review-only)                          |
| 16  | `refactoring`     | Opus   | Structural cleanup without behavior change                      |
| 17  | `bug-hunter`      | Opus   | Root-cause diagnosis + fix for hard bugs                        |
| 18  | `ai-integration`  | Sonnet | Phase 5 AI assistant/translation/summary features               |
| 19  | `release-manager` | Opus   | Final go/no-go gate (review-only, changelog edit only)          |
| 20  | `realtime`        | Sonnet | Socket.IO events, presence, Redis adapter                       |
| 21  | `marketplace`     | Sonnet | Phase 3 catalog/orders/payments _(inactive until Phase 3)_      |

## Why each model was chosen

Claude Code's model options here are **Opus** and **Sonnet** (no Haiku assignments — everything in this roster is real engineering work, not simple lookups).

**Opus** goes to agents whose failure mode is expensive and whose job is _judgment under ambiguity_, not volume of code: `architect` (cross-cutting design decisions this project explicitly tracks as "Open Decisions" that block whole phases — get one wrong and every downstream module inherits it), `project-manager` (scoping and prioritization is a planning function — a bad scope call wastes every agent downstream of it), `authentication` and `e2ee` (this project's own docs call E2EE "load-bearing on everything downstream" — a subtle bug here is an account-takeover or key-leak, not a failed test), `security` and `performance` (audits are exactly "large reasoning over an existing system" — the value is in what a shallow pass _misses_), `code-reviewer` (the final human-facing quality gate — same reasoning as security), `refactoring` (must preserve behavior while changing structure — the risk is silent regression, which requires careful reasoning, not fast typing), `bug-hunter` (by definition handles the bugs that weren't obvious — if they were obvious, `testing` or `code-reviewer` would have caught them already), and `release-manager` (the last checkpoint before shipping — synthesizing every other agent's sign-off into one go/no-go call).

**Sonnet** goes to agents whose job is _implementing a well-specified pattern quickly and correctly_: `mobile`, `backend`, `database`, `api`, `testing`, `ui-ux`, `documentation`, `devops`, `ai-integration`, `realtime`, `marketplace`. These all have a documented pattern to follow (`CLAUDE.md`, the relevant `eaz-*` skill) — the job is disciplined execution against that pattern, which is exactly Sonnet's strength, and running the daily volume of this work on Opus would be needlessly slow and expensive for no quality gain.

Two calls worth explaining because they don't fall out of the obvious bucket:

- **`database` is Sonnet, not Opus**, even though schema mistakes are costly — because _day-to-day_ schema/index work follows an already-fully-specified design (`DATABASE_DESIGN.md`). A genuinely new schema decision (new collection, new sharding strategy) escalates to `architect` rather than the agent switching models mid-task.
- **`authentication`/`e2ee` are Opus even though they "implement code"** — normal implementation work is Sonnet-bucketed, but this project treats auth/crypto as a security domain, not a CRUD domain, and the user's own model-selection principles put security work on Opus. `backend` still implements routine `authorize()`-gated endpoints on Sonnet; `authentication`/`e2ee` own the auth/crypto module internals themselves.

## Collaboration Workflow

This improves on a strictly linear pipeline by matching this project's own existing N/A-skip convention (`CLAUDE.md` §6) and by running independent review passes in parallel instead of serially — three unrelated audits (security/performance/UI-UX) don't need to wait on each other.

```
Requirements / idea
   │
   ▼
project-manager        — scopes the change, checks TASKS.md/ROADMAP.md, decides
   │                       what's in/out, assigns owning agent(s), decides which
   │                       steps below are N/A for this change (recorded, not silent)
   ▼
architect               — ONLY if: schema change, new module boundary, an Open
   │  (skip → N/A)         Decision (PROJECT_SPEC.md §20) is implicated, or two
   │                       agents disagree (see Conflict Resolution below)
   ▼
   ├── database          — schema/index design (only if DB impacted)
   ├── api                — contract/validation design
   ├── realtime           — socket event design (only if realtime impacted)
   └── authentication /   — only if the auth or crypto surface is touched
       e2ee
   ▼
backend  ⇄  mobile        — implementation, run in parallel when independent
   ▼
testing                  — unit/integration/API/component tests, coverage floor
   ▼
   ├── security           ─┐
   ├── performance         ├─ run in parallel — independent concerns
   └── ui-ux (mobile only)─┘
   ▼
bug-hunter                — ONLY if testing/security/performance/ui-ux found a
   │  (skip if clean)        real defect; loops the fix back to the owning
   │                         implementer's queue, then re-enters at `testing`
   ▼
code-reviewer             — final holistic pass: naming, reuse, DoD checklist
   ▼
documentation             — CLAUDE.md / TASKS.md / Swagger / skill updates
   ▼
release-manager           — CI green? DoD complete? changelog? → go/no-go
   ▼
Merged / Shipped
```

Agents **not** in the linear flow — invoked contextually, not as a pipeline stage:

- `refactoring` — on demand, or triggered by a `code-reviewer`/`bug-hunter` finding that's structural rather than a bug.
- `devops` — parallel track for CI/infra/Docker/env changes; gates `release-manager` the same way `testing` gates it.
- `ai-integration`, `marketplace` — follow the same `backend ⇄ mobile → testing → review` shape as any other feature; called out separately only because they're future-phase domains with their own skills.

## Agent Communication, Handoff, Escalation, Conflict Resolution

**Handoff**: when one agent's output feeds another (e.g. `database`'s schema feeds `backend`'s model file), the orchestrator writes a short handoff note using `docs/team/templates/handoff-note.md` — what was decided, what's still open, what the next agent must not re-litigate. This keeps context threading disciplined instead of re-deriving everything each hop.

**Escalation** (an agent hits something outside its scope):

- A cross-cutting design question (schema, module boundary, an Open Decision) → **`architect`**.
- A scoping/priority question ("should this even be in this change?") → **`project-manager`**.
- A security question of any kind, from any agent → **`security`**, and its verdict is binding (see below).

**Conflict resolution** (two agents disagree — e.g. `performance` wants denormalization, `database` wants a normalized model): escalate to `architect` for a binding decision, recorded as an ADR via `docs/team/templates/adr.md` in `docs/architecture-decisions/`. The ADR is the tiebreaker for any future agent that re-encounters the same tension — don't re-litigate a decided ADR without a new fact.

**Approval / veto rules**:

- `security` findings are **always blocking** — no other agent (including `architect`) can override a security finding; only the user can explicitly accept a documented risk.
- `release-manager` has final veto even if every upstream agent signed off — it's the CI/DoD/changelog gate, not a rubber stamp.
- `code-reviewer` blocks on any unresolved checklist item per `docs/team/checklists/code-review.md`; non-blocking suggestions don't gate merge.

**Review-only agents cannot self-approve their own fix.** `security`, `performance`, `code-reviewer`, and `release-manager` have no `Write`/`Edit` tool access (see each agent's frontmatter) — they can only produce findings. Applying a fix always routes back to the owning implementer agent (`backend`, `mobile`, `database`, etc.) or `bug-hunter`, which then re-enters at `testing`.

## Standards

Every agent is instructed to read `CLAUDE.md` and its relevant `eaz-*` skill(s) before starting — standards live there, not duplicated per-agent-file, so they never drift out of sync. `docs/team/standards.md` covers only what's genuinely cross-cutting to _how agents operate as a team_ (handoff format, escalation ladder, DoD gate reuse) rather than restating engineering standards already in `CLAUDE.md`.
