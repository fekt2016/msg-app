---
name: eaz-web-frontend
description: 'SPECULATIVE — Next.js App Router architecture for a possible future web client (admin dashboard / seller tools). This project is currently React Native/Expo mobile-only; no web app exists. Only use this if the user has explicitly decided to build one.'
---

# Frontend Web Architecture (Next.js App Router)

> ⚠️ **Do not apply this skill by default.** Eaz Community is a mobile-first app; the actual, existing frontend is React Native + Expo (`frontend/`, see `CLAUDE.md` §3 and §5). There is **no Next.js project anywhere in this repository**. `.opencode/PROJECT_SPEC.md` treats a web client as hypothetical: _"if this project ships a web app, add a Web Engineer role scoped identically to Mobile Engineer but for the web stack — don't let Mobile Engineer absorb it by default."_ That decision has not been made.
>
> This skill was carried over from the original OpenCode setup for the day a web admin dashboard (`eaz-admin-dashboard`) is actually greenlit. If you were about to use it because a task mentions "the frontend" or "the UI," stop and check whether that means the mobile app (almost certainly yes) before reaching for anything below.

## Purpose

Define the standard architecture for a Next.js web client — primarily an Admin Dashboard and any seller-facing web flows, if and when one is built. Mobile (React Native) is the primary client; its actual patterns are documented in `CLAUDE.md` §5.

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
│   ├── (dashboard)/          # Route group: authenticated shell
│   │   ├── layout.tsx        # Sidebar + header shell
│   │   ├── products/{page.tsx, [id]/page.tsx}
│   │   └── orders/page.tsx
│   ├── api/                  # Next.js route handlers (BFF layer only)
│   └── layout.tsx            # Root layout (providers, fonts)
├── features/
│   ├── products/{components/, hooks/, api/, schema.ts}
│   └── auth/
├── components/ui/            # Design-system primitives
├── lib/{api-client.ts, query-client.ts, auth.ts}
└── middleware.ts             # Route protection + redirects
```

### Route Groups & Layout Hierarchy

- Use route groups `(dashboard)` to build authenticated shells without polluting URLs.
- Nested layouts own their chrome: root layout (providers) → dashboard layout (nav) → page.
- `loading.tsx` and `error.tsx` at each segment that fetches data.

### Server vs Client Components

- **Server Components (default)**: static content, initial data fetch, SEO, layout chrome.
- **Client Components** (`"use client"`): interactivity — filters, tables with sorting, forms, toasts.
- Never put API keys or secrets in client components or `NEXT_PUBLIC_*` vars.

### TanStack Query

- One `QueryClient` instance in the root provider with sane defaults.
- Feature-scoped hooks: `useProducts({ page, sort, filters })`, `useProduct(id)`, `useCreateProduct()`.
- Mutations invalidate the exact affected queries (`invalidateQueries(['products'])`).
- Query keys are arrays with a feature prefix and all parameters.

### Form Architecture

- `react-hook-form` for state + `zodResolver` for validation.
- Schema in `features/<name>/schema.ts` — single source of truth.
- Submit → TanStack Query mutation → success/error toast → invalidate/redirect.

### State Management Strategy

- **Server state**: TanStack Query only. **Client state**: React state for ephemeral UI.
- **Global client state**: sparingly, only for genuine cross-feature UI state.
- **URL is state**: filters, sort, and pagination live in `searchParams`.

### API Integration

- `lib/api-client.ts` centralizes base URL, auth header, timeout, response unwrapping.
- Handle the standard response envelope from the backend — see `eaz-api-patterns` (this is shared with mobile; the backend contract doesn't change per client).

## Best Practices

- TypeScript strict mode; no `any`.
- Reusable UI primitives live in `components/ui`.
- Add `aria-label`s, focus states, and keyboard support to every interactive component.

## Performance Considerations

- Prefer Server Components for the initial payload.
- Virtualize long tables/lists; paginate everything.
- `next/image` for product/media images; never raw `<img>`.

## Security Considerations

- All authorization is enforced on the backend; the web client is never a security boundary.
- Validate any data echoed into the UI; escape user content.

## Anti-Patterns to Avoid

- File-type folders (`components/`, `hooks/` at root) that scatter a feature across the tree.
- Fetching in `useEffect` instead of TanStack Query.
- Storing secrets in client components.

## Implementation Checklist

1. **First**, confirm with the user/architect that a web client has actually been decided — this is not implied by any request to work on "the app" or "the frontend."
2. Read `.opencode/PROJECT_SPEC.md` for what triggers a Web Engineer scope.
3. If confirmed: identify the route group and feature folder; define the page as a Server Component fetching initial data.
4. Reuse the same backend contract as mobile (`eaz-api-patterns`) — don't invent a parallel API shape.
