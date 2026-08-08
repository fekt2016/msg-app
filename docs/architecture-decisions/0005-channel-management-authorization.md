# ADR 0005: Channel ADMIN-granting is OWNER-only; routine channel management is OWNER-or-ADMIN

**Status**: Accepted
**Date**: 2026-08-08
**Deciding agent**: architect
**Affected agents**: backend (implements the service-gate split + Swagger correction), security (raised finding L1; must record the resolved authorization posture), testing (owns coverage of the new owner-only paths and the ADMIN-invite rejection case), project-manager (task tracking), documentation (channels-plan.md §3 clarification)

## Context

A security audit of the Channels feature (Phase 2, `feature/phase-2-channels`) surfaced a
code-vs-spec mismatch on role-management authorization, finding **L1**.

Verified in-repo (not assumed from docs):

- `channels-plan.md` §3 L141 specifies `PATCH /channels/:identifier/subscribers/:userId` as
  **owner** assigns/revokes ADMIN. The same §3 specifies invite creation (L151), invite list
  (L152), request list (L146), and request approve/deny (L147) as **owner/ADMIN**. The spec is
  therefore internally inconsistent: role assignment is written owner-only, but the ADMIN-granting
  invite path is written owner-or-admin.
- The implementation (`backend/src/modules/channels/channel.service.ts`) gates all of these on the
  shared `getForAdmin(identifier, userId, 'UPDATE')` helper (L525-543), which permits **OWNER or
  ADMIN**. `'DELETE'` is correctly owner-only; `'UPDATE'` is owner-or-admin.
- Consequence today: an **ADMIN** can promote/demote other ADMINs (`updateSubscriberRole`, L274-297,
  gated `'UPDATE'`), mint invites bearing `role: ADMIN` (`createInvite`, L315-332, gated `'UPDATE'`),
  and via `joinViaInvite` (L362-393) that invite upgrades a SUBSCRIBER to ADMIN. Admin is therefore
  self-propagating: any single admin can permanently expand the admin set without the owner.

The closest existing analogue, **Communities** (`backend/src/modules/communities/community.service.ts`),
gates `updateRole` on the same `getForAdmin(..., 'UPDATE')` = OWNER-or-MODERATOR (L245-268, L286-304),
so a MODERATOR can mint MODERATORs there too. Communities has **no** invite or join-request surface,
so it has no ADMIN-minting-via-token vector. The Channels code cloned the Communities helper shape and
in doing so lost the owner-only role-assignment distinction the Channels plan explicitly called for.

Two positions were in tension:

- **Mirror Communities exactly** (owner-or-admin role changes): maximum consistency with the existing
  analogue, smallest diff, and admins can fully self-serve.
- **Least privilege for a broadcast surface** (owner-only ADMIN-granting): on a broadcast channel ADMIN
  is a heavy grant (post to every subscriber, moderate, manage invites/requests). Letting the admin
  _set_ self-propagate means one rogue or compromised admin can lock in a foothold and dilute the
  owner's control of who may broadcast.

Channels are non-E2EE public content (channels-plan.md L29); this decision touches no E2EE surface and
no **Decided** item in PROJECT_SPEC §15/§20, so it is an architectural call, not a user escalation.

## Decision

The **admin set of a channel is owner-controlled**. Any action that _grants_ ADMIN is **OWNER-only**.
Every other operational management action — broadcasting, moderating, growing and vetting the
subscriber base, editing channel metadata — is **OWNER-or-ADMIN**. Concretely, for each management
action on a channel:

| Action                                             | Route                                      | Authorization                    |
| -------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| Channel update (name/description/visibility)       | `PATCH /channels/:id`                      | OWNER-or-ADMIN                   |
| Channel soft-delete                                | `DELETE /channels/:id`                     | **OWNER-only** (already correct) |
| Subscriber role change (promote/demote ADMIN)      | `PATCH /channels/:id/subscribers/:userId`  | **OWNER-only**                   |
| Invite create, `role: SUBSCRIBER` (or unspecified) | `POST /channels/:id/invites`               | OWNER-or-ADMIN                   |
| Invite create, `role: ADMIN`                       | `POST /channels/:id/invites`               | **OWNER-only**                   |
| Invite list                                        | `GET /channels/:id/invites`                | OWNER-or-ADMIN                   |
| Invite revoke                                      | `DELETE /channels/:id/invites/:inviteId`   | OWNER-or-ADMIN                   |
| Join-request list                                  | `GET /channels/:id/requests`               | OWNER-or-ADMIN                   |
| Join-request approve/deny (grants SUBSCRIBER only) | `PATCH /channels/:id/requests/:userId`     | OWNER-or-ADMIN                   |
| Post create / edit / delete + reaction moderation  | `POST/PATCH/DELETE /channels/:id/posts...` | OWNER-or-ADMIN                   |

The two ADMIN-granting paths — `SUBSCRIBER→ADMIN` promotion and minting an `ADMIN`-bearing invite —
are the only ones moved to OWNER-only. `joinViaInvite` needs no gate change: it is token-authorized,
and once ADMIN invites can only originate from an owner, the SUBSCRIBER→ADMIN upgrade it performs
still traces to an owner grant. The existing "cannot assign OWNER" and "cannot modify the OWNER row"
guards stay.

**The fix is to the code**, with a one-line spec clarification:

- **Code (backend agent):** tighten the service so `updateSubscriberRole` requires OWNER, and
  `createInvite` requires OWNER when the requested `role` is `ADMIN`. Keep `getForAdmin(..., 'UPDATE')`
  (OWNER-or-ADMIN) for channel update, invite list/revoke, request list/decide, and post moderation;
  keep `'DELETE'` owner-only. Reuse the existing owner-check tier (the `'DELETE'` branch already
  proves the pattern) or add an explicit owner-only action value — implementation shape is the
  backend agent's call, the rule above is binding.
- **Spec/Swagger (backend agent, alongside the code):** correct `channels-plan.md` §3 L151 to state
  that `role: ADMIN` invites are OWNER-only while `role: SUBSCRIBER` invites are OWNER-or-ADMIN, so
  the plan is no longer internally contradictory, and update the affected route Swagger JSDoc to
  match. L141 (role assignment owner-only) already reflects the decision.

Communities is **not** changed by this ADR. Its MODERATOR-mints-MODERATOR behavior is a separate,
lower-severity surface (no token vector, lighter grant) and re-opening it is out of scope here; if
security wants it revisited, that is its own finding.

## Consequences

- Closes the L1 privilege-escalation surface: the admin set can no longer self-propagate. Owner
  retains sole control of who may broadcast.
- Admins keep every operational capability that makes delegation useful — posting, moderating posts
  and reactions, revoking invites, approving SUBSCRIBER joiners, editing channel metadata, and
  growing the channel via SUBSCRIBER invites — so the owner is not made a bottleneck for routine work.
- Channels deliberately diverges from Communities on role-assignment authorization. This is
  acceptable and intended: a broadcast channel's ADMIN is a heavier grant than a community MODERATOR,
  and the Channels plan already specified owner-only role assignment. New tests are needed for the
  owner-only promotion path and the ADMIN-invite-creation rejection (403 for an admin actor).
- Requires touching `channels-plan.md` §3 and the invite-route Swagger. This ADR is the record; the
  documentation edit is a task for the backend agent's implementing PR, not a separate open decision.

## Alternatives considered

- **Mirror Communities exactly (owner-or-admin ADMIN-granting).** Rejected: it is the status quo that
  produced finding L1, and for a broadcast surface it lets a single admin permanently entrench the
  admin set. Consistency with Communities does not outweigh least-privilege here, and the Channels
  plan never asked for it.
- **Fix the spec to match the code (declare owner-or-admin the intended model).** Rejected: it would
  ratify the self-propagating-admin escalation as design rather than resolve it, and it contradicts
  the plan's own §3 L141.
- **Make ADMIN→SUBSCRIBER demotion owner-or-admin (only promotion owner-only).** Rejected as
  needless complexity and an admin-vs-admin power-struggle surface; treating the entire ADMIN role
  transition (grant and revoke) as owner-only is simpler, matches L141 ("assigns/revokes"), and there
  is no third mid-tier role that would make partial delegation worthwhile.
