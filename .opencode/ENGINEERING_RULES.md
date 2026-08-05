# Engineering Rules — Eaz Community (v2)

Non-negotiable engineering standards for the Eaz Community project.

---

## 1. General

Complete one feature before starting another _(per the phased release
plan in `PROJECT_SPEC.md` §8 — "feature" means a unit within the
current phase, not a step blocking the whole project)_.

Never skip documentation. Never create duplicate logic. Always
prioritize scalability. Always write production-ready code. Never
remove existing functionality without approval. Never guess
requirements — ask when unclear.

---

## 2. Backend Rules

Express.js only · TypeScript · MongoDB only · Mongoose · Service Layer
Architecture · Repository Pattern · Socket.IO for realtime · REST APIs
· JWT Authentication · Redis for cache · BullMQ for queues · Keep
controllers thin · Business logic in services · Repositories only
access MongoDB.

---

## 3. API Rules

RESTful API · Versioned under `/api/v1` · Consistent response format ·
Proper HTTP status codes · Input validation on every endpoint ·
Centralized error handling · No business logic in route handlers ·
Documented via OpenAPI/Swagger (`swagger-jsdoc` + `swagger-ui-express`) ·
Default pagination: 20 per page, max 100.

---

## 4. Database Rules

MongoDB · Mongoose · Every schema must have timestamps, indexes,
validation, references, pagination support · No duplicated data ·
Design schemas for scale (indexes on query fields).

**Gap fixed — add:**

- **Soft-delete convention**: decide now whether records are soft-
  deleted (`deletedAt` field) or hard-deleted, and apply it
  consistently — chat messages, orders, and user accounts likely need
  different answers here, so state the default and the exceptions.
- **Migration tooling**: name a tool (e.g., `migrate-mongo`) and
  require a rollback path for every migration, not just a forward
  script.

---

## 5. Socket Rules

Socket.IO only · Realtime events must be documented · No business
logic inside socket handlers · Authentication required on socket
connections · Use Redis adapter for horizontal scaling.

**Gap fixed — add:** **Event naming convention** (e.g.,
`namespace:action`, such as `chat:message:new`) — without one,
event names drift per-developer and become unmaintainable once
Communities, Channels, and Calls all add their own events.

---

## 6. Security Rules

JWT with short-lived access tokens · Refresh tokens for long-lived
sessions · OTP for sensitive flows · Rate limiting on public endpoints
· Helmet for security headers · CORS configured explicitly · Input
validation and sanitization · Encryption for sensitive data · Secure
file uploads (validate types, sizes, content) · Follow OWASP
guidelines · Never commit secrets.

**Gap fixed — add:**

- **Rate-limit tiers**: "rate limiting on public endpoints" needs
  actual numbers, and authenticated endpoints need limits too (e.g.,
  OTP requests capped at 3/hour/number is a security-critical number,
  not a detail to leave to whoever builds that endpoint).
- **Dependency auditing**: `npm audit` / Snyk in CI, with a policy for
  what severity blocks a merge.
- **E2EE decision reference**: `PROJECT_SPEC.md` §15 flags end-to-end
  encryption for private chat as undecided — once decided, the answer
  belongs here as a concrete rule, since it constrains how message
  storage, search, and the AI Assistant are all built.

---

## 7. Coding Standards

TypeScript only; no JavaScript · Small, reusable functions ·
Feature-based folder organization · Thin controllers · Business logic
in services · Repositories only access MongoDB · Reusable utilities ·
Consistent naming conventions · No dead code · Every public API
documented.

**Gap fixed — add:** **Linting and formatting tools are unnamed.**
"Consistent naming conventions" and "no dead code" aren't enforceable
without tooling — add ESLint + Prettier with a shared config, plus
`husky` + `lint-staged` so violations are caught pre-commit, not in
review.

---

## 8. Mobile Rules

React Native Expo · TypeScript · TanStack Query for server state ·
Axios for HTTP · Reusable components · Feature-based folder structure
· Offline support for core flows · Accessibility respected.

**Gap fixed:** "Accessibility respected" has no enforcement mechanism
— add an automated check (e.g., `eslint-plugin-react-native-a11y`)
plus a manual screen-reader pass as part of Feature Testing in
`PROJECT_SPEC.md` §8, not a vague standing intention.

---

## 9. Testing Rules

Backend APIs must have tests · Mobile components and hooks must have
tests · Regression testing before each release · Integration testing
across backend layers · Performance testing for realtime and
high-traffic flows · Bug reports must include reproduction steps.

**Gap fixed — add:** **A coverage target.** "Must have tests" with no
number tends to produce token tests written to satisfy the rule
rather than to catch bugs — set a realistic floor (e.g., 70% on
services/repositories, critical auth/payment paths higher) and enforce
it in CI.

---

## 10. Feature Completion Checklist

A feature is complete only if: Backend complete · Mobile complete ·
Database complete · API complete · Socket complete _(or explicitly
marked N/A per `PROJECT_SPEC.md`'s workflow — see the note below)_ ·
Validation complete · Error handling complete · Testing complete ·
Documentation updated · **Security reviewed** · Code reviewed ·
Merged.

**Consistency fix:** this list required Socket ✅ unconditionally,
which conflicts with the phased plan in `PROJECT_SPEC.md` (most
features, e.g., Marketplace CRUD, have no realtime component). Aligned
the wording here to match — N/A is a valid, signed-off state, not a
loophole. Also added **Security reviewed**, since §6 exists as a rule
set but wasn't checked per-feature anywhere in the original.

---

## 11. Environment & Config

All configuration through environment variables · Use `.env.example`
as the template · Never commit `.env` files · Validate environment
variables at application startup (fail fast, not at first use).

---

## 12. Git Workflow

Small, focused commits · Meaningful commit messages · One feature per
branch/PR · Code review before merge · Keep `main` deployable at all
times.

**Gap fixed — add:**

- **CI must pass before merge is mergeable** — lint, tests, and type
  check as required status checks, not just a human review gate.
- **Branch naming convention** (e.g., `feature/`, `fix/`, `chore/`
  prefixes) so branches are self-describing in a growing repo.
