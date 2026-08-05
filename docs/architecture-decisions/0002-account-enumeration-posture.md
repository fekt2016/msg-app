# ADR 0002: Account-existence disclosure is permitted only at registration, never as an incidental side channel

**Status**: Accepted
**Date**: 2026-08-04
**Deciding agent**: architect
**Affected agents**: backend (implements the `resendOtp` change + co-located test), testing (owns coverage sign-off on the changed cases), security (raised the finding; must record the new posture), project-manager (task tracking)

## Context

The `security` agent flagged an inconsistent account-enumeration posture across the auth
surface and escalated it as a real, non-blocking finding. Verified in-repo against
`backend/src/modules/auth/auth.service.ts` and `backend/src/app.ts` (not assumed from docs):

- `POST /auth/register` (`assertIdentifierAvailable`, service L65-68; flow L92-106) throws
  `409 IDENTIFIER_TAKEN` when the identifier already exists. This discloses plain account
  existence.
- `POST /auth/resend-otp` (service L108-120) throws `409 ALREADY_VERIFIED` when a `VERIFY`
  resend is requested for an existing, verified account; non-existent and unverified
  identifiers instead fall through to `sendOtp` and return `200 {sent:true}`. The response
  therefore distinguishes "a verified account exists for this identifier" from every other
  case — it discloses both existence and verification status.
- `POST /auth/login` (service L167-186) returns a generic `401 INVALID_CREDENTIALS` for both
  unknown identifiers and wrong passwords. The `403 ACCOUNT_NOT_VERIFIED` branch only fires
  after a correct password comparison, so it is not reachable by an attacker who does not
  already hold the password — login is correctly non-enumerating for the unauthenticated
  caller.

Both OTP-issuing endpoints are rate-limited: the OTP limiter (`OTP_RATE_LIMIT_MAX=3` per
`OTP_RATE_LIMIT_WINDOW_MS=3600000`, i.e. 3/hour/IP) is wired onto `/auth/register` and
`/auth/resend-otp` in `app.ts` L43-56, on top of the `/auth`-wide auth limiter (20/15min).

The question is whether account existence/verification-status should be treated as a secret
across this whole surface, or whether disclosure is an accepted product tradeoff.

Two positions were weighed:

- **Treat existence as a secret everywhere** (implied by `security`'s "inconsistent posture"
  framing): move both `/register` and `/resend-otp` to neutral response shapes so no endpoint
  reveals whether an account exists. Maximally conservative; removes every enumeration oracle.
- **Existence disclosure is an accepted tradeoff at registration** (the counter-argument in
  the escalation): a user completing a signup form has a genuine, immediate need to be told
  their email/phone is already taken. Hiding that forces a heavier "we emailed the existing
  account" flow that this OTP-to-identifier product does not otherwise need, for a threat
  that is already rate-limited. Every mainstream signup form discloses this.

Neither position is uniformly right, because the two endpoints do not have the same product
justification for disclosure. The correct axis is not "secret vs. not secret" globally — it
is _whether the user is actively asserting ownership of a new identifier at that endpoint._

## Decision

Account existence and verification status are, for this project, disclosable **only at the
synchronous point where a user asserts ownership of a new identifier — i.e. registration.**
Everywhere else on the auth surface they are a secret, and no endpoint may expose them as an
incidental side channel.

Concretely, the binding rules going forward:

1. **`POST /auth/register` — KEEP disclosing.** Returning `409 IDENTIFIER_TAKEN` for an
   existing identifier is the sanctioned behavior, not a defect. It has a real, offsetting
   UX benefit (immediate "already taken" feedback during signup), it is the industry-standard
   tradeoff, and it is bounded by the 3/hour/IP OTP limiter. No code change. New auth endpoints
   that create a fresh account MAY disclose existence for the same reason; nothing else may.

2. **`POST /auth/resend-otp` — STOP disclosing.** This endpoint is a follow-up action, not an
   identity claim, so its verification-status leak buys zero UX benefit and is pure side
   channel. When a `VERIFY` resend is requested for an already-verified account, the service
   must **silently no-op** — do not send an OTP, do not create an OTP record — and return the
   **same `200 {sent:true}`** shape as a normal resend. The existing guard's real purpose
   (never re-issue `VERIFY` sends to an already-verified account) is fully preserved; only the
   observable `409 ALREADY_VERIFIED` signal is removed. A legitimately unverified user still
   receives their code; a verified user does not need an error, they can just log in.

3. **`POST /auth/login` — KEEP non-enumerating.** Generic `401 INVALID_CREDENTIALS` regardless
   of whether the account exists. A login attempt has no UX reason to reveal existence. Do not
   "fix" this to be more informative.

Rule of thumb for future auth work, greppable: _disclose existence only when the caller is
claiming a new identifier; never as a by-product of any other operation._

## Consequences

- The auth surface becomes coherent under one stated principle rather than three ad-hoc
  behaviors, so future endpoints have a rule to follow instead of a precedent to copy blindly.
- `/resend-otp` no longer answers "does a verified account exist here?" — response-level
  enumeration on that endpoint is closed; all of {non-existent, unverified, verified} now
  return an identical `200 {sent:true}`.
- **Residual, accepted, not mitigated now:** after the change the verified-account path returns
  early (no DB write, no provider send) while the other paths do a create + send, leaving a
  timing difference. This is a far weaker oracle than an explicit `409`, sits behind the
  3/hour/IP limiter, and mitigating it (e.g. dummy work) is over-engineering for the current
  threat model (`CLAUDE.md` §4 — don't build for scale/threat that isn't here yet). Recorded
  so it is a known, deliberate residual rather than an oversight; revisit only if abuse data
  says so.
- Registration remains a deliberate, documented enumeration point. Security reviews should
  treat `IDENTIFIER_TAKEN` as expected and not re-flag it; the mitigation of record is the
  rate limiter, which must stay in place.
- This does not touch any **Decided** item in `PROJECT_SPEC.md` §15/§20 (E2EE, OTP provider,
  offline DB, soft-delete) and does not touch the E2EE plaintext invariant, so no user
  escalation is required.

## Alternatives considered

- **Neutralize `/register` too** (full "existence is always secret"): rejected. It removes a
  real UX affordance that a signup form legitimately needs and would force a heavier
  out-of-band notification flow this product doesn't otherwise require, to close an oracle
  that is already rate-limited. The registration endpoint is exactly the one place where the
  user is asserting ownership of the identifier, so disclosure there is defensible in a way it
  is nowhere else.
- **Leave `/resend-otp` as-is** ("it's all an accepted tradeoff"): rejected. Unlike register,
  resend has no offsetting UX benefit from the leak — it is a side channel with nothing on the
  other side of the scale. "Both are already rate-limited" argues for tolerating register's
  necessary leak; it does not justify keeping a gratuitous one.
- **Return a distinct non-error code for the verified case** (e.g. `200 {sent:false}`):
  rejected. Any response field that varies with verification status re-opens the exact oracle
  we are closing. The response must be byte-identical to the normal resend.
