---
model: anthropic/claude-sonnet-4-6
---

# Skill: Frontend Web Architecture (Next.js App Router)

## Purpose

Define the standard architecture for the Next.js web client(s) — primarily the Admin Dashboard and any seller-facing web flows. This skill teaches **how** to structure web UI consistently. Mobile (React Native) is the primary client; its patterns are documented separately in `PROJECT_SPEC.md` §11 and `AGENTS.md`.

## Scope

- Next.js App Router (TypeScript only)
- TanStack Query for server state
- React Hook Form + Zod for forms
- Role-gated pages (RBAC via API, enforced server-side)

## Architecture Principles

1. **Feature-based folders**: group files by feature, not by file type. Each feature owns its components, hooks, queries, and types.
2. **Server-first rendering**: render what can be static/server-rendered on the server; move to the client only what needs interactivity.
3. **Server state ≠ client state**: server data lives in TanStack Query; component state stays minimal and local.
4. **Data access stays in one place**: TanStack Query hooks are the only way components fetch data.
5. **Authorization is enforced server-side**: route protection and data gating happen in server components/middleware, never only in the client.

## Required Patterns

### Folder Organization (App Router)

```text
web/src/
├── app/
│   ├── (marketing)/          # Route group: public pages
│   │   └── page.tsx
│   ├── (dashboard)/          # Route group: authenticated shell
│   │   ├── layout.tsx        # Sidebar + header shell
│   │   ├── products/
│   │   │   ├── page.tsx      # List (server fetch + client filters)
│   │   │   └── [id]/page.tsx
│   │   └── orders/page.tsx
│   ├── api/                  # Next.js route handlers (BFF layer only)
│   └── layout.tsx            # Root layout (providers, fonts)
├── features/
│   ├── products/
│   │   ├── components/
│   │   ├── hooks/            # TanStack Query hooks
│   │   ├── api/              # fetch wrappers + types
│   │   └── schema.ts         # Zod schemas (shared with forms)
│   └── auth/
├── components/ui/            # Design-system primitives (Button, Table, Dialog)
├── lib/
│   ├── api-client.ts         # axios/fetch client, interceptors
│   ├── query-client.ts
│   └── auth.ts               # server-side session helpers
└── middleware.ts             # Route protection + redirects
```

### Route Groups & Layout Hierarchy

- Use route groups `(dashboard)` to build authenticated shells without polluting URLs.
- Nested layouts own their chrome: root layout (providers) → dashboard layout (nav) → page.
- `loading.tsx` and `error.tsx` at each segment that fetches data.
- Keep layouts server components; only the interactive parts become client components.

### Server vs Client Components

- **Server Components (default)**: static content, initial data fetch, SEO, layout chrome.
- **Client Components** (add `"use client"`): interactivity — filters, tables with sorting, forms, toasts.
- Pass serializable props down; fetch in server components and stream into client components where possible.
- Never put API keys or secrets in client components or `NEXT_PUBLIC_*` vars.

### TanStack Query

- One `QueryClient` instance in the root provider with sane defaults (staleTime, retry, refetchOnWindowFocus).
- Feature-scoped hooks: `useProducts({ page, sort, filters })`, `useProduct(id)`, `useCreateProduct()`.
- Mutations invalidate the exact affected queries (`invalidateQueries(['products'])`).
- Query keys are arrays with a feature prefix and all parameters (`['products', { page, filters }]`).
- Optimistic updates for fast-feeling UIs, always with rollback and error toast.

### Form Architecture

- `react-hook-form` for state + `zodResolver` for validation.
- Schema in `features/<name>/schema.ts` — single source of truth, reused for initial values and defaults.
- Field components accept `control`, `errors`, and `name`; no form logic inside presentational components.
- Submit → TanStack Query mutation → success/error toast → invalidate/redirect.
- Disable submit while pending; surface field errors inline.

### State Management Strategy

- **Server state**: TanStack Query only. Never mirror server data into context or stores.
- **Client state**: React state for ephemeral UI (open dialogs, active tabs).
- **Global client state**: use sparingly; only for cross-feature UI state (e.g., current seller context) via a small context. Do not install a global store unless a genuine need is proven.
- **URL is state**: filters, sort, and pagination live in the URL (searchParams) so they're shareable and back/forward-safe.

### API Integration

- `lib/api-client.ts` centralizes base URL, auth header, timeout, and response unwrapping.
- Route handlers (`app/api/`) are a thin BFF — proxy/auth only, no business logic.
- Every fetch uses TanStack Query; no ad-hoc `useEffect` + fetch.
- Handle the standard response envelope from the backend (see `ecommerce-api-patterns.md`).

### Loading States & Error Boundaries

- `loading.tsx` per segment with skeletons.
- `error.tsx` per segment as the nearest error boundary; show a recovery action.
- TanStack Query `isPending` / `isError` / `isSuccess` drive data states.
- Global error boundary at root; route-specific boundaries at feature level.
- Never render partial/undefined data — always branch on query state.

## Best Practices

- TypeScript strict mode; no `any`.
- Feature exports an index of hooks/components; pages import from the feature boundary, not deep paths.
- Reusable UI primitives live in `components/ui` and are used consistently across features.
- Add `aria-label`s, focus states, and keyboard support to every interactive component.
- Keep page components thin; most logic lives in feature hooks and components.

## Performance Considerations

- Prefer Server Components for the initial payload; load client JS only where needed.
- `dynamic` + `ssr: false` for heavy non-critical client widgets.
- Enable React Compiler/`memo` only where profiling shows a need — not preemptively.
- Virtualize long tables/lists; paginate everything.
- Image optimization via `next/image`; never raw `<img>` for product images.

## Security Considerations

- All authorization is enforced on the backend; the web client is never a security boundary.
- Session/auth via `lib/auth.ts` server helpers; protect pages in `middleware.ts` and in layouts.
- Validate any data echoed into the UI; escape user content.
- Keep admin-only pages inside a role-checked route group.

## Anti-Patterns to Avoid

- File-type folders (`components/`, `hooks/` at root) that scatter a feature across the tree.
- Putting all queries in one giant `hooks/useApi.ts`.
- Fetching in `useEffect` instead of TanStack Query.
- Duplicating server state into a global store.
- Building the whole dashboard as one client component.
- Storing secrets in client components.

## Common Mistakes

- Forgetting `"use client"` boundaries and breaking serialization.
- Not invalidating queries after mutations — stale lists.
- Losing URL filter state on navigation because it lives in component state.
- Mixing multiple fetch strategies (fetch/axios/swr/query) in one codebase.
- Wrapping the whole page in a client provider, defeating SSR.

## AI Implementation Instructions

1. Read the feature requirements in `PROJECT_SPEC.md` and the web-facing sections of `AGENTS.md`.
2. Identify the route group and feature folder; create the feature folder with schema, api wrappers, query hooks, and components.
3. Define the page as a Server Component that fetches initial data; add `loading.tsx` / `error.tsx`.
4. Add client components for interactivity (tables, filters, forms) using TanStack Query and React Hook Form.
5. Wire forms to mutations; invalidate affected queries.
6. Confirm role gating in middleware/layouts, then add tests per `ecommerce-testing.md`.
7. Update `TASKS.md` and documentation; do not mark complete until review is done.
