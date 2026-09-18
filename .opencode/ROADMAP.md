# ROADMAP.md — Eaz Community

Development roadmap. Milestones follow the Development Order defined
in `PROJECT_SPEC.md`. Each milestone must be fully complete (Backend,
Mobile, Database, API, Socket — each ✅ or signed-off **N/A** —
Validation, Testing, Documentation, Security reviewed, Review) before
the next begins. Task-level tracking lives in `TASKS.md`.

Commerce (Marketplace & Payments) is sequenced **last** among the
feature phases — calls, intelligence, and platform/admin ship first,
and only deployment/release work (Scale & Release) follows it. This is
an explicit Architecture Review ordering decision (2026-09-18): the app
is community- and messaging-first; Calls (WebRTC/TURN), Intelligence,
and Platform & Admin deepen that core value, and the commercial layer
is deliberately held until the non-revenue product surface is mature.
Do not reorder without another explicit Architecture Review decision.

## Phase 0: Foundation

Monorepo workspace setup · Backend workspace init (Express.js +
TypeScript) · Frontend workspace init (React Native + Expo) · Docker
infrastructure (MongoDB, Redis, backend) · CI/CD (GitHub Actions) ·
Environment configuration and validation · ESLint/Prettier/husky ·
Swagger scaffold · Local persistence layer scaffold (mobile) · Test
framework + coverage reporting in CI.

## Phase 1: Core Messaging

Authentication (registration, login, OTP via Africa's Talking, refresh
tokens) · User profiles and media upload · Full E2EE via Signal
Protocol for 1:1 chat, plus a separate group-chat key-distribution
scheme and a recovery-key backup/restore flow · Private chat with read
receipts and delivery status · Group chat · Socket.IO realtime
infrastructure with Redis adapter (transports ciphertext only).

## Phase 2: Community Features

Search infrastructure decided and stood up (**Typesense** — decided;
self-hosted, public content only: Communities, Channels, Marketplace;
private message content is excluded by the Phase 1 E2EE decision) ·
Object storage strategy
decided · Communities · Channels · Stories · Push notifications (FCM)
· In-app notification center.

## Phase 3: Realtime Calls

WebRTC signaling + TURN/STUN provisioning · Voice calls · Video calls.

## Phase 4: Intelligence

AI assistant · Translation · Message summary and smart reply — run
on-device for private chats (server never sees plaintext under full
E2EE); server-side variants permitted only for Channels/Communities
content.

## Phase 5: Platform & Admin

Business accounts · Admin dashboard · Reports and moderation · Settings
and privacy controls · Ghana Data Protection Act (Act 843) compliance
pass.

## Phase 6: Marketplace

**Catalog + inquiries only — no orders, no checkout, no payments**
(decided 2026-09-18). Product catalog (categories, products, variants,
media) with search and filter/pagination · Inventory visibility
(in/out-of-stock per SKU; no reserve/release ledger) · Business pages
· Buyer→seller inquiries (contact outside the app via chat/DM intent).
Requires a catalog-only re-write of the Marketplace sections of
`.opencode/DATABASE_DESIGN.md` and the marketplace skills before any
build. There is no Paystack/payment/checkout scope.

## Phase 7: Scale & Release

Analytics · Full performance and load testing pass · App Store and
Play Store releases · Production deployment, monitoring, logging, and
backups.

---

## Status

| Milestone              | Phase | Status                                    |
| ---------------------- | ----- | ----------------------------------------- |
| Foundation             | 0     | In progress                               |
| Core Messaging         | 1     | In progress                               |
| Community Features     | 2     | In progress (Communities partially built) |
| Realtime Calls         | 3     | Pending                                   |
| Intelligence           | 4     | Pending                                   |
| Platform & Admin       | 5     | Pending                                   |
| Marketplace & Payments | 6     | Pending (last feature phase)              |
| Scale & Release        | 7     | Pending                                   |
