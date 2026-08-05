---
name: eaz-backend-architecture
description: Layered Express.js + TypeScript backend architecture for Eaz Community — Controller → Service → Repository → Model, folder organization, error handling, logging, validation flow. Use when adding or reviewing any backend module.
---

# Backend Architecture (Express.js + TypeScript)

## Purpose

Define the standard backend architecture for the Eaz Community platform so every API feature is implemented with the same layered structure. This skill teaches **how** to build backend code — the project rules for _what_ to build live in `CLAUDE.md` and `.opencode/PROJECT_SPEC.md`.

## Scope

- Express.js + TypeScript REST APIs under `/api/v1`
- MongoDB + Mongoose data access
- Socket.IO realtime services (signal transport only — no business logic)
- Background jobs via BullMQ

## Architecture Principles

1. **Strict layering**: Controller → Service → Repository → Model. Data flows one direction. Never skip a layer.
2. **Thin controllers**: controllers handle routing, HTTP concerns, request parsing, and response shaping only.
3. **Services hold business logic**: all business rules, orchestration, transactions, and side effects live in services.
4. **Repositories access data only**: repositories talk to MongoDB/Mongoose and return domain-shaped results. No business logic.
5. **Boundaries are explicit**: a service never imports a controller; a repository never imports a service; a model is only touched by its repository.
6. **Realtime is a transport**: socket handlers delegate to the same services used by REST controllers — never duplicate logic.
7. **Fail fast**: validate at the edge (routes), throw typed errors, and let the centralized error handler respond.

## Required Patterns

### Folder Organization (as implemented in `backend/src/`)

```text
backend/src/
├── index.ts                 # Bootstrap (config, DB connect, listen)
├── app.ts                   # Express app assembly (middleware, routers)
├── config/
│   ├── env.ts               # Validated env config (fail fast)
│   └── logger.ts            # pino logger instance
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── *.repository.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.validation.ts
│   │   └── *.model.ts
│   └── <feature>/           # same shape per module (users, communities, e2ee, search, ...)
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── validate.ts
│   └── errorHandler.ts
├── errors/
│   └── AppError.ts
├── utils/
│   ├── apiResponse.ts
│   └── asyncHandler.ts
└── realtime/
    ├── server.ts             # Socket.IO bootstrap
    ├── socketAuth.ts         # JWT handshake auth
    ├── adapter.ts            # Redis pub/sub adapter (+ in-memory fallback)
    └── presence.ts
```

One folder per feature module. Shared cross-cutting code (middleware, errors, utils) lives outside `modules/`.

### Controller → Service → Repository

```ts
// controller: thin, HTTP-only
async function createProduct(req: Request, res: Response) {
  const product = await productService.create(req.user.id, req.body);
  res.status(201).json(apiResponse.created(product));
}

// service: business logic
async function create(sellerId: string, input: CreateProductInput) {
  await authorizationService.assertCanSell(sellerId);
  await validateUniqueSlug(input.slug);
  return productRepository.create({ ...input, sellerId });
}

// repository: data access only
async function create(data: ProductDoc) {
  return ProductModel.create(data);
}
```

### Error Handling

- `AppError` (`backend/src/errors/AppError.ts`) carries `statusCode`, `code`, `message`, `details`, `isOperational`.
- Throw `AppError` from services for expected failures.
- One centralized `errorHandler` middleware, last in the chain: maps `AppError` to the standard response envelope, logs unexpected errors, returns `500` for anything not operational.
- Wrap async handlers with `asyncHandler` so rejected promises reach the error handler.
- Never `try/catch` and swallow errors in services; let them propagate.
- Validation errors return `422` with a `details` array of field issues.

### Logging

- `pino` structured JSON logs (`config/logger.ts`).
- Log request start/end (method, path, status, duration, request id) at the HTTP layer.
- Log business events with context (userId, orderId, entityId) from services.
- Never log passwords, tokens, OTP codes, or payment data.
- Error logging happens once, in the error handler — not in every `catch`.

### Validation Flow

1. Route defines a Zod schema (`*.validation.ts`) for the request.
2. `validate` middleware parses body/query/params against the schema.
3. On failure, respond `422` with the standard error envelope.
4. Services accept already-validated, typed inputs — never re-validate business-level invariants as HTTP concerns.

## Best Practices

- Export one `router` per module; mount under `/api/v1/<resource>` in `app.ts`.
- Use `req.user.id` populated by `authenticate` middleware — never trust client-supplied ids.
- Every query that is filtered/sorted/selected must be paginated.
- Use Mongoose `lean()` for read-only queries and `populate` sparingly (or aggregate).
- Database access in services goes through repositories so queries are testable in isolation.
- Use BullMQ for anything slow or retryable (email, media processing, notifications). Never `await` long tasks in request handlers.

## Performance Considerations

- Index every field used in `filter`, `sort`, or `$match` — see the `eaz-api-patterns` skill and `CLAUDE.md` §12.
- Never `find()` a whole collection — always `limit()` and project fields.
- Cache hot read paths (product detail, catalog lists) in Redis; invalidate on write.
- Batch DB writes where possible and use `bulkWrite` for inventory/stock operations.
- Add `maxTimeMS` on complex aggregations and monitor slow queries.

## Security Considerations

- Authenticate before authorizing; both are separate middlewares.
- Authorize per-action (seller, buyer, admin) using RBAC helpers — see `eaz-authentication`.
- Sanitize all user input; never interpolate input into queries.
- Rate-limit public and auth endpoints separately — see `eaz-api-patterns`.
- Validate ownership before read/write on any resource.
- Apply security headers via `helmet` and explicit CORS in `app.ts`.

## Anti-Patterns to Avoid

- Business logic in controllers or route handlers.
- Mongoose calls spread across controllers and services (no repository).
- Swallowing errors (`catch {}`) or logging in every layer.
- Putting HTTP concerns (status codes, response envelopes) inside services.
- Duplicating socket logic — sockets must call services.

## Common Mistakes

- Returning the full Mongoose document (including `__v`, hashed secrets) to the client.
- Forgetting `lean()` and bloating memory on read paths.
- Trusting `req.body` ids instead of `req.user` / URL params.
- Not paginating list endpoints from day one.

## Implementation Checklist

1. Read `CLAUDE.md` and `.opencode/PROJECT_SPEC.md` for the feature requirements.
2. Create the full module folder (model, repository, service, controller, routes, validation) even if the feature starts small.
3. Write the Zod validation first, then the repository, then the service, then the controller.
4. Wire the routes into `app.ts` under `/api/v1` with the appropriate middleware.
5. Add tests per `eaz-testing`, then update `.opencode/TASKS.md`.
6. Don't mark the feature complete until validation, error handling, tests, docs, and review are all done (`CLAUDE.md` §7).
