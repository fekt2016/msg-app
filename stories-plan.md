# Phase 2 — Stories: Scope & Plan

**Status:** Planned (backend + mobile not yet built). **Feature:** Stories (Phase 2, Community Features). Next unbuilt item after Channels.
**Date:** 2026-08-08
**Convention base:** `CLAUDE.md` §§5–12, the Communities/Channels modules (closest analogues), the group-chat realtime pattern, and the Cloudinary server-mediated upload pattern.

**Product decisions (owner, 2026-08-08):**

- **Visibility:** any verified user can see anyone's stories in the community feed — matches Communities' PUBLIC default and the lack of a friend/contact graph (contact discovery is chat-only today). A per-user privacy setting is a Phase 6 (Settings) follow-up, not MVP scope.
- **Media:** images **and** video, via the existing Cloudinary server-mediated upload path (magic-byte sniffed; video gets its own sniff signature). `expo-image-picker` already installed on mobile.
- **Structure:** a user can post **multiple stories** within a 24h window, grouped by author into a carousel ring (standard stories UX).
- **Ephemerality:** 24h TTL. Expiry is **hard-delete via a Mongo TTL index** (like OTP codes — the established exception to soft-delete default in CLAUDE.md §9); author-initiated delete is a hard delete + view cascade. Stories are ephemeral by definition, not ledger/audit content.
- **View tracking is in scope:** who-viewed list (author-only) + idempotent view marking. This is core stories UX (the "read receipt" of stories).
- **Not E2EE, on purpose:** stories are public content (community feed) — server-visible, consistent with Channels/Communities. Nothing here touches the E2EE surfaces (CLAUDE.md §5).

---

## 1. Decisions locked (this scoping session)

| Fork            | Choice                                     | Consequence                                                                                                                                                        |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Structure**   | **Per-user ephemeral media stories**       | A `stories` item belongs to one author; the feed is grouped by author (ring). Not nested in Communities/Channels.                                                  |
| **Visibility**  | **All verified users**                     | Feed is global; no membership/role checks. Author owns delete + view-list. Privacy setting deferred to Phase 6.                                                    |
| **Media**       | **Images + video**                         | `MediaStorage.uploadStoryMedia` (Cloudinary `resource_type: 'auto'`); video magic-byte sniff; larger size budget via new env var; `expo-video` added for playback. |
| **Lifetime**    | **24h TTL, hard-expire**                   | Server-computed `expiresAt`; TTL index auto-purges expired stories + their views; author delete is a hard cascade (stories aren't audit content).                  |
| **Feed**        | **Grouped by author, paginated by author** | `items: [{ author, stories[] }]`; page/pageSize over authors (max 100). Each story carries the viewer's `hasViewed`; `viewCount` only to the author (privacy).     |
| **Realtime**    | **Live feed + view events**                | `story:new` / `story:deleted` broadcast globally (feed refresh); `story:viewed` targeted to the author's `user:{id}` room (live view-count).                       |
| **Mobile home** | **Home entry card**                        | `StoriesScreen` pushed on the root stack from a HomeScreen entry card (same pattern as Channels). `StoryViewer`/`CreateStory` push the same way.                   |
| **View dedup**  | **Idempotent, unique-indexed**             | `unique {storyId, viewerId}`; first view `$inc`s the author-visible `viewCount`; re-view is a 200 no-op.                                                           |

---

## 2. Data model (new module `backend/src/modules/stories/`)

Two collections.

### `stories`

```
{ _id, authorId (ref users, required),
  media { publicId (required), url (required), width, height,
          resourceType  IMAGE | VIDEO  (server-detected, never client),
          durationMs? (video only, from Cloudinary) },
  caption (text, max 500, default ''),
  expiresAt (Date, required — server-computed: createdAt + STORY_TTL_HOURS),
  viewCount (int, default 0 — denormalized, author-visible only),
  createdAt, updatedAt }
```

Indexes: `{expiresAt: 1}` **TTL** (`expireAfterSeconds: 0` — hard-purge at expiry), `{authorId, expiresAt: 1}` (feed per author), `{authorId, createdAt: -1}` (ring ordering). Soft-delete is **not** used here — stories are ephemeral (documented exception per CLAUDE.md §9, same class as OTP).

### `story_views`

```
{ _id, storyId (ref stories, required), viewerId (ref users, required),
  expiresAt (Date, required — copied from the story so views TTL-punge with it),
  createdAt }
```

Indexes: `unique {storyId, viewerId}` (one view per user per story — the dedup boundary), `{storyId: 1}` (author's who-viewed list), `{expiresAt: 1}` **TTL** (same 24h purge as the story). A view is created in a small compensating sequence: `insertOne` on unique index → `$inc` the story's `viewCount` — same single-writer posture as channel reactions; a duplicate-key violation is the no-op path (idempotent re-view).

### Enums

```
STORY_MEDIA_RESOURCE_TYPE = IMAGE | VIDEO
```

---

## 3. API (`/api/v1/stories`)

- `POST /stories` — create a story. `multipart/form-data`: `media` (file) + `caption` (optional, ≤500). Server sniffs the media type (image magic bytes reusing `sniffImageMimeType`; video gets a new `sniffVideoMimeType`), uploads via `MediaStorage.uploadStoryMedia` (Cloudinary `resource_type: 'auto'`), stores the returned asset + server-computed `expiresAt`. Any authenticated user. Rate-limited (Redis-backed tier — stories are a spam/Cloudinary-cost vector).
- `GET /stories/feed` — active (not-expired) stories grouped by author, `page`/`pageSize` (20/max 100), ordered by most-recent story desc. Each item: `{ author: {id, displayName, avatarUrl}, stories: [SafeStory...], latestAt }`. `SafeStory` carries the viewer's `hasViewed`; `viewCount` is present **only when `viewer === author`** (privacy). Author-enrichment via one batched `userRepository.findByIds` (the 18e91d0 N+1 lesson). Own stories are not specially reordered in MVP (client can pin the own ring first).
- `GET /stories/:storyId` — single active story (author-enriched, same viewer-aware shape as the feed). Expired/deleted → `404`.
- `DELETE /stories/:storyId` — author-only soft... **hard** delete: remove the story doc + `deleteMany` its views + Cloudinary cleanup (`deleteByPublicId`). Ownership check in the service. Non-author → `403`.
- `POST /stories/:storyId/views` — mark as viewed (idempotent). First view inserts the row + `$inc viewCount`; a duplicate-key insert is the no-op path → `200 { data: { viewed: boolean } }`. Story must be active → `404` otherwise. Light rate limit.
- `GET /stories/:storyId/views` — who-viewed list, **author-only** (`403` otherwise), paginated, user-enriched (`displayName` + `avatarUrl` via `findByIds`).

Every endpoint: standard envelope, Zod on body/query/params (ObjectId path params validated at the edge — the channels audit lesson), typed `AppError`, Swagger JSDoc. `POST /stories` uses a `multer` memory-upload (mirrors `postImageUpload.ts`), with the Content-Type pre-filter as a cheap early gate only — the magic-byte sniff in the service is authoritative.

---

## 4. Realtime (`realtime/storyEvents.ts` + server handlers)

Server-authoritative, mirroring the channel event bus — **no business logic in handlers**:

- `story:new` — broadcast to **all** connected sockets (`io.emit`) with the safe story + author (the feed is global; a new story refreshes every feed). Mirrors the presence-broadcast pattern (global, not room-scoped).
- `story:deleted` — broadcast globally (`io.emit`) with `{ storyId, authorId }` so feeds drop the ring item immediately.
- `story:viewed` — targeted to the author's own `user:{id}` room with `{ storyId, viewerId }` so the author's open viewer updates the count live. Viewers' other devices don't need it.
- No `stories:subscribe` room needed — the feed is global, so no server-authoritative join gate exists (unlike channels/groups). Emits are push-only.
- Service wiring: `storyService.createStory` emits `STORY_NEW`; `storyService.deleteStory` emits `STORY_DELETED`; `storyService.markViewed` emits `STORY_VIEWED` (author-targeted).

---

## 5. Security — bake in from day one

- **Upload safety:** authoritative magic-byte sniff in the service (reuse `sniffImageMimeType` for images; new `sniffVideoMimeType` for mp4/mov/webm — see §6), never `Content-Type` alone; size-limited (new `STORY_MEDIA_MAX_SIZE_MB`, default 25 — video budget exceeds avatars); streamed through the backend; `resourceType` set from the sniff, never from client input.
- **Ownership:** delete + who-viewed-list are author-only, enforced in the service (resource ownership, not middleware).
- **Ephemerality:** `expiresAt` is server-computed (`createdAt + STORY_TTL_HOURS`); a client-supplied `expiresAt` is rejected by Zod `.strict()`. Reads filter `expiresAt > now` (defense in depth — TTL index is storage reclaim, not the read gate).
- **Idempotent views:** `unique {storyId, viewerId}` is the dedup boundary; a re-view is a 200 no-op, never a double `$inc`.
- **Privacy:** `viewCount` returned only to the story author; the who-viewed list is author-only.
- **Rate limiting:** Redis-backed tier on `POST /stories` (spam/Cloudinary-cost vector, like `postLimiter`) + a lighter limiter on `POST /stories/:storyId/views`.
- **No E2EE surface** (public content); no plaintext secrets in logs; standard `helmet`/CORS posture already in `app.ts`.

---

## 6. Data integrity / performance

- **Denormalized `viewCount`** maintained via atomic `$inc` on first view (single writer; duplicate-key = no-op). Same accepted two-op drift posture as channel reactions — revisit only if a drift bug surfaces.
- **TTL double-index:** `stories.expiresAt` + `story_views.expiresAt` (copied at insert) both TTL-indexed so views purge with their story — no orphaned view rows after expiry.
- **No N+1:** feed + view-list batch-enrich via `userRepository.findByIds`; never a per-row author lookup.
- **`MediaStorage.uploadStoryMedia`** — new method, `resource_type: 'auto'`, folder `eaz-community/stories`, no square crop (width cap only), returns `{ publicId, url, width, height, resourceType, durationMs? }`. Image sniff reuses `sniffImageMimeType`; **video sniff is net-new**: mp4 (`ftyp` at offset 4), mov (`ftypqt`), webm (`1A45DFA3` EBML). Add to the same `mediaStorage.ts` file + `LoggingMediaStorage` fallback.
- `lean()` reads; feed page capped 20/max 100 server-side regardless of client-requested size.

---

## 7. Mobile (`frontend/src/`)

- `api/stories.ts` + `hooks/useStories.ts` (TanStack Query: `useStoryFeed`, `useStory`, `useCreateStory`, `useDeleteStory`, `useStoryViews`, `useMarkStoryViewed`).
- Screens:
  - `StoriesScreen` — horizontal feed tray of author rings (avatar + name + live-story count + progress dots). Tap a ring → `StoryViewer`; own ring → `CreateStory`. Empty/loading/error states, a11y labels, `theme/tokens.ts` colors. Home entry card → this screen.
  - `StoryViewerScreen` — full-screen carousel per author: auto-advance timer per story, tap-left/tap-right zones, progress bars, caption overlay, close; marks viewed on open (calls `markStoryViewed`, ignores the no-op response). Video stories render with `expo-video`; images with RN `Image`.
  - `CreateStoryScreen` — pick image/video via `expo-image-picker` (`mediaTypes: ['images', 'videos']`), optional caption, publish. Upload state + error handling.
- Navigation: add `Stories`, `StoryViewer: { authorId: string; displayName: string }`, `CreateStory: undefined` to `AppStackParamList`; push all on the root stack (immersive, tab-free — matches Chat/ChannelDetail).
- Realtime: `client.ts` gains `STORY_NEW`/`STORY_DELETED`/`STORY_VIEWED` events + payload types; `StoriesScreen` refetches the feed on `story:new`/`story:deleted`; `StoryViewerScreen` listens for `story:viewed` when the author is the viewer (live count).
- New deps: `expo-video` (playback) + jest mock in `jest.setup.ts` (it's not currently installed); `expo-image-picker` already present.
- Explicit empty/loading/error states; never render on `undefined`.

---

## 8. Build order (milestones, each fully to DoD)

| #   | Milestone                                                                                                            | Layers                              | Socket      |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- |
| ST1 | Story entity + create/feed/get/delete + **`MediaStorage.uploadStoryMedia` (images + video sniff)** + TTL collections | Backend, DB, API, Cloudinary, tests | N/A         |
| ST2 | Views (mark-viewed idempotent + who-viewed list + denormalized `viewCount`)                                          | Backend, DB, API, tests             | N/A         |
| ST3 | Realtime (`story:new`/`story:deleted` global broadcast, `story:viewed` author-targeted)                              | Realtime, tests                     | ✅          |
| ST4 | Mobile (api client, hooks, screens, navigation, `expo-video`, realtime wiring, feature tests)                        | Mobile, RQ                          | ✅ (client) |

Backend milestones (ST1–ST3) complete to their applicable DoD before ST4 mobile, matching the codebase's backend → tests → mobile flow.

---

## 9. Definition of Done (per milestone)

Backend (layered) · Mobile (ST4) · Database (schema+indexes, `explain()`) · API (versioned, validated, Swagger) · Socket (ST3/ST4) or **N/A** · Validation (Zod on every endpoint) · Error handling (typed `AppError`) · Testing (unit+integration+component, coverage floor 70/60) · Docs (CLAUDE.md, Swagger, TASKS.md) · **Security reviewed** · **Code reviewed** · `pnpm lint/typecheck/test` clean · Merged.

---

## 10. Recommended first step (when greenlit)

Start **ST1** — the story entity + create/feed/get/delete with `MediaStorage.uploadStoryMedia`, cloning the Channels module structure and reusing the `postImageUpload` multer pattern. Video sniff + TTL indexes are part of ST1 (media and ephemerality are core to the entity, not optional). Then ST2 (views), ST3 (realtime), ST4 (mobile).
