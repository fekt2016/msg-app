---
name: eaz-api-patterns
description: REST API conventions for Eaz Community — response envelope, URL/method/status-code conventions, validation, pagination, filtering, sorting, versioning, rate limiting. Use when designing or reviewing any backend endpoint.
---

# API Patterns

## Purpose

Standardize the REST API conventions used by every backend endpoint so clients (mobile, and any future web) can rely on consistent URLs, responses, errors, and query semantics.

## Scope

- REST conventions and URL structure
- Request validation
- Standard response and error formats
- Pagination, filtering, sorting
- Status codes, versioning, rate limiting

## Architecture Principles

1. **Consistency over cleverness**: every endpoint follows the same envelope, the same naming, and the same query semantics. Clients should never special-case an endpoint.
2. **RESTful by resource**: nouns, plural resources, nested only for true ownership (`/orders/:id/items`), actions expressed as resources (`/payments/initialize`) where verbs are unavoidable.
3. **Versioned from day one**: everything under `/api/v1`.
4. **Validate at the edge, respond uniformly**: all input validated by Zod middleware; all errors shaped by the central error handler (see `eaz-backend-architecture`).
5. **Idempotency where it matters**: writes that can be retried (payments, transitions) support an idempotency key or reference.

## Required Patterns

### Response Envelope

```ts
// Success
{ "success": true, "data": T, "meta": { page, pageSize, total, totalPages } }

// Error
{ "success": false, "error": { "code": "PRODUCT_NOT_FOUND", "message": "Product not found", "details": [] } }
```

- `data` carries the resource or list; `meta` carries pagination only on lists.
- Errors use machine-readable `code` strings (stable contract) + human `message`; `details` for field-level validation issues.
- Never leak stack traces or internal error text.

### URL & Method Conventions

- `GET /api/v1/products` — list (paginated, filterable)
- `POST /api/v1/products` — create → `201` + created resource
- `GET /api/v1/products/:id` — read
- `PATCH /api/v1/products/:id` — partial update
- `DELETE /api/v1/products/:id` — delete → `204` (or soft-delete per `CLAUDE.md` §9)
- Sub-resources only under a real parent (`/orders/:id/items`).
- Plural nouns; kebab-case URL segments; no trailing slashes.

### Status Codes

- `200` OK · `201` Created · `204` No Content
- `400` Bad Request (malformed) · `401` Unauthenticated · `403` Forbidden · `404` Not Found · `409` Conflict (state/idempotency) · `413` Payload Too Large · `415` Unsupported Media Type · `422` Validation Failed · `429` Rate Limited
- `500` unexpected — only for non-operational errors; never used for expected business failures.

### Request Validation

- Zod schema per route: `body`, `query`, `params`.
- `validate` middleware runs before the controller; failures → `422` with `details: [{ field, message }]`.
- Reject unknown fields by default (`.strict()`) unless forward-compat requires otherwise.
- Never trust types from JSON — everything arrives as strings and is cast by the schema.

### Pagination

- Query params: `page` (1-based, default 1), `pageSize` (default 20, max 100).
- Response: `meta: { page, pageSize, total, totalPages }`.
- For high-volume realtime feeds, allow cursor-based pagination (`cursor` + `limit`) — cursor is opaque and stable.
- Always tie a deterministic secondary sort (`_id`) to avoid duplicate/skipped rows across pages.

### Filtering & Sorting

- Filters as explicit query params (`categoryId`, `status`, `priceMin`, `priceMax`) — documented per endpoint, not a generic `filter=`.
- Only allow filtering on indexed fields.
- Sorting via `sort=field` and `sort=-field` (desc); whitelist allowed sort keys per endpoint.

### Versioning

- Path versioning `/api/v1/...`; a new breaking version increments the prefix (`/api/v2`) — never silently change field semantics.
- Deprecate old versions with a documented window; return a deprecation header/notice, not silent breakage.

### Rate Limiting

- Apply per-IP and per-user where applicable: public endpoints, auth (stricter), OTP, uploads — concrete tiers in `.opencode/ENGINEERING_RULES.md` §6.
- `429` responses include `Retry-After` header and a standard rate-limit error body.
- Redis-backed limiter so limits hold across instances.

## Best Practices

- One standard error handler; endpoints never format errors themselves.
- Timestamps in RFC 3339 / ISO-8601 UTC everywhere.
- Id fields: `id` in responses (map `_id`); never leak internal `__v`.
- Document endpoints with OpenAPI/Swagger.

## Performance Considerations

- Pagination prevents unbounded payloads; enforce max `pageSize` server-side regardless of client.
- Filter on indexed fields only; verify with `explain()` on hot queries.
- Cache list reads where data is infrequently written.
- Keep response bodies minimal — project to what the client renders.

## Security Considerations

- Never leak internal ids/stack traces in errors.
- Validate content-type and body size limits globally.
- Rate limit auth and payment endpoints aggressively.
- Input sanitization on all string fields; no raw HTML reflection.

## Anti-Patterns to Avoid

- Returning raw Mongoose documents (secrets, `__v`, internal fields).
- Generic `?filter={json}` — untyped, undocumented, injection-prone.
- Endpoint-specific error shapes — clients can't handle them uniformly.
- Unpaginated lists; returning `200` for business failures.

## Common Mistakes

- Inconsistent casing of response fields across endpoints.
- Using `400` for validation instead of `422`.
- Forgetting `Retry-After` on `429`.
- Off-by-one pagination or non-deterministic ordering across pages.

## Implementation Checklist

1. Before building any endpoint, define its Zod schemas, response DTO, and query params (pagination/filters/sort) per this skill.
2. Add the `validate` middleware to the route; keep the controller a thin HTTP mapper (`eaz-backend-architecture`).
3. Document the endpoint in OpenAPI and add tests per `eaz-testing`.
4. Rate-limit appropriately per endpoint tier and update `.opencode/TASKS.md`.
