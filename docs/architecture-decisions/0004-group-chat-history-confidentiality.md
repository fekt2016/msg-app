# ADR 0004: Group chat is forward-only — new members cannot read pre-join history

**Status**: Accepted
**Date**: 2026-08-07
**Deciding agent**: architect
**Affected agents**: backend/groups (owns the `joinedAt` API scoping), e2ee (owns sender-key rotation-on-join), mobile (owns the join-rotation trigger in `GroupChatScreen`), security (raised the HIGH finding; must record the new posture), project-manager (task tracking), database (index impact — none new)

## Context

The `security` agent audited branch `feature/chat-history-persistence` (commit `0299bed`) and
raised a HIGH finding. Verified in-repo (not assumed from the report):

- The branch adds **server-side persistence of group message ciphertext** — new module
  `backend/src/modules/groupMessages/` (`groupMessage.model.ts` stores `{ groupId, senderId,
keyId, ciphertext, iv, timestamp }`, ciphertext only, no plaintext), written from the realtime
  relay at `backend/src/realtime/server.ts` via `groupMessageService.storeMessage`. Before this
  branch, group messages lived only in mobile component state — **no server-side group history
  existed at all.**
- `backend/src/modules/groups/group.service.ts` `addMembers` does **not** rotate any sender key
  on join. The client mirrors this: `frontend/src/screens/GroupChatScreen.tsx` `handleMemberLeft`
  calls `rotateOwnSenderKey` (mint a new `keyId`, redistribute to the remaining members), but
  `handleMemberJoined` only invalidates the members query.
- `frontend/src/e2ee/groupSession.ts` `ensureOwnSenderKeyDistributed` is idempotent and re-wraps
  the caller's **existing** `keyId` to the **current** member set on every screen open / join. So
  the first time any existing member reopens the group after a join, the newcomer is handed the
  same sender key (`keyId`) that pre-join messages were encrypted under.
- `backend/src/modules/groupMessages/groupMessage.service.ts` `listGroupMessages` authorizes on
  **current** membership (`findMember`) only, with no `joinedAt` cutoff, so
  `GET /api/v1/groups/:groupId/messages` returns the **full** thread.

Composed, these let a newly-added member decrypt the entire pre-join history: they hold the
in-use `keyId`'s sender key **and** can fetch every ciphertext ever encrypted under it. Adding
persistence silently flipped the group-chat confidentiality model from **forward-only** (nothing
was retained, so nothing could be back-read) to **full-retroactive**. That flip was never a
decided choice — it is an emergent side effect of a persistence branch, exactly the "decided by
whichever change touches the area first" failure mode `CLAUDE.md` §2 warns against.

**This is not an E2EE plaintext-invariant violation.** The stored blob is ciphertext/iv/keyId
only; the server remains blind to plaintext (`CLAUDE.md` §5 holds). The question is therefore a
legitimately decidable _inter-member_ confidentiality semantic — which member may read which
messages — not an architecturally-invalid "let the server read plaintext" proposal. No **Decided**
item in `PROJECT_SPEC.md` §15/§20 fixes group join-history semantics, so this is an architectural
call within the decided E2EE frame, not a reversal of one — no user escalation is triggered.

Two models were weighed:

- **A — Forward-only (Signal / WhatsApp semantics):** a new member sees only messages sent after
  they joined. Matches the decided E2EE posture, the existing rotation-on-_leave_ design (which is
  already forward-secret in intent), and the WhatsApp mental model this product's users (Ghana /
  Africa, community-first) overwhelmingly hold.
- **B — History-visible (Slack / Telegram-supergroup semantics):** new members read back-history
  by design; join intentionally shares the in-use sender key. Convenient for
  org/school/church-style groups where late joiners want context, but it means the sender key can
  never provide backward secrecy and the server's ciphertext retention becomes an ever-growing
  fully-readable-by-any-future-member archive.

## Decision

**Group chat is forward-only (Model A).** A member added to a group MUST NOT be able to read
messages sent before they joined. This is now a decided semantic for the platform, binding on
`groups`, `e2ee`, `groupMessages`, and the realtime group path.

Enforcement is **defense-in-depth across two layers, and BOTH are required** for the property to
be honestly held:

1. **Server-side access control — `joinedAt` scoping (REQUIRED, and the merge blocker for the
   branch).** `groupMessageService.listGroupMessages` MUST scope results to messages with
   `createdAt >= caller's group_members.joinedAt`, using the **server-assigned `createdAt`**, not
   the client-supplied `timestamp` (which is forgeable — see security finding S2; a member could
   otherwise craft a `timestamp` to pin/hide messages or slip content past the cutoff). A member
   who left and rejoined is scoped to their most recent join. Owner: **backend/groups**. This
   closes the acute, in-app exploit (`GET /messages` handing over full history).

2. **Cryptographic control — sender-key rotation on join (REQUIRED for the model to be
   cryptographically real).** On a member-join, existing members MUST rotate their sender key to a
   new `keyId` and distribute **only** the new key to the group, so pre-join ciphertext (old
   `keyId`) is undecryptable to the newcomer because they never receive the old sender key. This
   mirrors the existing `handleMemberLeft` → `rotateOwnSenderKey` path; `handleMemberJoined` must
   gain the same rotation. Owner: **e2ee** (rotation semantics) + **mobile** (the
   `GroupChatScreen` join handler) + **realtime** (the join event that triggers it, already
   emitted as `group:member:joined`).

**Sufficiency assessment (the crux the review asked for): API `joinedAt` scoping alone is NOT
sufficient for an E2EE-grade forward-only guarantee.** The server is untrusted-for-plaintext, yet
under scoping-alone it becomes the _sole_ guarantor of a confidentiality property — the only thing
stopping a newcomer from reading pre-join history is the server's willingness to withhold the
ciphertext, while the newcomer _already holds a key that opens it_. That is precisely the trust
model E2EE exists to eliminate. Any other path to the ciphertext (a DB dump, a malicious/curious
operator, a colluding existing member exporting their local cache) defeats scoping instantly,
because the crypto does not hold the boundary — only an access-control rule does. **Rotation on
join (layer 2) is the load-bearing control; `joinedAt` scoping (layer 1) is the belt.** Both ship;
neither is decorative.

**Merge and sequencing rules:**

- Layer 1 (`joinedAt` scoping) **BLOCKS merge** of `feature/chat-history-persistence`. The branch
  introduced the retroactive-history flip and must not ship it. This is a small, single-owner
  backend change and is the minimum to restore the forward-only property at the access-control
  layer.
- Layer 2 (rotation-on-join) is **REQUIRED before the "Conversation history persistence" item is
  DoD-complete** (its `TASKS.md` box may not be checked until layer 2 lands). It should land in the
  same branch. If it is split out for sequencing, it is a **named, tracked** follow-up filed
  alongside the existing member-leave rotation residual and the X3DH milestone — **not** an
  open-ended "someday" item.
- Until layer 2 lands, the posture is documented honestly, in the same spirit as ADR 0001's
  forward-secrecy honesty clause: _"new members are denied pre-join history by server-side
  `joinedAt` access control; the cryptographic guarantee that pre-join ciphertext is undecryptable
  to newcomers lands with rotation-on-join."_ No doc, changelog, or task entry may claim
  cryptographic forward-only group confidentiality before layer 2 ships.

## Consequences

- **Coherent, decided semantic.** Group chat now has one stated model (forward-only) rather than
  an emergent one that flipped the moment persistence was added. Future work touching group history
  has a rule to follow, not a precedent to reverse-engineer.
- **backend/groups** gains a `joinedAt` cutoff in `listGroupMessages`. `group_members.joinedAt`
  already exists (`groupMember.model.ts`) — no schema change. As implemented, the cutoff and the
  history sort both key on the server `createdAt`, so the `group_messages` index was changed to
  `{ groupId: 1, createdAt: -1, _id: -1 }` to cover the scoped range+sort. This is a not-yet-deployed
  collection introduced on the same branch, so no migration is required (the earlier draft of this
  ADR said `timestamp` and "no index change"; the `createdAt` implementation is the correct one and
  supersedes that note).
- **e2ee + mobile** gain rotation-on-join, structurally identical to the shipped rotation-on-leave
  path — low novel-surface, since `rotateOwnSenderKey` already exists and is tested.
- **Rejoin semantics are defined:** a member scoped to their _latest_ `joinedAt` cannot read
  messages from the gap when they were not a member — consistent with forward-only and with the
  leave-side purge.
- **Accepted product cost:** late joiners to org/school/church groups get no back-context. This is
  the WhatsApp behavior those users already expect; if a future community/broadcast surface
  genuinely needs shared history, that is a _different_ entity (a Channel/Community, which is
  non-E2EE and Typesense-indexable per `CLAUDE.md` §5) — not a reason to weaken private group
  confidentiality. Model B is not re-proposable for private groups without a new ADR superseding
  this one.
- **Consistency with the sender-key model:** rotation here is client-driven and best-effort,
  matching how rotation-on-leave already ships (`TASKS.md` group-chat residual). The asymmetry that
  makes join-rotation newly _necessary_: leave-rotation protects _future_ messages from a departed
  member (forward secrecy); join without rotation exposes _past_ messages to a newcomer (history
  confidentiality) — and this branch is exactly what makes those past messages persist server-side
  for the first time.
- No **Decided** item in `PROJECT_SPEC.md` §15/§20 is reversed and the E2EE plaintext invariant is
  re-verified intact (stored blob is ciphertext-only), so no user escalation is required.

## Alternatives considered

- **Model B (history-visible by design):** rejected for private groups. It contradicts the decided
  Signal/WhatsApp-flavored E2EE posture (ADR 0001, ADR 0003), defeats the purpose of the
  rotation-on-leave forward-secrecy work already shipped, violates the mental model of the target
  users, and turns the new server-side ciphertext store into a permanent archive readable by anyone
  ever added to the group. Shared back-history is a Channel/Community concern (non-E2EE surface),
  not a private-group one.
- **Model A via `joinedAt` API scoping alone, no key rotation:** rejected as the _end state_
  (accepted only as the interim step that blocks merge). It leaves the untrusted server as the sole
  guarantor of a confidentiality property while the newcomer holds a key that opens the ciphertext
  — non-E2EE-grade, and trivially defeated by any out-of-band ciphertext path. Acceptable as layer 1
  precisely because layer 2 is mandated before the feature is Done, not as a permanent posture.
- **Model A via key rotation alone, no API scoping:** rejected. Rotation is client-driven and
  best-effort (a member offline at join re-syncs later); until every existing member has rotated,
  the server would still serve pre-join ciphertext under a `keyId` the newcomer may already hold.
  The server-side `joinedAt` cutoff is the deterministic, immediately-effective backstop that does
  not depend on every client having rotated yet.
- **Blocking merge on BOTH layers landing together:** considered and not required. Layer 1 is the
  small change that removes the acute exploit and can land fast; forcing the heavier
  e2ee/mobile/realtime rotation work into the same gate would delay closing the reported HIGH
  finding for no confidentiality gain over "layer 1 now, layer 2 before Done." The DoD gate (box
  stays unchecked until layer 2) preserves the requirement without stalling the fix.
