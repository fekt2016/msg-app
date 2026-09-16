# TASK.md — Eaz Community: Remaining Work

Audit date: 2026-09-16
Branch: `fix/e2ee-key-directory-reconciliation` (current)

This document tracks **everything left to do** to ship the app. Items are
grouped by phase and priority. A checkbox `[x]` means fully done (all DoD
layers). `[ ]` means not yet started or in progress.

---

## Summary: Where We Stand

| Phase                      | Status                                    |
| -------------------------- | ----------------------------------------- |
| 0 — Foundation             | ✅ Done                                   |
| 1 — Core Messaging         | ✅ Core done; 2 E2EE follow-ups open      |
| 2 — Community Features     | ✅ Done except push + notification center |
| 3 — Marketplace & Payments | ❌ Not started (design exists)            |
| 4 — Realtime Calls         | ❌ Not started                            |
| 5 — Intelligence           | ❌ Not started                            |
| 6 — Platform & Admin       | ❌ Not started                            |
| 7 — Scale & Release        | ❌ Not started                            |

---

## 1. IN-FLIGHT: Unmerged Work (must complete before anything else)

These are on branches or uncommitted. They block DoD and must be
merged first.

### 1.1 Push Notifications — `feature/push-notifications`

Backend + mobile fully implemented (32 files, 1421 insertions). Needs:

- [ ] **Security review** — push module audit (controller auth-owner-wins, token privacy, offline-gating, best-effort swallow, deep-link payload, lazy builder)
- [ ] **Code review** — layered architecture, Zod validation, error handling, test coverage
- [ ] **Merge to main**
- [ ] **Update TASKS.md** — check the `[ ] Push notifications` box

### 1.2 E2EE Key Directory Reconciliation — `fix/e2ee-key-directory-reconciliation` (current branch)

Uncommitted changes (12 modified files, 6 new files):

- [ ] **Commit the key-directory reconciliation work** — `ensureKeys.ts` now reconciles with server directory on every call (detects stale/absent bundle); `recoveryPrompt.ts` + `RecoveryBanner.tsx` surface backup/restore nudge after key bootstrap; `ChatScreen.tsx` logs decrypt failures; testIDs added for Detox
- [ ] **Run full test suite** — verify all existing tests still pass with the new `{ created: boolean }` return from `ensureE2eeKeysRegistered`
- [ ] **Security review** — reconcile path only touches public key; no private material leaves device
- [ ] **Code review**
- [ ] **Merge to main**

### 1.3 Detox E2E Setup (uncommitted)

- [ ] `.detoxrc.js` + `e2e/starter.test.ts` + `e2e/jest.config.js` — Detox scaffold exists but no real E2E tests beyond the smoke test
- [ ] Decide: is Detox E2E in scope for Phase 1/2, or defer to Phase 7?

---

## 2. PHASE 1 — Core Messaging: Open Items

### 2.1 E2EE: Forward Secrecy (X3DH + Double Ratchet)

- [ ] **1:1 forward secrecy** — X3DH key agreement + Double-Ratchet, peer identity authentication/TOFU. Pre-keys/OTKs are uploaded but unused; current encryption has no forward secrecy and no MITM resistance on the agreement key. See `docs/architecture-decisions/0001-e2ee-signing-key-split.md`.
- [ ] **Peer identity authentication (TOFU)** — trust-on-first-use model for peer public keys
- [ ] **Recovery key scope revisit** — recovery key currently backs up the identity bundle only; with forward secrecy, restoring should NOT recover historical messages (by design)

### 2.2 On-Device Identity Persistence Across Account Switches

- [ ] **Design decision** — multi-account-on-one-device? (WhatsApp-style single-identity-per-device vs. multi-identity). If multi-account, key the keystore by `userId`.
- [ ] **Implement multi-identity keystore** (if in scope) — multiple private bundles at rest, switch restores prior identity instead of regenerating
- [ ] **Reconcile with `restoreE2eeKeys`** and recovery-key restore flows
- [ ] **Security review**

### 2.3 Group Chat Residuals (not blocking, tracked)

- [ ] **Group read/delivered receipts UI** — relayed but not rendered in GroupChatScreen (per-recipient aggregation deferred)
- [ ] **Sender-key rotation on member-leave** — best-effort client-side; revisit with X3DH

---

## 3. PHASE 2 — Community Features: Open Items

### 3.1 In-App Notification Center

- [ ] `feature/in-app-notification-center` branch exists but is **empty** (no commits on top of main)
- [ ] **Backend:** `notifications` collection (designed in DATABASE_DESIGN.md §4.15) — model, repository, service, controller, routes, validation
- [ ] **BullMQ worker** — queue notification writes; delivery channel routing (push/in-app/email)
- [ ] **Mobile:** NotificationScreen (list, read/unread, mark-all-read, pagination)
- [ ] **Realtime:** `notification:new` event via Socket.IO for live badge count
- [ ] **Tests, security review, code review, merge**

### 3.2 Stories Residuals

- [ ] Instagram-style `StoriesScreen`/`StoryViewerScreen` are unreferenced from navigation after Home redesign — **delete or wire** author-avatar → per-author viewer
- [ ] Per-user story privacy setting (Phase 6 per-product decision, documented)

---

## 4. PHASE 3 — Marketplace & Payments (entirely new)

Database design exists in `.opencode/DATABASE_DESIGN.md`. Skills exist
in `.claude/skills/eaz-product-catalog`, `eaz-inventory`,
`eaz-order-management`, `eaz-paystack`. Nothing is built.

### 4.1 Product Catalog

- [ ] **Backend:** `modules/products/` — product, category, brand models; CRUD with validation
- [ ] **Seller profiles** — `seller_profiles` collection, business identity, slug generation
- [ ] **Product images** — media upload to Cloudinary (`eaz-community/products`)
- [ ] **Categories** — hierarchical taxonomy (parentId self-reference)
- [ ] **Brands** — simple entity with slug
- [ ] **Search indexing** — Typesense `products` collection, `?q=` search on catalog
- [ ] **Mobile:** product browsing screens, detail screen, image galleries
- [ ] **Tests, Swagger, security review, merge**

### 4.2 Inventory Management

- [ ] **Backend:** `modules/inventory/` — `inventory_stock_items` + `inventory_transactions` (append-only ledger)
- [ ] **Atomic operations:** reserve/release/decrement via `findOneAndUpdate` with guard filters
- [ ] **Low-stock alerts** — `reorderPoint` threshold scan
- [ ] **Tests, merge**

### 4.3 Orders & Cart

- [ ] **Backend:** `modules/orders/` — `carts`, `orders`, `order_events` collections
- [ ] **Cart:** one active cart per user, add/update/remove items, abandoned-cart TTL
- [ ] **Order lifecycle:** state machine (PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED), `version`-guarded transitions
- [ ] **Order number generation** (EAZ-XXXXXX)
- [ ] **Order events** — append-only audit trail
- [ ] **Mobile:** cart screen, checkout flow, order history, order detail
- [ ] **Tests, merge**

### 4.4 Payments (Paystack)

- [ ] **Backend:** `modules/payments/` — `payments`, `refunds` collections
- [ ] **Paystack integration:** initialize transaction, verify, webhook handler
- [ ] **Idempotent webhooks** — `reference`-keyed; signature verification
- [ ] **Refund flow** — partial/full refund via Paystack API
- [ ] **Environment:** `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`
- [ ] **Tests, merge**

### 4.5 Business Pages & Seller KYC

- [ ] Business account type (user role: SELLER)
- [ ] KYC document upload + verification workflow
- [ ] Seller dashboard screens (orders, products, analytics)
- [ ] **Design decision needed:** lightweight KYC for Phase 3 go-live vs. full KYC

---

## 5. PHASE 4 — Realtime Calls

- [ ] **WebRTC signaling** — backend signaling server (offer/answer/ICE candidate relay via Socket.IO)
- [ ] **TURN/STUN provisioning** — choose provider (Twilio, Metered, self-hosted coturn)
- [ ] **Voice calls** — 1:1 voice, call state management (ringing/active/ended)
- [ ] **Video calls** — 1:1 video, camera/mic controls, picture-in-picture
- [ ] **Group calls** — (if in scope; otherwise defer to Phase 6)
- [ ] **Push notification** for incoming calls
- [ ] **Mobile:** call UI (full-screen incoming call, in-call controls, background handling)
- [ ] **Tests, merge**

---

## 6. PHASE 5 — Intelligence

- [ ] **AI assistant** — conversational AI for general questions
- [ ] **Translation** — in-chat translation (server-side for public content; on-device for private E2EE chats)
- [ ] **Message summary** — **on-device only** for private chats (E2EE constraint); server-side only for Channels/Communities
- [ ] **Smart reply** — same on-device constraint as above
- [ ] **Choose AI provider** — OpenAI, Anthropic, local model?
- [ ] **Tests, merge**

---

## 7. PHASE 6 — Platform & Admin

- [ ] **Business accounts** — separate user role, business profiles
- [ ] **Admin dashboard** — web-based (requires web client decision)
- [ ] **Reports and moderation** — content moderation, user reports, trust & safety
- [ ] **Settings and privacy controls** — notification prefs, blocked users, data export
- [ ] **Ghana Data Protection Act (Act 843) compliance** — data residency, consent, right to deletion

---

## 8. PHASE 7 — Scale & Release

- [ ] **Analytics** — choose tool (PostHog recommended)
- [ ] **Performance/load testing** — k6 or Artillery; define SLOs
- [ ] **App Store / Play Store releases** — EAS submit pipeline, store listings, screenshots
- [ ] **Production deployment** — Docker images, AWS/DigitalOcean, Nginx, SSL
- [ ] **Monitoring** — Sentry for errors, uptime monitoring
- [ ] **Backups** — MongoDB backup strategy, point-in-time recovery
- [ ] **CI/CD hardening** — dependency auditing (npm audit/Snyk), container scanning

---

## 9. TECH DEBT & CROSS-CUTTING (tracked items)

### 9.1 Security & API Hardening

- [ ] **Dedicated per-tier limiter on authenticated endpoints** — E2EE recovery and other auth routes ride only global limiter. Acceptable today (single instance); revisit before multi-instance/production.
- [ ] **`validate.ts` strips unknown fields instead of rejecting** — CLAUDE.md §8 says "unknown fields rejected" but Zod `.parse()` strips silently. Decision needed: `.strict()` (reject) or amend §8.

### 9.2 Code Quality

- [ ] **Persist-path idempotency** — add unique `{groupId, senderId, timestamp}` index + idempotent create on both 1:1 and group paths (Conversation history L1)
- [ ] **Live-handler dedup** — `senderId+timestamp` dedup in live message handler (Conversation history L2)
- [ ] **Mongoose collection-name normalization** — project-wide cleanup (Conversation history L6)
- [ ] **Load-more / infinite-scroll** — only first page of 20 merged for chat history (Conversation history N3)
- [ ] **Shared envelope types** — deduplicate response types across API clients (Conversation history N4)

### 9.3 Outbox Residuals

- [ ] **Expired draft bubble** — expired drafts show permanent "Pending…" (needs `expiredIds` in flush notification + ChatScreen handling)
- [ ] **SecureStore 2KB ceiling** — size-aware store needed for large queues
- [ ] **Silent-draft-loss-on-logout warning** — UX decision needed
- [ ] **Retention window** — 7-day expiry value: product decision

### 9.4 Infrastructure

- [ ] **Typesense at scale** — per-community/channel live member view scale-testing under high churn
- [ ] **Docker Compose production config** — current config is for local dev only
- [ ] **GitHub Actions CI** — add dependency audit step

---

## 10. MOBILE QUALITY (no automated coverage yet)

- [ ] **E2E tests** — Detox smoke test exists; full flow tests needed (register → verify → chat → send message → logout)
- [ ] **Accessibility audit** — automated a11y linting (eslint-plugin-react-native-a11y, documented gap in CLAUDE.md)
- [ ] **Offline behavior** — WatermelonDB schema has no tables yet (`appSchema({ tables: [] })`); offline sync is not functional for any feature
- [ ] **Error boundary** — global React error boundary for crash recovery
- [ ] **Deep-linking audit** — push deep-links wired; need URL scheme deep-links for share/invite flows
- [ ] **App icon & splash screen** — current assets are placeholders

---

## 11. DECISIONS STILL NEEDED

| Decision                         | Blocks                        | Status |
| -------------------------------- | ----------------------------- | ------ |
| Multi-account identity (Phase 1) | E2EE identity persistence     | Open   |
| Web client (Next.js)             | Admin dashboard, seller tools | Open   |
| KYC requirements for sellers     | Marketplace go-live           | Open   |
| Analytics tool                   | Phase 7                       | Open   |
| TURN/STUN provider for calls     | Phase 4                       | Open   |
| AI provider for assistant        | Phase 5                       | Open   |
| Detox E2E in scope?              | Mobile testing strategy       | Open   |
