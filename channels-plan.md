# Phase 2 — Channels: Scope & Plan

**Status:** Scoping (plan only — no build until greenlit).
**Feature:** Channels (Phase 2, Community Features). Next unbuilt item after Communities.
**Date:** 2026-08-06
**Convention base:** `CLAUDE.md` §§5–12, the Communities module (closest existing analogue), and the group-chat realtime pattern.

**Review pass (2026-08-07):** gaps closed against `main`'s current code — `GET /channels/mine` + viewer-aware browse items, cursor pagination scoped as **net-new infra** (encoder + `meta.nextCursor`), a non-avatar `MediaStorage.uploadPostImage`, feed author join, whole-room post broadcast (client dedupe), and reaction `$inc` split out as its own CH3 sub-task. **Build branches off `main`, not this branch** — `docs/phase-planning` trails `main` by ~3,200 lines (rate-limit store, live-member-list realtime, groupMessages module, offline outbox all landed after `18e91d0`).

**Decisions resolved (2026-08-07, §9):** PRIVATE join = **invite link + request-to-join, both in CH1b**; Channels mobile home = **Home entry card**; view counts deferred; no edit window/audit; two-op `$inc` drift posture accepted.

**Critical pass (2026-08-07):** caught 7 build-time traps and fixed them — (1) `GET /channels/mine` + invite routes must register **before** `/:identifier` (Express literal-segment shadowing); (2) the unauthenticated invite preview needs a **separate unauthenticated router** (the codebase pattern is router-wide `use(authenticate)`); (3) `channels.avatar` has no upload route — **explicitly deferred**, mirroring Communities; (4) search-path browse must apply the same viewer-membership enrichment as the DB path; (5) invite-join edge cases (already-subscribed → `200` no-op, expired/revoked → `410`, invalid → `404`); (6) request-approve transitions the row to `APPROVED` (audit trail) + already-subscribed → `409`; (7) realtime gains `channel:subscriber:joined/left/role` mirroring `communityEventBus`.

---

## 1. Decisions locked (this scoping session)

| Fork             | Choice                                             | Consequence                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structure**    | **Standalone broadcast channels**                  | Top-level entity (Telegram/WhatsApp-style), independent of Communities. Owner/admins broadcast; subscribers read + react. Not nested in a Community.                                                                         |
| **Interaction**  | **Broadcast + reactions**                          | Admins post; subscribers read and react (emoji, whitelisted). No threaded comments/replies (deferred).                                                                                                                       |
| **Delivery**     | **Live socket push + pull**                        | New posts broadcast to a `channel:{id}` room (server-authoritative join) _and_ fetchable via paginated REST.                                                                                                                 |
| **Post content** | **Text + images**                                  | Reuse the Cloudinary server-mediated, magic-byte-sniffed upload pattern (`eaz-image-upload`). Video deferred.                                                                                                                |
| **PRIVATE join** | **Invite link + request-to-join (full, in scope)** | NOT deferred (owner decision, 2026-08-07): stored opaque invite tokens (hashed-at-rest, expiring, revocable, role-bearing) _and_ a request-to-join approval flow. Substantial CH1 scope — split into its own milestone CH1b. |
| **Mobile home**  | **Home entry card**                                | ChannelsScreen is a root-stack screen pushed from a HomeScreen entry card — not a tab, not nested in Communities. Adds a `Channels` route to `AppStackParamList`. (Owner decision, 2026-08-07.)                              |

**Non-E2EE, on purpose:** Channels are public content — searchable via the existing Typesense provider, eligible for future server-side AI/summary (Phase 5). This is the decided boundary (PROJECT_SPEC §15, ROADMAP Phase 2). Nothing here touches the E2EE surfaces.

---

## 2. Data model (new module `backend/src/modules/channels/`)

Six collections. Mirrors the Communities shape (`channels` ≈ `communities`, `channel_subscribers` ≈ `community_members`) so we reuse proven patterns; `channel_invites` and `channel_join_requests` are the PRIVATE-join additions (CH1b).

### `channels`

```
{ _id, name (1..100), slug (unique), description (max 500),
  avatar { publicId, url, width, height } | null,
  ownerId (ref users),
  visibility  PUBLIC | PRIVATE,
  subscriberCount (denormalized), postCount (denormalized),
  deletedAt, createdAt, updatedAt }
```

Indexes: `unique {slug}`, `{visibility, deletedAt}` (browse), `{ownerId}`, Typesense-indexed for public search.

### `channel_subscribers`

```
{ _id, channelId (ref), userId (ref),
  role  OWNER | ADMIN | SUBSCRIBER,
  mutedAt? (date — push mute),
  joinedAt }
```

Indexes: `unique {channelId, userId}`, `{userId}` (my channels), `{channelId, role}` (admin listing).
Authoritative source for **both** the post-authorization check (`role in [OWNER, ADMIN]`) and the realtime `channel:{id}` room-join gate — exactly like `group_members` for groups. **Only approved members ever get a row here** — pending/denied join requests live in `channel_join_requests`, never here, so the room gate and post-authz can't accidentally treat a requester as a member.

### `channel_invites` (PRIVATE join)

```
{ _id, channelId (ref), createdBy (ref users, must be OWNER/ADMIN),
  tokenHash (sha256 of the opaque token — NEVER stored raw),
  role  SUBSCRIBER | ADMIN  (the role the invite grants on join),
  expiresAt (required), usedCount, maxUses (default 1),
  revokedAt? (owner revocation), createdAt }
```

Indexes: `unique {tokenHash}`, TTL `{expiresAt}` (auto-purge expired invites), `{channelId}` (owner lists/revokes).
The raw token is shown once at creation; a join hashes the presented token and looks up `tokenHash` — mirrors the OTP hashed-at-rest rule (CLAUDE.md §11). Route-registration order and the unauthenticated preview are handled in §3 ("Route-registration order" / "Auth split").

### `channel_join_requests` (PRIVATE join)

```
{ _id, channelId (ref), userId (ref), role  SUBSCRIBER,
  status  PENDING | APPROVED | DENIED,
  decidedAt?, decidedBy? (ref users, OWNER/ADMIN), createdAt }
```

Indexes: `unique {channelId, userId, status}` (one live PENDING per user per channel), `{channelId, status}` (owner/ADMIN approval queue).
On **approve** → create the `channel_subscribers` row + `$inc subscriberCount` (the single writer path); on **deny** → set `status: DENIED` (kept for audit/spam visibility) and never a subscription row. A user with a live `PENDING` re-requesting gets `409 CONFLICT`.

### `channel_posts`

```
{ _id, channelId (ref), authorId (ref users, must be OWNER/ADMIN),
  body (text), images [{ publicId, url, alt, order }],
  reactionCounts  Map<emoji, int>  (denormalized, kept in sync atomically),
  deletedAt, createdAt, updatedAt }
```

Indexes: `{channelId, createdAt, _id}` (feed — **cursor** pagination, deterministic secondary sort), `{authorId}`.

### `channel_post_reactions`

```
{ _id, postId (ref), channelId (ref, denormalized for scoping),
  userId (ref), emoji (whitelisted), createdAt }
```

Indexes: `unique {postId, userId}` (one reaction per user per post — changing emoji updates the row), `{postId}`.

### Enums

```
CHANNEL_ROLE       = OWNER | ADMIN | SUBSCRIBER
CHANNEL_VISIBILITY = PUBLIC | PRIVATE
REACTION_EMOJI     = 👍 | ❤️ | 😂 | 😮 | 😢 | 🙏   (whitelist — Mongoose enum + Zod)
```

---

## 3. API (`/api/v1/channels`)

**Channel lifecycle**

- `POST /channels` — create (creator → OWNER)
- `GET /channels` — browse **public** channels, paginated 20/max 100, Typesense search via `q`; each item carries the viewer's `isSubscribed` + `role` (one batched `$in` membership query — the 18e91d0 N+1 lesson — never a per-row lookup) — **enrichment applies to the search path too** (search hits → `findByIds` → the same batch membership query; never skip it on `q`)
- `GET /channels/mine` — the viewer's subscribed channels with their `role` + `subscriberCount` (drives the "My channels" section of `ChannelsScreen`; Communities omitted this and paid for it in UI hacks — don't copy that)
- `GET /channels/:identifier` — detail + viewer's subscription status _(private gated — see §5.S1)_
- `PATCH /channels/:identifier` — owner/admin update
- `DELETE /channels/:identifier` — owner soft-delete
- `POST /channels/:identifier/avatar` — **deferred (MVP): field exists, no upload route yet — mirrors Communities** (which ships `avatar` in the model with no upload endpoint). Do **not** add an avatar endpoint until Communities does; keep the field `null` in CH1.

**Route-registration order (Express matches in order — a real build trap):** literal-segment routes must be registered **before** the `/:identifier` catch-all, otherwise `mine`/`invites` get swallowed as identifiers:

1. `GET /channels/mine`
2. `GET /channels/invites/:token` + `POST /channels/invites/:token/join` (and `DELETE /channels/invites/:inviteId` under `/:identifier/invites/:inviteId`)
3. everything `/:identifier...`

**Auth split (the `GET /channels/invites/:token` preview is unauthenticated by design, but the established pattern is router-wide `use(authenticate)`):** mount a **separate unauthenticated `channelInviteRouter`** in `app.ts` before the authenticated `channelRouter` (same pattern as `healthRouter`) so a user who clicks a link without a session can still preview the channel. Join stays authenticated (joiner must be logged in).

**Subscription**

- `POST /channels/:identifier/subscribe` — subscribe (PUBLIC open; PRIVATE → `403`, must use invite or request-to-join)
- `POST /channels/:identifier/unsubscribe` — owner cannot unsubscribe (must transfer/delete)
- `GET /channels/:identifier/subscribers` — paginated _(private gated)_
- `PATCH /channels/:identifier/subscribers/:userId` — owner assigns/revokes ADMIN (cannot assign OWNER **and cannot modify the OWNER row at all** — mirror the Communities rule)

**PRIVATE join — request-to-join**

- `POST /channels/:identifier/requests` — request to join a PRIVATE channel (PUBLIC → `400`; live PENDING → `409`; already subscribed → `409`)
- `GET /channels/:identifier/requests` — owner/ADMIN lists requests, `?status=PENDING` default, paginated _(private gated)_; each item carries the requester's `displayName` + `avatarUrl` via the `findByIds` join
- `PATCH /channels/:identifier/requests/:userId` — owner/ADMIN approve/deny `{ action: APPROVE | DENY }` (requester can never self-decide). **On approve:** create the `channel_subscribers` row (role SUBSCRIBER) + `$inc subscriberCount`, then set the request row `status: APPROVED` (transition, never a delete — it's the audit trail). **On deny:** set `status: DENIED` + `decidedAt`/`decidedBy`. **Edge case:** target already has a subscriber row → `409`.

**PRIVATE join — invites**

- `POST /channels/:identifier/invites` — owner/ADMIN creates `{ role?, expiresInDays?, maxUses? }` → returns the raw token **once**
- `GET /channels/:identifier/invites` — owner/ADMIN lists active invites (revocation management) _(private gated)_
- `DELETE /channels/:identifier/invites/:inviteId` — revoke (soft: set `revokedAt`; a revoked token joins as `410`)
- `GET /channels/invites/:token` — unauthenticated preview (channel name, role granted, expiry) — no join side effect
- `POST /channels/invites/:token/join` — join via invite (no approval; role from invite; consumes `maxUses`). **Edge cases:** already subscribed → `200` no-op (never a downgrade; only upgrade SUBSCRIBER→ADMIN if the invite grants ADMIN); expired/revoked → `410 GONE`; invalid hash → `404` (never distinguish "bad token" from "expired" to non-owners — the join response for a consumed token is `410`).

**Posts**

- `POST /channels/:identifier/posts` — create (OWNER/ADMIN only, ownership check in service)
- `GET /channels/:identifier/posts` — feed, **cursor**-paginated _(private gated)_; each item includes the author's `displayName` + `avatarUrl` via a single `userRepository.findByIds` join (the 18e91d0 pattern) — never a per-post author lookup
- `GET /channels/:identifier/posts/:postId` — single post (same author-enriched shape)
- `PATCH /channels/:identifier/posts/:postId` — edit (author or admin)
- `DELETE /channels/:identifier/posts/:postId` — soft-delete
- `POST /channels/:identifier/posts/:postId/images` — Cloudinary upload (magic-byte sniffed; **new non-avatar path — see §6**)

**Reactions**

- `PUT /channels/:identifier/posts/:postId/reaction` — set/change my reaction `{ emoji }`
- `DELETE /channels/:identifier/posts/:postId/reaction` — remove my reaction

Every endpoint: standard envelope, Zod on body/query/params, typed `AppError`, Swagger JSDoc.

---

## 4. Realtime (`realtime/channelEvents.ts` + server handlers)

Server-authoritative, mirroring the group-chat implementation (`group:subscribe` gate + eviction):

- `channel:subscribe` / `channel:unsubscribe` — join/leave `channel:{id}` room **only after** verifying an **approved** subscription row exists (PUBLIC allows any authenticated user; PRIVATE requires the subscriber row, never a PENDING/DENIED requester). Never trust the client's claim.
- `channel:post:new` — broadcast the new post to the whole `channel:{id}` room (`io.to(room)`, **not** `socket.to(room)`). "Author excluded" means the author's _composing_ device ignores its own echo client-side (`authorId === ownUserId`); a `socket.to(room)` emit would wrongly starve the author's other devices.
- `channel:post:updated` / `channel:post:deleted`
- `channel:post:reaction` — updated reaction counts to the room
- `channel:subscriber:joined` / `channel:subscriber:left` / `channel:subscriber:role` — broadcast to the `channel:{id}` room **and** the affected user's `user:{id}` room (mirrors `communityEventBus`, which does both so the member list updates for everyone and the affected user's other devices stay consistent). Emitted on: PUBLIC subscribe, invite-join, request-approve (joined), unsubscribe (left), admin revoke/role change (left/role).
- **On unsubscribe / removal from a PRIVATE channel → force-evict the socket from the room** (the group-chat revocation lesson). Soft-deleting a channel evicts **all** subscribers' sockets and broadcasts `channel:deleted` (mirrors `groupEventBus.emitDeleted`).

---

## 5. Security — bake in from day one (don't re-earn these)

- **S1 (Communities lesson):** every read of a PRIVATE channel — detail, subscriber list, posts feed, single post — is gated to subscribers; a non-subscriber gets `403`/`404`, never the content. Build the visibility check into the shared `getChannel` helper so no read path can bypass it.
- **Broadcast authorization:** only OWNER/ADMIN may post/edit/delete posts — enforced in the service (resource ownership), not middleware.
- **Room gate (group lesson):** `channel:subscribe` verifies an approved subscription server-side; eviction on unsubscribe/removal.
- **Invite tokens (own security posture):** `crypto.randomBytes(32)` opaque token, **SHA-256 hashed at rest**, TTL-expiring, per-channel-scoped, revocable, single-use by default — the API secret never sits in the DB. `POST /channels/invites/:token/join` rate-limited like auth (spam vector).
- **Request-to-join:** rate-limited (Redis-backed tier); one live PENDING per user per channel (`409`); approve/deny only by OWNER/ADMIN, never self-decided; denied requests kept (audit + spam visibility) but never grant a subscription row or room access.
- **Upload safety:** magic-byte MIME sniff on post images (reuse `mediaStorage.sniffImageMimeType`), size-limited, streamed through backend.
- **Anti-spam:** rate-limit post creation (Redis-backed tier) — a broadcast channel is a spam vector.
- **Reaction integrity:** emoji whitelist (reject arbitrary strings); one reaction per user per post enforced by `unique {postId, userId}`.

---

## 6. Data integrity / performance

- **Denormalized counters** (`subscriberCount`, `postCount`, `reactionCounts`) maintained via atomic `$inc`. Reaction set/change/remove is a small compensating sequence in the service (upsert reaction row → `$inc` new emoji, `$dec` prior emoji if changed) — documented as the single writer. **This is net-new logic (no existing Map-field `$inc` example in the repo) — keep it as its own CH3 sub-task, not part of "denormalized counts"**. _(Note the known non-atomic add-member+increment drift pattern from Communities/groups applies here too; same accepted posture unless we wrap in a txn — decide explicitly at CH3.)_
- **Cursor pagination** on the posts feed (`{createdAt, _id}`) — high-volume, append-heavy. **This is net-new infra**: no cursor pagination exists anywhere in the codebase today (messages/communities are all offset `page/pageSize`). CH2 must build a cursor encoder/decoder (`base64(createdAt|_id)`) plus a `meta.nextCursor` field — a documented, explicit deviation from the standard `meta` shape, not a silent one.
- **Post images need a non-avatar Cloudinary path.** The current `MediaStorage` interface is avatar-only (`uploadAvatar` forces a 512×512 square `fill` crop). CH2 adds `uploadPostImage` (no square crop, multi-image, `eaz-community/channel-posts` folder) reusing the same magic-byte `sniffImageMimeType` gate — mirroring `user.service.updateAvatar`'s buffer-sniff before upload.
- `lean()` reads; Redis cache-aside on channel detail + recent-posts page, invalidated on write.
- Typesense indexing of PUBLIC channels only, reusing the Phase 2 `searchProvider` — no new search infra.

---

## 7. Mobile (`frontend/src/`)

- `api/channels.ts` + `hooks/useChannels.ts` (TanStack Query), realtime wiring via existing client.
- Screens: `ChannelsScreen` (browse/search via `GET /channels`, **my subscriptions via `GET /channels/mine`**), `ChannelDetailScreen` (post feed + subscribe/mute + react, joins `channel:{id}` room on open), `CreateChannelScreen`, `ChannelPostComposerScreen` (admin: text + image picker), plus PRIVATE-join surfaces: `JoinRequestScreen` (approve/deny queue) and an invite flow (share link via `expo-clipboard`, preview + join on open).
- **Navigation home (decided): Home entry card.** `HomeScreen` gains a "Channels" card that pushes `ChannelsScreen` on the **root stack** (add `Channels: undefined` to `AppStackParamList`); `ChannelDetail`/`CreateChannel` push the same way. No 5th tab, no Communities nesting — matches the existing root-stack detail-screen pattern.
- Feed hooks consume the cursor shape (`meta.nextCursor`) for infinite scroll — pagination helper in the api client, not inline in the screen.
- Explicit empty/loading/error states; a11y labels; tokens from `theme/tokens.ts`.

---

## 8. Build order (milestones, each fully to DoD)

| #    | Milestone                                                                                                                                                                         | Layers                              | Socket      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- |
| CH1  | Channel entity + subscription (CRUD, subscribe/unsubscribe, roles, visibility gating, **`GET /channels/mine` + viewer-aware browse**)                                             | Backend, DB, API, tests             | N/A         |
| CH1b | **PRIVATE join (owner decision):** invite tokens (create/preview/join/revoke; hashed-at-rest, TTL, revocable) + request-to-join (request/list/approve/deny) — two new collections | Backend, DB, API, tests             | N/A         |
| CH2  | Posts (create/list/edit/delete, **cursor feed incl. encoder + `meta.nextCursor`**, **author-enriched feed**, **`MediaStorage.uploadPostImage`**)                                  | Backend, DB, API, Cloudinary, tests | N/A         |
| CH3  | Reactions (set/change/remove, denormalized counts — **net-new Map-`$inc` logic; record the drift-posture decision**)                                                              | Backend, DB, API, tests             | N/A         |
| CH4  | Realtime (channel room + post/reaction events + **subscriber joined/left/role**, server-authoritative gate + eviction)                                                            | Realtime, tests                     | ✅          |
| CH5  | Search indexing of public channels (reuse Typesense provider)                                                                                                                     | Backend, tests                      | N/A         |
| CH6  | Mobile (screens + hooks + realtime wiring + feature testing)                                                                                                                      | Mobile, RQ                          | ✅ (client) |

Backend milestones (CH1–CH5) complete to their applicable DoD before CH6 mobile, matching the codebase's backend→tests→mobile flow.

---

## 9. Decisions resolved (2026-08-07)

| #   | Decision                              | Resolution                                                                                                                                                                  |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PRIVATE channel join mechanism        | **Invite link + request-to-join, both in scope** (owner decision) — CH1b: opaque hashed tokens (TTL, revocable, role-bearing) + an approve/deny queue.                      |
| 2   | Mobile navigation home for Channels   | **Home entry card** (owner decision) — `ChannelsScreen` pushed on the root stack from a HomeScreen card; `Channels: undefined` added to `AppStackParamList`.                |
| 3   | View/read counts per post             | **Deferred (out for MVP)** — read-tracking needs dedup'd impressions; no broadcast-feature payoff yet. `reactionCounts` is the social signal for CH2.                       |
| 4   | Post edit window / edit-history audit | **No window, no audit for MVP** — authors/admins may edit freely; append-only edit-history deferred.                                                                        |
| 5   | Counter drift posture                 | **Accept the two-op `$inc` pattern** (same as Communities/groups; no MongoDB transactions in the repo). Revisit only if a drift bug surfaces.                               |
| 6   | Channel avatar upload                 | **Deferred (MVP)** — `avatar` field exists but no upload route, mirroring Communities (field shipped with no endpoint). Keep `null` in CH1; add only when Communities does. |
| 7   | Invite preview auth                   | **Unauthenticated preview** on a separate `channelInviteRouter` mounted before `use(authenticate)` (same pattern as `healthRouter`); join stays authenticated.              |

---

## 10. Definition of Done (per milestone)

Backend (layered) · Mobile · Database (schema+indexes, `explain()`) · API (versioned, validated, Swagger) · Socket (CH4/CH6) or N/A · Validation (Zod) · Error handling (typed `AppError`) · Testing (unit+integration+component, coverage floor 70/60) · Docs (CLAUDE.md, Swagger, TASKS.md) · **Security reviewed** · **Code reviewed** · `pnpm lint/typecheck/test` clean · Merged.

---

## 11. Recommended first step (when greenlit)

Start **CH1** — the channel entity + subscription — cloning the Communities module structure, but with the S1 visibility gate built into the shared `getChannel` helper from the outset. Everything else (posts, reactions, realtime) hangs off that entity. **CH1b (PRIVATE join) is in scope per the owner decision** — build it immediately after CH1, before posts.
