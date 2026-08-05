# Security Checklist

Walked by the `security` agent on every review. Full context/rationale for each item is in `CLAUDE.md` §11 and `.opencode/ENGINEERING_RULES.md` §6 — this is the terse, actionable checkbox form.

- [ ] `authenticate` and `authorize` are separate middleware calls, never conflated
- [ ] Ownership checks happen in the service layer, not just the controller
- [ ] Every mutation endpoint has a Zod schema; unknown fields rejected
- [ ] Rate limiting present and tiered correctly (public / auth / OTP) — concrete numbers checked against `.opencode/ENGINEERING_RULES.md` §6, not just "some limiter exists"
- [ ] No secrets, tokens, passwords, OTP codes, or payment data in logs
- [ ] No secrets in client code or committed files; `.env` never touched
- [ ] Uploads validated by content-sniffing, not `Content-Type` header alone
- [ ] Webhook signatures verified before any business logic runs (once Paystack exists)
- [ ] Refresh token reuse triggers full family revocation, not just that token
- [ ] No `role` accepted from client payloads on signup/profile update
- [ ] E2EE boundary respected: no server-side code path reads private-chat plaintext
- [ ] Dependency audit clean (`npm audit`/Snyk) or flagged findings triaged
- [ ] Error responses never leak stack traces or internal identifiers

**Verdict is binding** (`docs/team/README.md`) — a failing item blocks merge until fixed and re-reviewed, not just noted.
