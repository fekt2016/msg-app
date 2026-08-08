# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Project Overview

**Eaz Community** — a community-first communication platform for Ghana and Africa: messaging, communities, AI, marketplace, and digital payments in one cross-platform mobile app (Android & iOS, mobile-first). Target users span individuals, businesses, schools, churches, mosques, organizations, government, and SMEs.

Development follows a strict phased roadmap (see §6) and a "finish one feature completely before starting the next" discipline — a feature isn't done until every applicable layer (Backend / Mobile / Database / API / Socket / Validation / Testing / Documentation / Security review / Code review) is signed off, with Database/Socket explicitly markable **N/A** when a feature genuinely has no schema or realtime component.

This project was previously scaffolded and driven with **OpenCode** (`.opencode/`). It has been migrated to Claude Code; this file is now the primary source of guidance. The original `.opencode/*.md` docs are preserved for detailed reference (full DB schema, exhaustive per-domain skill guides) and are linked from the relevant sections below rather than duplicated in full.

## 2. Tech Stack

| Layer   | Stack                                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile  | React Native, Expo (SDK 57), TypeScript, React Navigation, TanStack Query, Axios, Socket.IO Client, React Hook Form, Zod, WatermelonDB (offline persistence), EAS (OTA/build pipeline)                                            |
| Backend | Express.js (v5), TypeScript, MongoDB, Mongoose, Socket.IO, Redis, BullMQ, JWT, Cloudinary + Multer (media), Paystack (payments, Phase 3), `libsignal` (E2EE), Africa's Talking (OTP/SMS), Typesense (search, public content only) |
| Infra   | Docker / Docker Compose (MongoDB, Redis, Typesense), pnpm workspaces, GitHub Actions CI, Sentry (planned), Firebase Cloud Messaging (planned), AWS/DigitalOcean + Nginx (planned)                                                 |
| Tooling | ESLint (flat config, shared) + Prettier + husky + lint-staged, Vitest (backend), Jest/`jest-expo` (frontend), Swagger/OpenAPI (`swagger-jsdoc` + `swagger-ui-express`)                                                            |

**Decided architecture (not open questions):**

- **Full E2EE** for private chat — Signal-Protocol-style for 1:1, a _separate_ sender-key distribution scheme for group chat. The server stores/relays ciphertext only.
- **Offline DB:** WatermelonDB (SQLite in production, LokiJS in tests).
- **OTP provider:** Africa's Talking.
- **Search:** Typesense, self-hosted, scoped to public content only (Communities/Channels/Marketplace) — private message content is excluded by the E2EE decision.
- **Soft-delete is the default** (see §11), with append-only exceptions for ledgers/events/logs.

**Open decisions** (tracked in `.opencode/PROJECT_SPEC.md` §20, resolved by phase, not to be decided ad hoc by whichever change touches the area first): object storage strategy beyond Cloudinary, seller/KYC requirements (Phase 3), analytics tool (Phase 7).

## 3. Repository Structure

pnpm monorepo, two workspaces:

```
backend/src/
  modules/<feature>/     <feature>.model.ts / .repository.ts / .service.ts / .controller.ts / .routes.ts / .validation.ts
  middleware/             authenticate, authorize, validate, errorHandler
  realtime/               Socket.IO server, auth, presence, Redis adapter, per-domain event modules
  config/                 env.ts (validated, fail-fast), logger.ts (pino)
  errors/                 AppError
  utils/                  apiResponse, asyncHandler, phone normalization
  routes/health.routes.ts
  api-docs/swagger.ts

frontend/src/
  screens/                React Native screens
  navigation/             Auth stack vs. App stack (React Navigation), gated by AuthContext
  api/                    Axios clients per backend module (api/client.ts is the shared instance)
  auth/                   AuthContext, tokenStorage (SecureStore), device id
  e2ee/                   Signal-Protocol crypto (1:1), group sender-key crypto, key storage
  realtime/               Socket.IO client + RealtimeProvider (presence/connection state)
  db/                     WatermelonDB (adapter.native.ts / adapter.web.ts split; db/testing/sqliteStub.ts for tests)
  hooks/                  TanStack Query hooks
  components/, theme/     Shared UI primitives, design tokens
```

Root: `docker-compose.yml` (Mongo/Redis/Typesense), `pnpm-workspace.yaml`, root `package.json` (workspace-level scripts), `.env.example`.

**Governance docs** (still authoritative, read before non-trivial changes):

- `.opencode/PROJECT_SPEC.md` — product spec, full tech stack, decided vs. open architecture decisions
- `.opencode/ENGINEERING_RULES.md` — engineering standards (this file merges and supersedes it as the primary reference, but it's the fuller version)
- `.opencode/ROADMAP.md` — phase plan and status
- `.opencode/TASKS.md` — feature-level checklist; a box is checked only when the _full_ completion checklist is done, not just "backend done" — check this before assuming a listed feature is finished
- `.opencode/DATABASE_DESIGN.md` — full collection/index/schema design for the Marketplace domain (Phase 3, not yet built) — the authoritative source for exact field lists; §11 has the soft-delete decision
- `.opencode/skills/` — deep how-to guides per domain, migrated 1:1 into `.claude/skills/` (see §14) with corrections; use the Claude Code skills, not the `.opencode` copies, going forward

## 4. Coding Standards

- **TypeScript only** — no JavaScript, anywhere in the monorepo.
- Small, focused, reusable functions. No dead code, no unused imports.
- **Never duplicate logic** — search the codebase for an existing implementation before writing a new one.
- No TODOs, no placeholder logic, no silently-swallowed errors (`catch {}` is a defect, not a shortcut). Production-ready code only — but "production-ready" doesn't mean over-engineered: don't build for scale that isn't needed yet.
- Never remove existing functionality without approval. Never guess requirements — ask when unclear.
- ESLint flat config (`eslint.config.mjs`) shared across workspaces: `@typescript-eslint/consistent-type-imports` enforced (`import type` for type-only imports), unused vars error (except `_`-prefixed args), `no-explicit-any` off (pragmatic, not a license to abuse it). Prettier: single quotes, semicolons, 100-char width, trailing commas, 2-space tabs. Enforced pre-commit via husky + lint-staged.

### Naming conventions

| Context                | Convention                                                         | Example                                       |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| Backend module files   | `<feature>.<layer>.ts`                                             | `auth.service.ts`                             |
| TS variables/functions | `camelCase`                                                        | `listChatUsers`                               |
| TS types/components    | `PascalCase`                                                       | `ChatScreen`, `ApiEnvelope`                   |
| Constants / env vars   | `UPPER_SNAKE_CASE`                                                 | `E2EE_ENABLED`                                |
| MongoDB collections    | plural `snake_case`                                                | `inventory_stock_items`                       |
| MongoDB fields         | `camelCase`                                                        | `displayName`                                 |
| Enum values            | `UPPER_SNAKE_CASE` string enums, whitelisted in Mongoose _and_ Zod | `PENDING`, `VERIFIED`                         |
| REST URL segments      | plural nouns, kebab-case, no trailing slash                        | `/api/v1/match-contacts`                      |
| Socket events          | `namespace:action`                                                 | `chat:message:new`, `community:member:joined` |
| Git branches           | `feature/`, `fix/`, `chore/` prefix                                | `feature/group-e2ee`                          |

## 5. Architecture

### Backend: strict layering, one folder per feature

**Controller → Service → Repository → Model.** Data flows one direction; never skip a layer.

- **Controllers are thin**: routing, request parsing, response shaping only.
- **Services hold all business logic**: orchestration, transactions, side effects. A service never imports a controller.
- **Repositories are the only code that touches MongoDB/Mongoose**: no business logic. A repository never imports a service.
- **Socket.IO handlers are a transport, not a parallel logic path** — they call the _same_ services as REST controllers (see `backend/src/realtime/`). Never duplicate business logic in a socket handler.
- **Fail fast**: validate at the route edge (Zod, via `middleware/validate.ts`), throw a typed `AppError` from services, let the single centralized `errorHandler` middleware format the response. Async handlers wrap with `asyncHandler` so rejected promises reach the error handler — never `try/catch`-and-swallow in a service.
- **Optional external integrations use a provider + logging-fallback pattern**: a real provider (`modules/search/typesense.ts`, `modules/auth/otpProvider.ts`, `modules/users/mediaStorage.ts`) plus a `Logging*Provider` used when the corresponding `*_ENABLED` env flag is off, so local dev never requires every external service configured.

### End-to-end encryption (decided, load-bearing on everything downstream)

Private 1:1 chat is fully E2EE (Signal-Protocol-style: `backend/src/modules/e2ee/`, `frontend/src/e2ee/crypto.ts`) — the server relays/stores ciphertext only and cannot read content. Group chat uses a **separate** sender-key distribution scheme (`modules/e2ee/groupKey.*` backend, `frontend/src/e2ee/group*.ts` + `groupSession.ts` orchestration, `GroupChatScreen`) — treat it as distinct scope, not an extension of 1:1. The group entity + membership live in their own module (`backend/src/modules/groups/`, `groups`/`group_members` collections); `group_members` is the single authoritative membership source for both the E2EE sender-key authorization (`groupKeyService`) and the realtime `group:{id}` room-join gate — an opaque `groupId` with no membership backing no longer exists.

Binding downstream consequences:

- Server-side search and AI features (message summary, smart reply — Phase 5) can **never** operate on private-chat plaintext. They must run on-device, or be scoped to non-encrypted surfaces (Channels/Communities).
- Message backup requires a user-held recovery key (recovery phrase, Signal-style) — a lost device without one means lost history. This is in-scope for Phase 1, not optional polish. Implemented server-blind (backend + mobile + tests done, pending Security/Code review + merge): a 24-word BIP39 phrase → Argon2id → AES-256-GCM over the on-device identity bundle; the server stores an opaque ciphertext blob only. Backs up the identity bundle alone, which suffices to recover history **only while 1:1 has no forward secrecy** — see ADR 0003 and `.opencode/TASKS.md`. Revisit scope at the X3DH milestone.

### Frontend: feature-based, offline-first

- Server state goes through **TanStack Query** hooks (`frontend/src/hooks/`) — no ad hoc fetches inside components.
- Offline persistence via **WatermelonDB** — `frontend/src/db/adapter.native.ts` (SQLite) / `adapter.web.ts`, with `db/testing/sqliteStub.ts` (LokiJS-backed) for Jest. **Current state: scaffolding only** — `frontend/src/db/schema.ts` defines `appSchema({ tables: [] })`, i.e. the adapter/provider wiring exists but no tables or a sync protocol have been implemented yet. Don't assume offline sync is functional for any feature until a table + sync logic is actually added here.
- Auth session: `AuthContext` holds session state and installs an axios response interceptor that, on `401`, attempts one silent token refresh via `authApi.refresh` and retries the original request; on refresh failure it clears the stored session (auto-logout). Tokens live in `expo-secure-store` (`tokenStorage.ts`) — never `AsyncStorage`.
- Navigation shell: the authenticated app is a bottom-tab shell (`navigation/MainTabs.tsx`, via `@react-navigation/bottom-tabs`) hosting the four top-level destinations — Home / Communities / Chats / Profile (`MainTabsParamList`) — with `AppNavigator` as the root stack above it. Detail screens that want an immersive, tab-free surface (Chat, GroupChat, CommunityDetail, CreateCommunity, CreateGroup) are pushed on the root stack rather than inside a tab; tab screens type their navigation with `CompositeScreenProps` (tab + root stack) so `navigate()` is checked across both levels. Tab roots have no back buttons — only pushed detail screens do.
- Realtime: `RealtimeProvider` connects the Socket.IO client on login and tears down on logout, exposing connection/presence state via `useRealtime()`.

### UI / design system

- `frontend/src/theme/tokens.ts` — shared `colors`, `spacing`, `radius` tokens (a warm "baobab / kente gold / savanna / terracotta" palette). Use these tokens rather than inlining hex values or spacing numbers in screens/components.
- Shared building blocks: `components/AuthScreenShell.tsx`, `Button.tsx`, `FormField.tsx`, `WovenMark.tsx` — reuse before adding a new one-off primitive.
- Accessibility is enforced, not aspirational: interactive elements get explicit `accessibilityRole`/`accessibilityLabel` (see the Send button in `ChatScreen`, the OTP input's `6-digit verification code` label). There's no automated a11y lint wired in yet (`eslint-plugin-react-native-a11y` is a documented gap in `.opencode/ENGINEERING_RULES.md` §8) — treat manual accessibility checks as part of Feature Testing until that's added.
- Empty/loading/error states are explicit UI states on every data-driven screen (see `HomeScreen`, `ProfileScreen`) — never render on `undefined`/partial data.

## 6. Development Workflow & Roadmap

Feature order per the current phase (steps marked "skip if" are only skippable with an explicit Architecture Review sign-off, recorded as **N/A** — not a silent default):

```
Requirements → Architecture Review → Database Design (skip if no schema change)
  → API Design → Socket Design (skip if no realtime component)
  → Backend Development → Testing → Mobile Development
  → React Query Integration → Feature Testing → Documentation → Review → Merge
```

**Phases** (full detail in `.opencode/ROADMAP.md`):

| Phase                      | Scope                                                                                                              | Status                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Foundation             | Monorepo, workspaces, Docker, CI, env validation, lint/format/hooks, Swagger, test frameworks, offline DB scaffold | Done                                                                                                                              |
| 1 — Core Messaging         | Auth (OTP), profiles, E2EE 1:1 + group key-distribution + recovery-key backup, private/group chat, Socket.IO+Redis | In progress — see `.opencode/TASKS.md` for exact remaining items (recovery-key flow in review; 1:1 forward secrecy)               |
| 2 — Community Features     | Search (Typesense, decided), object storage decision, Communities, Channels, Stories, push notifications           | In progress (Communities complete; Channels CH1 + CH1b + CH2 + CH3 backend on `feature/phase-2-channels`, mobile partial)         |
| 3 — Marketplace & Payments | Products/orders/inventory, business pages, Paystack checkout, idempotent webhooks, seller KYC                      | Pending — design fully specified in `.opencode/DATABASE_DESIGN.md` and the marketplace skills (§14), nothing built yet            |
| 4 — Realtime Calls         | WebRTC signaling + TURN/STUN, voice, video                                                                         | Pending (deliberately sequenced after Marketplace — TURN infra is slower to get right, and Marketplace/Payments generate revenue) |
| 5 — Intelligence           | AI assistant, translation, on-device-only summary/smart-reply for private chats                                    | Pending                                                                                                                           |
| 6 — Platform & Admin       | Business accounts, admin dashboard, moderation, settings/privacy, Ghana Data Protection Act (Act 843) compliance   | Pending                                                                                                                           |
| 7 — Scale & Release        | Analytics, full load testing, store releases, production deploy/monitoring/backups                                 | Pending                                                                                                                           |

Before starting work, check `.opencode/TASKS.md` for what's actually next in the current phase — the project enforces one feature fully complete before the next starts.

## 7. Definition of Done

A feature is complete only when **every applicable item** below is true (Database and Socket may be signed off **N/A** — that's a decision requiring the same rigor as ✅, not a default):

- [ ] Backend (service/repository/controller/routes wired, no logic in controllers)
- [ ] Mobile (screens/hooks/API client wired)
- [ ] Database (schema + indexes) — or **N/A**, confirmed
- [ ] API (versioned, validated, documented in Swagger)
- [ ] Socket (if realtime) — or **N/A**, confirmed
- [ ] Validation (Zod on every endpoint, both body/query/params)
- [ ] Error handling (typed `AppError`, no swallowed exceptions)
- [ ] Testing (unit + integration/API + component as applicable, coverage floor met)
- [ ] Documentation updated (this file, Swagger, `.opencode/TASKS.md`)
- [ ] Security reviewed
- [ ] Code reviewed
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all clean for every workspace touched
- [ ] Merged

## 8. API Conventions

- Versioned under `/api/v1`; a breaking change gets `/api/v2`, never a silent field-semantics change.
- Response envelope, consistent everywhere:
  ```ts
  // success
  { success: true, data: T, meta?: { page, pageSize, total, totalPages } }
  // error
  { success: false, error: { code: string, message: string, details: unknown[] } }
  ```
- Status codes: `200/201/204` success · `400` malformed · `401` unauthenticated · `403` forbidden · `404` not found · `409` conflict/idempotency · `413`/`415` upload issues · `422` validation failure · `429` rate limited · `500` only for genuinely unexpected (non-operational) errors — never for expected business failures.
- Every endpoint validates `body`/`query`/`params` with a Zod schema in `<feature>.validation.ts`, wired through `middleware/validate.ts`; unknown fields rejected by default.
- Pagination: `page` (1-based, default 1), `pageSize` (default 20, max 100), response carries `meta`. Cursor pagination allowed for high-volume feeds (notifications, inventory transactions) — always with a deterministic secondary sort so pages don't skip/duplicate rows.
- Filters are explicit, documented, indexed-fields-only query params — never a generic `?filter={json}`.
- Rate limiting tiers are real numbers, not vague policy: see `.opencode/ENGINEERING_RULES.md` §6 for OTP/auth-specific limits; general public endpoints are rate-limited via `express-rate-limit`, Redis-backed so limits hold across instances.
- Documented via `swagger-jsdoc` + `swagger-ui-express` at `/api-docs`.

## 9. Database Conventions

Full schema-level design (all 19 planned collections, indexes, relationship map) lives in `.opencode/DATABASE_DESIGN.md` — read it before adding or changing a collection. Currently-implemented collections are the auth/e2ee/communities/channels set under `backend/src/modules/*/**.model.ts`; the Marketplace collections there are design-only (Phase 3).

Cross-cutting rules that apply to every collection, implemented or planned:

- `createdAt`/`updatedAt` timestamps (`{ timestamps: true }`), validated at the Mongoose schema level **and** the API edge (Zod) — never rely on one alone.
- Every documented query path has a matching index; verify with `explain()` before considering a feature done.
- **Money is exact**: integer minor units (e.g. Ghana pesewas) with an explicit `currency` field, never floats.
- **Reference vs. embed**: reference (ObjectId) what's shared/queried independently (`users`, `categories`, `products`); embed what's owned by the parent and always read together (`cart.items`, `order.lines`, `product.variants`); use append-only collections for unbounded, auditable history (`inventory_transactions`, `order_events`, `activity_logs`).
- **Snapshot, don't recompute**: order line price/name/attributes are captured at purchase time and never mutated by later catalog changes.
- **Soft-delete is the default** — `deletedAt: null` filter applied by the repository layer on every read; business keys (`slug`, `email`, `sku`) are explicitly released on deletion so they can be reused. Exceptions: OTP codes and sessions are hard-deleted/TTL'd; append-only ledgers (`inventory_transactions`, `order_events`, `activity_logs`) are never deleted, only archived.
- **Atomic writes on money/stock**: single-document atomic operations (`findOneAndUpdate` with a guard filter, `$inc`) — never read-modify-write. See the inventory skill (§14) for the reserve/release/decrement pattern.
- Migration tool: `migrate-mongo` — every migration needs both a forward and a rollback script; schema changes are additive first (new/sparse-indexed fields), destructive changes require Database-Architect-equivalent review.

## 10. Testing Strategy

- Backend: **Vitest** (`backend/vitest.config.ts`) — `environment: 'node'`, coverage via v8, thresholds **lines/functions/statements 70%, branches 60%**, enforced in CI.
- Frontend: **Jest** (`jest-expo` preset, `frontend/jest.config.js`) — same coverage thresholds. `setupFiles: jest.setup.ts` centrally mocks `expo-secure-store`, `expo-application`, `expo-constants`, `expo-contacts`, `react-native-safe-area-context`.
- **Mocking convention (frontend, important — a real bug class in this codebase):** modules mocked across many files are mocked once in `jest.setup.ts`; individual test files cast the import to `jest.Mock`/`jest.Mocked<...>` (see `src/auth/tokenStorage.test.ts`) rather than re-declaring `jest.mock()` locally. When a test-local mock is genuinely needed, define the `jest.fn()`s **inline inside the `jest.mock()` factory** (see `src/api/users.test.ts`) — never as outer `const mock* = jest.fn()` bindings referenced from the factory. Jest's hoisting runs the factory before those outer bindings are initialized despite the `mock`-prefix naming exception looking like it should work, so the mocked methods silently end up `undefined` at runtime. (`frontend/src/e2ee/{groupCrypto,groupE2eeApi,groupKeyStore}.test.ts` were previously cited as live instances of this bug; they now follow the correct pattern — inline `jest.fn()`s in the factory plus typed casts of the imported module — and pass. `src/e2ee/groupSession.test.ts` is another worked example.)
- Test the contract, not the implementation: assert on the response envelope / public behavior, not internal calls.
- Repositories are tested against a real Mongo (integration), not mocked — Mongoose internals aren't a useful mock boundary. Services mock their repository. API tests use `supertest` against the mounted app and must cover the auth/ownership/validation error paths, not just the happy path.
- Never hit real Cloudinary/Paystack/Africa's Talking/SMTP in tests — mock the HTTP boundary and assert on the request the service makes.
- When fixing a bug, write the regression test first.

Single-test-run commands are in §13.

## 11. Security Requirements

- **JWT**: short-lived access token (`JWT_ACCESS_EXPIRES_IN`, default posture: minutes not days) + rotating refresh tokens (`JWT_REFRESH_EXPIRES_IN`). Refresh reuse (replay of an already-rotated token) revokes the entire token family, not just that token. Refresh tokens are per-device.
- **Password hashing**: bcrypt, never plaintext, constant-time verification.
- `authenticate` (identity) and `authorize` (permission) are always separate middleware — never conflated. Resource-level ownership checks (e.g., "a seller may only edit their own product") happen in the service, not in middleware.
- **OTP**: Africa's Talking; rate-limited, expiring, single-use, hashed at rest — never store the raw code.
- **Rate limiting**: tiered — public, auth (stricter), OTP (strictest) — Redis-backed so limits hold across instances. See `.opencode/ENGINEERING_RULES.md` §6 for the concrete numbers before adding a new limited endpoint.
- **Uploads**: validated by MIME _and_ magic-byte content sniffing (never `Content-Type` header alone), size-limited, streamed through the backend (`multer` memory storage → Cloudinary) — the API secret never reaches a client.
- Helmet + explicit CORS. Input validation and sanitization at the API edge. Never commit secrets; `.env.example` is the template, `.env` is gitignored.
- Full OWASP-guideline posture: no raw HTML reflection, no injection via unvalidated input, no verbose error/stack-trace leakage to clients.
- Dependency auditing (`npm audit`/Snyk) belongs in CI with a severity policy — currently a documented gap (`.opencode/ENGINEERING_RULES.md` §6), not yet wired.
- E2EE is a security requirement, not a feature flag — see §5.

## 12. Performance Requirements

- Index every field used in a documented filter/sort/`$match`. Verify with `explain()`.
- Never `find()` an entire collection — always `limit()` + project only the fields the client renders. Use Mongoose `lean()` on read-only queries.
- Redis caching on hot, infrequently-written reads (catalog, sessions, settings), invalidated explicitly on write — cache-aside, not TTL-and-hope.
- Heavy/slow/retryable work (notifications, media post-processing) goes through BullMQ — never `await`ed inline in a request handler.
- Socket.IO scales via the Redis adapter (already wired: `backend/src/realtime/adapter.ts`, with an in-memory fallback for dev/tests).
- Default pagination 20/max 100 is a performance control, not just an API convention — enforce server-side regardless of client-requested size.

## 13. Environment Setup & Common Commands

Copy `.env.example` → `backend/.env` and fill in values. Env is Zod-validated at process startup (`backend/src/config/env.ts`) — fails fast on missing/invalid vars, not at first use. Feature flags with dev logging-fallback behavior when off: `E2EE_ENABLED`, `TYPESENSE_ENABLED`, `SMS_ENABLED`.

```bash
pnpm install                      # install all workspaces
docker compose up -d              # MongoDB, Redis, Typesense

pnpm dev                          # backend + frontend in parallel
pnpm dev:backend                  # backend only (tsx watch)
pnpm dev:frontend                 # frontend only (expo start)

pnpm test                         # both workspaces, with coverage
pnpm lint                         # both workspaces
pnpm typecheck                    # both workspaces
pnpm build                        # both workspaces
```

Per-workspace (needed for single-file/single-test runs):

```bash
pnpm --filter backend test                                              # vitest run --coverage
pnpm --filter backend exec vitest run src/modules/auth/auth.service.test.ts
pnpm --filter backend exec vitest run -t "test name substring"

pnpm --filter frontend test                                             # jest --coverage --forceExit
pnpm --filter frontend exec jest src/screens/ChatScreen.test.tsx
pnpm --filter frontend exec jest -t "test name substring"

pnpm --filter backend android      # n/a — mobile-only commands are frontend
pnpm --filter frontend android     # expo run:android
pnpm --filter frontend ios         # expo run:ios
```

## 14. Deployment

No production deployment pipeline exists yet — this is Phase 7 ("Scale & Release": store releases, production deploy, monitoring, backups) and is explicitly **Pending** in `.opencode/ROADMAP.md`. What's decided/planned per `.opencode/PROJECT_SPEC.md` §6:

- **CI** (implemented): `.github/workflows/ci.yml` — on every push to `main` and every PR: `pnpm -r lint` → `pnpm -r typecheck` → `pnpm -r test` (coverage-enforced) → `pnpm -r build`, plus a separate `docker compose config` validation job. This is a required gate, not advisory — a change isn't mergeable with a red CI run.
- **Backend hosting** (planned, not yet stood up): Docker images, AWS or DigitalOcean, Nginx in front, Sentry for error tracking.
- **Mobile release** (planned): EAS build/submit pipeline, OTA updates via Expo.
- **Push notifications**: Firebase Cloud Messaging (planned, Phase 2).

Until Phase 7 work starts, "deployment" in this repo means: CI green on `main`, Docker Compose for local/staging-like infra.

## 15. Logging & Error Handling

- **Backend logging**: `pino` (structured JSON) via `config/logger.ts`. Log request start/end (method, path, status, duration) at the HTTP layer; log business events with context (`userId`, `orderId`, entity ids) from services. **Never log** passwords, tokens, OTP codes, or payment data. Error logging happens once, in the centralized error handler — not in every `catch`.
- **Error handling**: `errors/AppError.ts` (statusCode, code, message, details, isOperational) thrown from services for expected failures; the single `middleware/errorHandler.ts` is the only place that formats an error response. Non-operational errors log with full context and return a generic `500` — never leak stack traces to the client. Async route handlers wrap with `asyncHandler` so a rejected promise reaches the error handler instead of hanging.

## 16. Git Workflow

- Small, focused commits with meaningful messages. One feature per branch/PR (`feature/`, `fix/`, `chore/` prefixes).
- CI (lint, typecheck, test) must pass before a PR is mergeable — a required status check, not just human review.
- `main` stays deployable at all times.
- Code review required before merge; see the code-review skill (§14) for the concrete checklist.
- **Current repo state**: single initial commit; `backend/` and `frontend/` (all application code) are untracked in git. Run `git status` before assuming anything here is actually persisted.

## 17. MCP Configuration

No MCP (Model Context Protocol) server configuration was found anywhere in this repository (`.opencode/opencode.json`, `.mcp.json`, or elsewhere) — there is nothing to migrate. If MCP servers are added later, they're configured per-project in `.mcp.json` at the repo root (not inside `.claude/`), independent of this migration.

## 18. Migrated Skills

Domain-specific how-to guides live in `.claude/skills/<name>/SKILL.md`, migrated from `.opencode/skills/`. Invoke with `/skill-name` or let Claude Code surface them contextually. See §14 of the migration summary for status per skill; in short:

- Matches the current stack, safe to follow as-is: `eaz-backend-architecture`, `eaz-api-patterns`, `eaz-authentication`, `eaz-testing`, `eaz-image-upload`, `eaz-code-review`.
- Describes the Marketplace domain (Phase 3, fully designed in `.opencode/DATABASE_DESIGN.md`, **not yet built**) — accurate as a forward design guide, not as a description of existing code: `eaz-product-catalog`, `eaz-inventory`, `eaz-order-management`, `eaz-paystack`.
- **Do not treat as accurate for this codebase without confirming scope first**: `eaz-web-frontend` (Next.js) and `eaz-admin-dashboard` assume a Next.js web client. This project is React Native/Expo mobile-only; a web app is explicitly hypothetical in `.opencode/PROJECT_SPEC.md` ("if this project ships a web app, add a Web Engineer role"). These two skills were carried over for when/if that's decided, not because a web app exists today.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
