# Project Specification — Eaz Community

## 1. Project Overview

**Project Name:** Eaz Community (Working Name)
**Project Type:** Cross-platform mobile application (Android & iOS)
**Primary Platform:** Mobile First
**Purpose:** A community-first communication platform for Ghana and
Africa, combining messaging, communities, AI, marketplace, and digital
payments into one application.

## 2. Vision

Create Africa's most trusted communication platform — enabling
individuals, businesses, schools, churches, organizations, and
communities to communicate, collaborate, and transact securely.

## 3. Mission

Deliver a fast, secure, scalable, user-friendly messaging platform
while gradually evolving into a complete digital ecosystem.

## 4. Target Audience

Individuals · Businesses · Schools · Churches · Mosques ·
Organizations · Communities · Government · SMEs

## 5. Core Principles

Security First · Performance First · Mobile First · Scalable
Architecture · Reusable Components · Modular Development · Offline
Friendly · Clean Code · Accessibility · Production Ready

## 6. Technology Stack

### Mobile

React Native, Expo, TypeScript, React Navigation, TanStack Query,
Axios, Socket.IO Client, React Hook Form, Zod, EAS (OTA updates/build
pipeline). Offline persistence: WatermelonDB (default assumed, no
strong preference given; override if needed).

### Backend

Express.js, TypeScript, MongoDB, Mongoose, Socket.IO, Redis, BullMQ,
JWT, Cloudinary, Multer, Paystack. WebRTC signaling + TURN/STUN for
calls (provider: see **Open Decisions**). Search engine: see **Open
Decisions**. Object storage strategy: see **Open Decisions**.

### Infrastructure

Docker, GitHub, GitHub Actions, Cloudinary, Firebase Cloud Messaging,
AWS / DigitalOcean, Nginx, Sentry (error tracking). Analytics tool:
see **Open Decisions**.

## 7. Development Philosophy

Develop one feature completely before starting another, within the
current roadmap phase. Every feature must include Backend, Mobile,
Database (or N/A), API, Socket (or N/A), Testing, Documentation,
Review. No unfinished modules.

## 8. Development Order — Phased

See `ROADMAP.md` for the authoritative phase list and current status.
Commerce (Marketplace & Payments) is sequenced ahead of Realtime Calls
— Calls require WebRTC/TURN infrastructure that's slower to build
correctly, while Marketplace/Payments are the revenue-generating
features and shouldn't wait behind it.

## 9. Functional Modules

Authentication · Users · Friends · Private Chats · Group Chats ·
Communities · Channels · Stories · Calls · Marketplace · Orders ·
Payments · Notifications · AI · Settings · Reports · Administration ·
**Moderation / Trust & Safety** (first-class module, not a subset of
Reports)

## 10. Backend Rules

Express.js only · TypeScript · MongoDB only · Mongoose · Service Layer
Architecture · Repository Pattern · Socket.IO for realtime · REST APIs
· JWT Authentication · Redis for cache · BullMQ for queues.

## 11. Mobile Rules

React Native Expo · TypeScript · TanStack Query · Axios · Reusable
Components · Feature-Based Folder Structure · Offline Support.

## 12. Database Rules

MongoDB · Mongoose · Every schema must include timestamps, indexes,
validation, references, pagination support · No duplicated data ·
Soft-delete vs hard-delete default: see **Open Decisions**.

## 13. API Rules

RESTful API · Versioned APIs (`/api/v1`) · Consistent response format
· Proper HTTP status codes · Input validation · Error handling ·
Documented via OpenAPI/Swagger · Default pagination: 20 per page,
max 100.

## 14. Socket Rules

Socket.IO only · Realtime events documented, named `namespace:action`
(e.g. `chat:message:new`) · No business logic inside socket handlers.

## 15. Security Rules

JWT · Refresh Tokens · OTP (provider: Africa's Talking — default
assumed, no strong preference given; override if needed) · Rate
Limiting (tiers: see **Open Decisions**) · Helmet · CORS · Validation
· Input Sanitization · Encryption · Secure Uploads.

**End-to-end encryption for private chat: DECIDED — full E2EE.** The
server stores ciphertext only and cannot read message content. Use a
Signal Protocol implementation (e.g. `libsignal` bindings) for 1:1
chat; group chat requires its own key-distribution scheme (sender-key
style, not naive pairwise encryption) — treat this as distinct scope
from 1:1 E2EE, not an extension of it. Downstream implications, all
binding on later phases:

- Message Summary and Smart Reply (Phase 5) cannot run server-side on
  private chat content — they must run on-device, or be scoped to
  non-encrypted surfaces (Channels/Communities) only.
- Server-side search cannot cover private message content — only
  client-side search over what's already synced locally is possible.
- Message backup requires a user-held recovery key (e.g. a recovery
  phrase, Signal-style); without one, a lost device means lost
  history. This recovery flow is in-scope for Phase 1, not optional
  polish.

## 16. Coding Standards

TypeScript only. No JavaScript. Small reusable functions. Thin
Controllers. Business Logic in Services. Repositories only access
MongoDB. Reusable utilities. ESLint + Prettier + husky/lint-staged
enforced pre-commit.

## 17. Feature Completion Checklist

See `ENGINEERING_RULES.md` §10 — this is the single source of truth
for the checklist; not duplicated here to avoid drift.

## 18. Localization

Pan-African rollout will span multiple languages (English, Twi, and
others depending on market). i18n library/workflow (e.g. `i18next` /
`react-i18next`) must be in place before Phase 1 UI components are
built at scale.

## 19. Compliance

Given Government and institutional users are an explicit target
audience, the platform must account for Ghana's Data Protection Act
(Act 843) — data residency and consent. Compliance pass scheduled in
`ROADMAP.md` Phase 6.

## 20. Open Decisions

These block specific phases and must be resolved by the Project
Architect before that phase starts — not decided implicitly by
whichever agent happens to touch the area first.

**Decided:** E2EE (full, §15) · OTP provider (Africa's Talking, §15 —
default, confirm before Phase 1 ships) · Offline local DB
(**WatermelonDB**, §6 — confirmed, scaffolded in Phase 0) ·
Soft-delete default (§12 — soft-delete default with per-entity
exceptions: append-only ledgers/events/logs are never deleted, only
archived; TTL for OTP/sessions; business keys explicitly released on
deletion. See `.opencode/DATABASE_DESIGN.md` §11) · Search engine
(**Typesense**, §11 — decided Phase 2; self-hosted, GPL-3, RAM-bound
index, Raft HA; chosen over MongoDB Atlas Search because the stack is
self-hosted (no Atlas) and over Meilisearch for predictable
self-hosting. See `.opencode/DATABASE_DESIGN.md` §11).

| Decision                                                                                                                             | Blocks                                                | Options                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Search engine (scope now limited to public content only — Communities, Channels, Marketplace; private messages are excluded per §15) | Phase 2 (Communities/Channels), Phase 3 (Marketplace) | **Typesense (decided)** · MongoDB Atlas Search · Meilisearch         |
| Object storage strategy                                                                                                              | Phase 2 (Stories media), scale generally              | Cloudinary-only · S3-compatible (Spaces/Backblaze) behind Cloudinary |
| Business/seller KYC requirements                                                                                                     | Phase 3 (Payments go-live)                            | To be defined                                                        |
| Analytics tool                                                                                                                       | Phase 7                                               | PostHog · Mixpanel · Amplitude                                       |

## 21. Long-Term Goal

Build a scalable super app serving millions of users across Africa
while maintaining high performance, reliability, and security.
