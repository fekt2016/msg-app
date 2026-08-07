# Phase 1 — 1:1 Chat + Group Chat: Code Review

**Status:** Review — all blocking bugs (F1–F3, R1–R3) and notes N1/N2/N6 fixed; ready for final sign-off + merge.
**Scope:** 1:1 E2EE chat (ChatScreen) + group sender-key chat (GroupChatScreen), messages API, realtime relay.
**Date:** 2026-08-06
**Checklist source:** `.claude/skills/eaz-code-review/SKILL.md` + `CLAUDE.md` §7 (Definition of Done).

---

## 1. Files reviewed

**Frontend**

- `frontend/src/screens/ChatScreen.tsx` — 1:1 E2EE conversation (history merge, live socket, send/ack, bubbles)
- `frontend/src/screens/GroupChatScreen.tsx` — group sender-key chat
- `frontend/src/api/messages.ts` — conversation-history client
- `frontend/src/hooks/useConversationMessages.ts` — TanStack Query hook
- `frontend/src/e2ee/e2eeApi.ts`, `frontend/src/e2ee/keyStore.ts` — key directory / key storage
- `frontend/src/realtime/client.ts` — socket client + event constants
- `frontend/src/screens/ChatScreen.test.tsx`, `frontend/src/hooks/useConversationMessages.test.tsx`

**Backend**

- `backend/src/modules/messages/{message.model,message.repository,message.service,message.controller,message.routes,message.validation}.ts`
- `backend/src/realtime/server.ts` (chat relay), `backend/src/realtime/validation.ts`

---

## 2. Verdict

**All blocking issues resolved; N1/N2/N6 and the security HIGH (ADR 0004) also landed.** The functional bugs (F1–F3, R1–R3), the usability/error-handling notes (N1, N2, N6), and the security audit's HIGH + LOW (§10 — forward-only group history, `createdAt` sort) are fixed with regression tests; `lint`/`typecheck` are clean and the full test suite is green (backend 330/330, frontend 188/188 at `--maxWorkers=2`; the two heavy screen suites time out only under unbounded parallel load — an unrelated, pre-existing test-runner flake). Deferred (documented, not blocking): N3 (load-more/pagination), N4 (shared envelope types), N5 (`ciphertext` field naming), N7 (recipient-exists relay guard), persist-path dedup, `page` deep-skip. Remaining: code-review sign-off + a security re-verify against ADR 0004, then merge.

---

## 3. Fixed in this session (were blocking)

| #   | Finding                                                                                                                                                                                                                                                                                                             | Severity       | Resolution                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **History API shape mismatch → hard crash.** `listConversationMessages` returned `res.data.data` (the raw array) as if it were the `Paginated` object, so `history.items` was `undefined` and `ChatScreen` threw `Cannot read property 'length' of undefined` (ChatScreen:133). Root-caused live on both emulators. | Blocking (was) | `api/messages.ts` now maps `{ items: res.data.data, total, page, pageSize }` from `meta`, mirroring `api/communities.ts:73`. Backend was correct (routes test asserts `res.body.data` is the array). |
| F2  | **Received-message text invisible.** `otherBubble` uses `colors.inputSurface` (a dark translucent fill) but the shared `messageText` used `colors.baobabDeep` (near-black) → unreadable.                                                                                                                            | Blocking (was) | Added `otherMessageText` (`colors.savanna`) and selected per bubble in `ChatScreen` and `GroupChatScreen` (same latent bug).                                                                         |
| F3  | **ChatScreen tests mocked the wrong envelope.** Mocks supplied `{ data: { items: [] } }` (the old, buggy shape) with no `meta` — after F1 they would throw.                                                                                                                                                         | Blocking (was) | Test mocks updated to the real envelope `{ data: [...], meta: { page, pageSize, total, totalPages } }`. Chat + hook suites green (10/10), frontend typecheck clean.                                  |

---

## 4. Remaining issues — blocking

### R1 — History does not reload when returning to the screen (the requested behavior) — **FIXED**

`ChatScreen` merged persisted history exactly **once per mount**, guarded by `historyMergedRef`; TanStack Query cached the page (`gcTime` default 5 min), so re-entering the screen served a stale page and a fresh refetch was never re-merged.

**Fix applied:**

- `useConversationMessages` now sets `refetchOnMount: 'always'` so every entry refetches the latest history regardless of cache.
- `ChatScreen` dropped the `historyMergedRef` once-guard and merges on **every** `history` change; the dedup (by `senderId + timestamp`) makes re-merges idempotent.
- Merged messages are sorted by `timestamp` (this also lands R2 — a newer history item can no longer render before a live message).
- Regression test added: "merges newly fetched history when the conversation is refetched (reload on return)". Chat + hook suites: 11/11, typecheck + lint clean.

**Also noted (now resolved):** `GroupChatScreen` previously had **no history fetch** — group messages lived only in component state, so returning to a group always started empty. Now wired: a new `groupMessages` backend module (`GET /groups/:groupId/messages`, members-only, ciphertext-only, paginated) plus `useGroupMessages` (also `refetchOnMount: 'always'`) and a merge/decrypt effect mirroring `ChatScreen`. Regression test added: "merges newly fetched history when the conversation is refetched". Group suite: 4/4.

### R2 — Merge can misorder messages — **FIXED (with R1)**

`[...fresh, ...prev]` is now `.sort((a, b) => a.timestamp - b.timestamp)`.

### R3 — Incoming messages are not scoped to the open conversation — **FIXED**

The server relays `chat:message:new` to the recipient's own room (`io.to('user:'+recipientId)`, server.ts:116) without a per-conversation room. `ChatScreen.handleIncoming` only skipped self-echoes (`payload.senderId === currentUserId`), so a message from **any other sender** arriving while this screen was open was appended to the wrong thread (and its delivered/read acks emitted too).

**Fix applied:** the guard is now `if (payload.senderId !== userId) return;` — only the open conversation's peer is accepted, which also subsumes the self-echo case (`userId` is never `currentUserId`). Group chat already filtered correctly by `groupId`. Regression test added: "ignores an incoming message from a different conversation" asserts a `u3` event is neither decrypted, rendered, nor acked. Chat suite: 11/11.

---

## 5. Remaining issues — non-blocking

| #   | Finding                                                                                                                                                                  | Recommendation                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Messages truncated to 40 chars** — `item.ciphertext.slice(0, 40) + '…'` (ChatScreen:394). Chat must render full text.                                                  | **FIXED** — the slice is removed; `ChatScreen` now renders `item.ciphertext` in full (it holds the on-device decrypted text by design).                                                                                                                                |
| N2  | No error state for the history query. A failed fetch renders "No messages yet — say hi!" (misleading).                                                                   | **FIXED** — both `ChatScreen` and `GroupChatScreen` now read `isError` from the history query and render a distinct retry hint (terracotta) instead of the empty state. Regression test added: "shows an error hint (not the empty state) when history fails to load". |
| N3  | Only the first page (20) of history is merged; no load-more / infinite scroll.                                                                                           | Acceptable for MVP, but document and page correctly when it ships.                                                                                                                                                                                                     |
| N4  | `ApiEnvelope<T>` and `Paginated<T>` are redeclared in `messages.ts`, `communities.ts`, `e2eeApi.ts`.                                                                     | Hoist to a shared type module (e.g. `api/types.ts`).                                                                                                                                                                                                                   |
| N5  | `ChatMessage.ciphertext` stores plaintext on-device after decrypt (sender's own message shows typed text, incoming shows decrypted text). Field name lies about content. | Rename to `text` (GroupChat already does) or document once; the send-path comment covers it but the inconsistency persists across the two screens.                                                                                                                     |
| N6  | `GroupChatScreen`: `rotateOwnSenderKey(...).catch(() => undefined)` silently swallows an error path.                                                                     | **FIXED** — the rejection is now logged (`console.error('[group-e2ee] sender-key rotation after member-left failed:', err)`) with a comment noting the ensure-on-mount retry, per the error-handling convention.                                                       |
| N7  | Realtime `chat:message:new` relay does not verify the recipient exists before broadcasting (persistence validates separately).                                           | Cheap guard in the socket handler to avoid relaying to nonexistent users.                                                                                                                                                                                              |

---

## 6. Security review — passing with notes

- **B-1 bundle verification is enforced end-to-end:** the peer's signed pre-key ECDSA signature is verified before key agreement on send (ChatScreen:284), incoming (ChatScreen:188), and history decrypt (ChatScreen:84). A forged/tampered bundle is refused and never reaches the decrypt path — covered by tests.
- **Server stores ciphertext only** (message.model.ts); `storeMessage` validates both participants exist; history is append-only per `CLAUDE.md` §9.
- **Key material on-device only** via `expo-secure-store` (keyStore.ts); the server directory accepts only public bundles (`E2eePublicKeyBundle` structurally excludes private keys).
- Socket payloads are Zod-validated server-side (`chatMessageNewSchema` etc.) before relay.
- **Documented gaps, not regressions:** no TOFU identity pinning and no forward secrecy on 1:1 (explicit X3DH follow-up in `.opencode/TASKS.md`).
- Minor: no rate limit on the message relay — acceptable while bodies are ciphertext; revisit if any plaintext (metadata abuse) concern emerges.

---

## 7. Testing review

- `ChatScreen.test.tsx` (10 tests): history decrypt, live/history dedup, encrypted send (socket + REST), delivered/read ack, incoming decrypt + ack, both verification-failure paths, back navigation. Follows the repo's inline-`jest.fn()`-in-factory mock convention.
- `useConversationMessages.test.tsx`: hook contract.
- Backend: `message.routes.test.ts` asserts the real envelope (`data` array + `meta`); service and repository (real-Mongo) suites present.
- **Gap:** no test for R1 (reload-on-return) or R3 (wrong-thread filtering) — write regression tests when fixed.

---

## 8. DoD checklist

- [x] Backend (layered, no logic in controllers)
- [x] API (versioned, validated, Swagger)
- [x] Socket (relay wired, Zod-validated) — **N/A beyond that**
- [x] Database (indexed: `{senderId,recipientId,timestamp}` both directions)
- [x] Validation (Zod on `body/query/params`)
- [x] Error handling (typed `AppError`, history-decrypt failures surfaced as ciphertext preview, not swallowed)
- [x] Testing (unit + API + component)
- [x] Security reviewed (§6 initial; §10 persistence-surface audit → ADR 0004, both layers landed; re-verify against ADR 0004 pending)
- [x] Code reviewed (this doc)
- [x] **R1** reload-on-return history (fixed + regression test)
- [x] **R2** merge ordering (fixed with R1)
- [x] **R3** conversation-scoped incoming filter (fixed + regression test)
- [x] **N1** full-text message rendering (fixed)
- [x] `pnpm lint` / `pnpm typecheck` green both workspaces; `pnpm test` green — backend 330/330, frontend 188/188 (the two heavy screen suites time out only under full-parallel load; green isolated and at `--maxWorkers=2`)
- [x] Documentation/`.opencode/TASKS.md` updated for the fixed + remaining items
- [ ] Merged

---

## 9. Recommended next steps

1. ~~Land R1 + R2 (reload-on-return, with regression test) — the user-requested behavior.~~ **Done.**
2. ~~Land R3 (conversation scoping) with a test that a different-sender event is ignored.~~ **Done** — guard is `payload.senderId !== userId`; regression test added.
3. ~~N1 (full message text).~~ **Done** — truncation slice removed.
4. ~~Group-chat history — no fetch existed.~~ **Done** — new `groupMessages` module + `useGroupMessages` + merge effect + regression test.
5. ~~N2 (history error state) + N6 (swallowed `rotateOwnSenderKey` error).~~ **Done** — both screens surface a history-fetch error hint; the rotation failure is logged. N3/N4/N5/N7 deferred (documented).
6. `pnpm lint` / `pnpm typecheck` clean; test suites green (see §8), then final security/code-review sign-off and merge. **Separately investigate the pre-existing full-parallel test-runner timeout flake** (heavy screen suites) — not a blocker for this change but worth a `--maxWorkers` cap in CI.
7. **Emulator smoke test blocked by host memory pressure:** both `-read-only` emulators (5554, 5556) were relaunched with the new bundle, but the app process is silently OOM-killed (~40s after launch, no crash/redbox in logcat — LMK, not a JS error) because 2 emulators + Metro + backend exceed the 16 GB host. CI + the green suites remain the verification signal; re-smoke-test on a host with more headroom or one emulator at a time before the "Merged" box.
8. ~~Security audit of the new persistence surface.~~ **Done** — see §10. One HIGH (forward-only history) resolved via ADR 0004 with both enforcement layers landed; LOW ordering-forgery folded into the `createdAt` sort.

---

## 10. Security audit — persistence surface (2026-08-07)

The `security` agent audited the new `groupMessages` endpoint and the realtime persist path against `docs/team/checklists/security.md`. Verified good: service-layer membership enforcement (not middleware-only), ciphertext-only storage/return, the socket persist gate is _stricter_ than the relay gate (independent live-DB `findMember` re-check → the removed-member revocation fix is **not** reintroduced), Zod `.strict()` on params+query, server-side `pageSize` max-100, no plaintext/secret in logs, all failures via `AppError`.

| #   | Severity   | Finding                                                                                                                                                                                                                                                                                               | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **HIGH**   | Persistence silently flipped group chat from forward-only to full-retroactive: a newly-added member holds the in-use `keyId` **and** `GET /groups/:id/messages` returned the full thread → they could decrypt all pre-join history. New to this branch (no server-side group history existed before). | Escalated to `architect` → **ADR 0004 (forward-only, Accepted)**. **Layer 1 (merge blocker):** `listGroupMessages` scopes to the caller's `group_members.joinedAt`; repository filters/sorts on server `createdAt`. **Layer 2 (crypto, load-bearing):** `GroupChatScreen` rotates the sender key when the roster grows so a newcomer only gets the post-join key. Both landed; regression tests added. Residual: an offline existing member may re-share their current key on next open, but Layer 1 still blocks the newcomer from _fetching_ pre-join ciphertext — narrow DB-dump+collusion residual, tracked with X3DH. |
| S2  | LOW        | Client-supplied `timestamp` was the authoritative persisted sort key → a member could pin/hide messages.                                                                                                                                                                                              | Fixed with S1 — history now orders on server `createdAt`, never the client `timestamp` (still returned for client-side display/dedup only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S3  | LOW / info | 404-vs-403 existence oracle on `GET /groups/:id/messages`.                                                                                                                                                                                                                                            | No change — mirrors existing `getById`; unguessable ObjectIds. On record only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Routed elsewhere (not security):** no idempotency/dedup on the persist path (a reconnect re-emit stores a duplicate) → `code-reviewer`; unbounded `page` deep-`skip()` on a growing collection → `performance`.
