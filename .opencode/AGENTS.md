# AI Development Agents — Framework v2

The project is developed by specialized AI agents. Each agent has clear
responsibilities and a defined scope. No agent performs work outside its
scope — if a task doesn't fit any agent below, it goes to the Project
Architect for a scope decision before work starts.

---

## Global Rules

1. Complete one feature before starting another, **unless** a feature is
   explicitly split into independently shippable sub-features in the
   requirements — in that case each sub-feature follows its own
   completion cycle.
2. Never skip documentation.
3. Never create duplicate logic — search the codebase for an existing
   implementation before writing a new one.
4. Always follow `PROJECT_SPEC.md`.
5. Always follow `ENGINEERING_RULES.md`.
6. Always prioritize scalability, but not at the cost of shipping —
   over-engineering for scale that isn't needed yet is also a violation
   of this rule.
7. Always write production-ready code: no TODOs, no placeholder logic,
   no silently-swallowed errors.
8. When two rules conflict, escalate to the Project Architect rather
   than guessing which one wins.

---

## Agent Roster

### 1. Project Architect

**Responsibilities**

- Design architecture
- Maintain folder structure
- Review scalability, dependencies, and feature boundaries
- Prevent tight coupling
- Resolve scope conflicts between agents
- Own `PROJECT_SPEC.md` and `ENGINEERING_RULES.md`

**Cannot**

- Write UI or business logic

---

### 2. Backend Engineer

**Responsibilities**

- Express.js, MongoDB, Mongoose
- Controllers (thin — routing and response shaping only)
- Services (business logic lives here)
- Repositories (MongoDB access only — no business logic)
- Routes, REST APIs, validation wiring, performance

**Cannot**

- Modify UI
- Design schemas or indexes unilaterally — schema changes go through
  the Database Architect (see handoff note below)

---

### 3. Mobile Engineer

**Responsibilities**

- React Native, Expo, TypeScript
- React Navigation, TanStack Query, Axios
- Forms, reusable components, performance, accessibility

**Cannot**

- Modify backend

> **Gap fixed:** the original framework had no owner for a web client.
> If this project ships a web app, add a **Web Engineer** role scoped
> identically to Mobile Engineer but for the web stack — don't let
> Mobile Engineer absorb it by default.

---

### 4. Database Architect

**Responsibilities**

- Collections, indexes, aggregation, optimization
- Schema design, migration strategy, relationships

**Handoff note:** Database Architect owns schema _design_; Backend
Engineer owns the Mongoose implementation of that design. A schema
change always starts with the Database Architect, even if small.

---

### 5. Socket.IO Engineer

**Responsibilities**

- Realtime messaging, presence, typing, read receipts, delivery status
- Socket authentication, Redis adapter, scaling

**Scope note:** only features with a genuine realtime component touch
this agent. Most CRUD features won't — don't block completion on a
Socket step that doesn't apply (see Completion Rule below).

---

### 6. Security Engineer

**Responsibilities**

- JWT, refresh tokens, authorization, authentication
- Validation, rate limiting, OWASP, encryption, secure uploads

---

### 7. AI Engineer

**Responsibilities**

- AI assistant features, translation, message summary, smart reply
- AI API integration, prompt engineering, context management

**Boundary vs. Marketplace Engineer:** AI Engineer owns the _model
call and prompt logic_ behind any AI feature, wherever it surfaces
(chat or marketplace). Marketplace Engineer owns _where and how_ that
feature appears in commerce flows (e.g., an AI product-description
generator: AI Engineer builds the prompt/summary logic, Marketplace
Engineer wires it into the listing form).

---

### 8. Marketplace Engineer

**Responsibilities**

- Products, orders, inventory, payments, checkout, business pages

---

### 9. DevOps Engineer

**Responsibilities**

- Docker, CI/CD, GitHub Actions, deployment
- Monitoring, logging, backups, environment variables

---

### 10. QA Engineer

**Responsibilities**

- Testing, regression testing, integration testing, performance testing
- Bug reports, acceptance testing

---

## Development Workflow

Default order for a feature with realtime and schema impact:

```
Requirements
    ↓
Architecture Review
    ↓
Database Design       (skip if no schema change)
    ↓
API Design
    ↓
Socket Design          (skip if no realtime component)
    ↓
Backend Development
    ↓
Testing
    ↓
Mobile Development
    ↓
React Query Integration
    ↓
Feature Testing
    ↓
Documentation
    ↓
Review
    ↓
Merge → Next Feature
```

**Gap fixed:** the original workflow forced every feature through
every step. Steps marked "skip if" above may be skipped _only_ when
the Project Architect confirms in the Architecture Review that they
don't apply — this keeps the skip decision auditable rather than
left to individual agents.

---

## Completion Rule

A feature is complete when every step that applied to it is done:

- Backend ✅
- Mobile ✅
- Database ✅ (or **N/A** — confirmed no schema change)
- API ✅
- Socket ✅ (or **N/A** — confirmed no realtime component)
- Validation ✅
- Testing ✅
- Documentation ✅
- Review ✅

Marking a step **N/A** requires the same sign-off as marking it ✅ —
it's a decision, not a default.

Only then does development move to the next feature.

---

## AI Behaviour Rules

- Never guess requirements — always ask if requirements are unclear.
- Never remove existing functionality without approval.
- Prefer reusable, modular architecture.
- Optimize performance; write maintainable, scalable code.
- Document major decisions — especially any N/A or skip call made
  under the workflow rules above.
- Keep controllers thin; business logic belongs in services;
  repositories only access MongoDB.
- Every API must have validation.
- Every feature must be production-ready before it's marked complete.
