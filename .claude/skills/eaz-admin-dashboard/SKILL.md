---
name: eaz-admin-dashboard
description: 'SPECULATIVE — admin web dashboard architecture (pages, tables, analytics, RBAC, audit logs) for Phase 6, which also depends on the undecided web-client question. No admin dashboard exists yet. Only use this if the user has explicitly started Phase 6 admin work.'
---

# Admin Dashboard

> ⚠️ **Two open dependencies before this applies**: (1) it assumes the `eaz-web-frontend` Next.js client exists, which itself is an undecided, hypothetical piece (see that skill's warning); (2) Admin/Platform is Phase 6 in `.opencode/ROADMAP.md`, well behind current work (Phase 1–2). Don't reach for this unless the user has explicitly started Phase 6 admin-dashboard work and confirmed the web-client decision.

## Purpose

Standardize how an admin web dashboard would be built — pages, data tables, analytics, permissions, and audit — so all admin surfaces follow the same patterns.

## Scope

- Dashboard architecture (Next.js App Router — see `eaz-web-frontend`)
- Analytics and reporting
- CRUD screens, tables, filters, bulk actions
- Permissions (RBAC)
- Settings and activity logs

## Architecture Principles

1. **Admin is a separate role-gated experience**: its own route group `(dashboard)` with an admin-only layout; authorization enforced server-side (see `eaz-authentication`).
2. **Server components fetch, client components interact**: initial data in Server Components; tables/filters/actions as Client Components using TanStack Query.
3. **Every action is auditable**: mutations log an activity event (actor, action, target, before/after, timestamp) — see `.opencode/DATABASE_DESIGN.md` §4.16 `activity_logs`.
4. **CRUD is data-driven**: one reusable table component consumes a typed column definition; features don't re-implement tables.
5. **Admin API is a first-class module**: admin-only endpoints under `/api/v1/admin/*` with RBAC middleware; never reuse buyer endpoints with elevated context.

## Required Patterns

### Folder Organization

```text
web/src/
├── app/(dashboard)/
│   ├── layout.tsx            # Admin shell (sidebar, header, guards)
│   ├── page.tsx               # Overview: KPIs + charts
│   ├── products/, orders/, users/, analytics/, settings/
└── features/
    ├── admin-table/           # Reusable DataTable + filters + bulk bar
    ├── analytics/             # Charts, KPI cards, report hooks
    └── <domain>/               # product/order/user admin features
```

### Analytics

- KPI cards (revenue, orders, GMV, active users) from aggregated endpoints (`/api/v1/admin/analytics/*`).
- Prefer server-side aggregations (MongoDB aggregation) over client-side math on raw rows.
- Date-range filters apply server-side; cacheable ranges (today, 7d, 30d) get Redis caching.

### CRUD Screens & Tables

- One `DataTable` primitive: column defs, sorting, pagination, row selection, empty/loading/error states.
- Filters bind to the URL (`searchParams`).
- Create/edit/delete go through TanStack Query mutations and invalidate the affected list queries.

### Bulk Actions

- Row selection feeds a bulk bar; bulk actions call dedicated endpoints (`POST /api/v1/admin/products/bulk-archive`) with an array of ids — one request, one response summarizing per-id results.
- Confirm destructive bulk actions; report failures per item.

### Permissions

- Roles: `ADMIN` and `SUPER_ADMIN` (admin management only). Role checks in both middleware and UI.
- Sensitive actions (role changes, refunds, deletions) require `SUPER_ADMIN` and generate an audit event.

### Settings & Activity Logs

- System settings stored in `system_settings` (`.opencode/DATABASE_DESIGN.md` §4.17), validated on write with Zod, cached in Redis, invalidated on update.
- `ActivityLog { actor, action, targetType, targetId, before?, after?, ip?, at }` written by the admin service layer for every meaningful mutation.

## Best Practices

- Every admin endpoint validates query params per `eaz-api-patterns`.
- Keep table fetches paginated; default page size 20, max 100.
- Charts degrade gracefully to empty/error states.

## Performance Considerations

- Aggregations are heavier: limit ranges, index the aggregate fields, and cache.
- Don't fetch full documents for tables — project minimal columns.
- Debounce search inputs; virtualize long tables.

## Security Considerations

- All admin routes require `authorize('ADMIN')` server-side; `middleware.ts` guards page navigation, but data endpoints remain the real boundary.
- Never expose audit logs with sensitive `before/after` values to non-admin roles.
- Rate-limit admin auth and log all admin auth failures.

## Anti-Patterns to Avoid

- Copy-pasting table implementations per screen.
- Admin logic living in buyer endpoints.
- Client-side role gating as the only security layer.
- Settings/audit writes that skip the service layer.

## Common Mistakes

- Missing pagination on analytics/activity endpoints.
- Forgetting to invalidate list queries after a mutation.
- Exposing `before/after` secrets in audit logs.
- Not confirming destructive bulk actions.

## Implementation Checklist

1. Confirm both open dependencies above are actually resolved before starting.
2. Read admin requirements in `.opencode/PROJECT_SPEC.md` Phase 6 and reuse the platform patterns in `eaz-web-frontend`.
3. Build the admin API module per `eaz-backend-architecture` under `/api/v1/admin/*` with RBAC + activity logging.
4. Build the reusable DataTable, filter bar, and bulk-action primitives once; then compose feature screens.
5. Add tests for permissions, audit logging, and table/query behavior — see `eaz-testing`.
