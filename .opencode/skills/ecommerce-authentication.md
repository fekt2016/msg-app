---
model: anthropic/claude-sonnet-4-6
---

# Skill: Authentication (JWT + Refresh Tokens + RBAC)

## Purpose

Standardize how every user authenticates and how every endpoint enforces identity and permissions. Applies to the backend (Express) and the clients (React Native and web) so auth behaves identically everywhere.

## Scope

- Registration and login flows
- Access tokens (short-lived JWT) + refresh tokens (long-lived, rotating)
- Role-based access control (RBAC)
- Token storage and refresh on both clients
- Password hashing and security hardening

## Architecture Principles

1. **Access tokens are short-lived**: default 15 minutes. Never validate a session on every request by hitting the database with an access token.
2. **Refresh tokens rotate**: each refresh issues a new refresh token and invalidates the old one. Detect reuse (replay of a rotated token) and revoke the whole token family.
3. **Auth is a middleware chain**: `authenticate` (who you are) then `authorize` (what you may do). Never conflate the two.
4. **Secrets never leave the server**: access tokens are signed by the server; refresh tokens may be stored server-side for revocation, but only hashed.
5. **Multi-device by design**: refresh tokens are per-device (device id in the token), so logging out one device doesn't kill the rest.

## Required Patterns

### Tokens

- Access token payload: `{ sub: userId, role, deviceId }` — no PII beyond identity. Expiry from env (`JWT_ACCESS_EXPIRES_IN`).
- Refresh token payload: `{ sub: userId, deviceId, jti }` — `jti` uniquely identifies the token family/session.
- Sign with separate secrets: `JWT_SECRET` and `JWT_REFRESH_SECRET` (see `.env.example`).
- Keep algorithms explicit (`HS256`) and never accept `alg: none`.

### Password Hashing

- Use `bcrypt` (or argon2) with a cost factor ≥ 10.
- Never store or log plaintext passwords; hash before persist, verify on login with constant-time comparison.
- Apply password policy (min length) at the Zod validation layer — see `ecommerce-api-patterns.md`.
- Optionally hash refresh tokens (`sha256`) before storing server-side for revocation lists.

### Authentication Middleware (backend)

```ts
// authenticate: parse Bearer token, verify signature + expiry, load minimal user
const user = await verifyAccessToken(token);
req.user = { id: user.sub, role: user.role, deviceId: user.deviceId };
```

- Reject missing/malformed/expired tokens with `401`.
- Never `findById` the full user per request; the token carries role claims. If a role may have changed, short TTL bounds staleness.

### Authorization Middleware (RBAC)

- Define roles centrally (e.g., `USER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`).
- `authorize('ADMIN')` checks `req.user.role` against allowed roles → `403` otherwise.
- Resource-level checks (e.g., "seller may edit only own products") happen in services via ownership checks, not in middleware.
- Store role as an enum in the User model; never accept role in a signup payload.

### Login Flow

1. Client sends `email`/`phone` + password.
2. Service verifies credentials; rate-limit failures.
3. On success, issue access token + refresh token.
4. Return access token in body; deliver refresh token via `httpOnly`, `secure`, `sameSite=lax` cookie (web) or secure storage (mobile) — see Secure Storage.
5. Return the user object (minus secrets) alongside tokens.

### Registration Flow

1. Validate payload (email/phone, password, display name) via Zod.
2. Check uniqueness (email/phone); hash password.
3. Require verification: send OTP (see `PROJECT_SPEC.md` §15 provider decision) and mark account `unverified`.
4. On OTP verify, mark `verified` and issue tokens (or send them at first login — keep consistent).

### Token Refresh Flow

- `POST /api/v1/auth/refresh` with the refresh token.
- Service verifies signature/expiry, checks the token family server-side, rotates (new access + new refresh, new `jti`), revokes old `jti`.
- On reuse of an already-rotated token: revoke the entire family and force re-login.
- `POST /api/v1/auth/logout` revokes the current refresh token family.

### Protected Routes & Session Handling (clients)

- Mobile: store access token in secure storage (`expo-secure-store`); refresh token too, or use a cookie if the server supports it. Never AsyncStorage for tokens.
- Web: `httpOnly` cookie preferred for refresh; access token in memory + request interceptor.
- The API client (axios/fetch) attaches the access token and, on `401`, attempts a single silent refresh, then replays the original request; if refresh fails, redirect to login.
- On login/logout, invalidate all TanStack Query caches — see `ecommerce-nextjs-architecture.md`.

## Best Practices

- Rate-limit login and OTP endpoints aggressively (e.g., 5 attempts / 15 min / user, 3 OTP / hour / number) — see `ENGINEERING_RULES.md` §6.
- Return generic errors for "bad credentials" (no user enumeration).
- Log auth events (login success/failure, refresh, logout) with device id; never log tokens.
- Add `iss`/`aud` claims if the token is ever consumed outside one API.
- All auth routes live under `/api/v1/auth`.

## Performance Considerations

- Verify JWT signature with no DB hit; cache role lookups if roles are ever dynamic.
- Keep refresh token revocation lookups indexed by `jti`.
- Store only what's needed in the token — oversized tokens slow every request.

## Security Considerations

- Use `httpOnly` + `secure` + `sameSite` cookies where possible to blunt XSS token theft.
- Set short access TTL; rotate refresh tokens; revoke families on reuse.
- Protect OTP flows with rate limiting, expiry, and single-use.
- HTTPS in production; never send tokens over plaintext.
- Enforce password strength and account lockout on repeated failures.
- Audit with `AGENTS.md` Security Engineer before merging auth changes.

## Anti-Patterns to Avoid

- Long-lived access tokens (e.g., 30 days) to "avoid refresh".
- Storing refresh tokens in localStorage/AsyncStorage (XSS-readable).
- Putting the whole user document in the JWT.
- Per-request DB user lookup with the access token.
- Accepting `role` from the client during signup or profile update.
- Validating tokens with `jsonwebtoken.verify` without checking `algorithms` and `issuer/audience`.

## Common Mistakes

- Silent token refresh loops (multiple parallel 401s each firing a refresh).
- Refresh token not bound to a device → cannot log out a single device.
- Not hashing stored refresh tokens.
- Throwing `401` when the resource genuinely needs `403`.
- Failing to invalidate client caches after logout, leaking data across sessions.

## AI Implementation Instructions

1. Follow the auth feature spec in `PROJECT_SPEC.md` and the OTP provider decision before writing code.
2. Build the auth module: model, repository, service (register, login, refresh, logout, verify OTP), controllers, and routes per `ecommerce-backend-architecture.md`.
3. Implement `authenticate` and `authorize` middleware; wire them into every protected route.
4. Implement the client session layer (secure storage, silent refresh interceptor) on mobile and web.
5. Add tests for the full lifecycle — see `ecommerce-testing.md`.
6. Have the Security Engineer (per `AGENTS.md`) review before the feature is marked complete.
