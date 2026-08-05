# ADR 0001: E2EE identity uses a separate ECDSA signing key alongside the ECDH agreement key

**Status**: Accepted
**Date**: 2026-08-04
**Deciding agent**: architect
**Affected agents**: e2ee (owns the crypto path + the follow-up), security (must know the current 1:1 posture), project-manager (task tracking), database (schema impact — none now)

## Context

While fixing a critical bug (1:1 E2EE was generating/storing private keys server-side), the `e2ee`
agent hit a genuine crypto-design fork it declined to resolve unilaterally and asked for a binding
call.

The original design specified a single ECDH P-256 identity keypair reused for both key agreement AND
signing the signed-pre-key. This is not implementable: a WebCrypto EC key is single-purpose — an ECDH
key can only `deriveBits`, it cannot `sign`. "Sign the pre-key with the identity private key," as
originally written, is literally impossible on the current WebCrypto-based stack. A second, signing-
capable key is unavoidable regardless of which path we take.

Two paths were on the table:

- **Position A (what the agent implemented, minimal):** split the identity into two on-device
  keypairs — the existing ECDH P-256 key for agreement (message encryption path unchanged, no
  `ChatScreen.tsx` changes) plus a new ECDSA P-256 signing key used only to sign/verify the signed-
  pre-key's public bytes. Verified in-repo: `frontend/src/e2ee/crypto.ts` (`signPreKeyPublicKey`
  emits a real ECDSA signature, never a private key; `getPublicKeyBundle` strips every private half),
  `frontend/src/e2ee/types.ts` (two-keypair `E2eeIdentityKey`), `backend/src/modules/e2ee/e2ee.model.ts`
  (stores `publicKey` + `signingPublicKey` + signatures only; no `privateKey` field anywhere).

- **Position B (rejected here, larger):** a full X3DH redesign where the identity key becomes the
  signing key (Ed25519-style dual-purpose identity, as in real Signal/X3DH) and key agreement moves
  onto ephemeral/pre-keys — a substantial rewrite of the message-encryption path, performed inside
  what was scoped and reviewed as a security bug fix, not a protocol redesign.

Separately flagged and confirmed in-repo, **pre-existing, not introduced by this fix:** the pre-key /
one-time-pre-key infrastructure exists in the schema and is uploaded, but the actual encryption path
(`buildSharedSecret` in `crypto.ts`) derives the shared secret directly from the identity ECDH keys.
There is no X3DH-style ephemeral-key exchange and no ratchet, therefore no forward secrecy. `CLAUDE.md`
§5 / `PROJECT_SPEC.md` §15 say "Signal Protocol implementation (e.g. `libsignal` bindings)" without
mandating a specific ratchet scheme, so this is not a reversal of a **Decided** item — but it is a real
gap versus what "Signal Protocol implementation" implies to most readers.

## Decision

1. **The two-keypair split (ECDH P-256 for agreement + a separate ECDSA P-256 key for signing the
   signed-pre-key) is the correct and adopted resolution.** Rule: on the current WebCrypto stack, the
   E2EE identity is two on-device keypairs — one ECDH key that only ever does `deriveBits`, one ECDSA
   key that only ever signs/verifies the signed-pre-key. One P-256 key must never be asked to both
   agree and sign. Signed-pre-keys are authenticated with the ECDSA key; recipients MUST call
   `verifyPreKeySignature` before trusting a fetched signed pre-key. Private halves of both keypairs
   are generated on-device and never serialized into any API payload — only `getPublicKeyBundle`
   output is ever uploaded.

2. **The fix was correctly NOT expanded into a full X3DH redesign.** Rule: a change scoped and
   reviewed as a security bug fix does not get to grow into a protocol rewrite of the most security-
   critical path mid-flight. The private-key-leak bug is fixed and independently verified; the two-
   keypair split resolves the WebCrypto impossibility with the smallest correct change. The current
   fix is a strict improvement over the pre-fix state and is not to be reverted under any reading of
   this decision.

3. **Forward secrecy / X3DH + ratchet is a real gap and gets its own tracked Phase 1 line item** —
   distinct from the existing "group chat key-distribution scheme" item (different scope: group,
   sender-key) and the "recovery-key backup/restore flow" item (different concern: backup). Rule: the
   1:1 forward-secrecy upgrade is 1:1-scope live-protocol work and must not be folded under either of
   those. It is added to `.opencode/TASKS.md` Phase 1 as its own unchecked item, scoped as a follow-up
   protocol-hardening task. It does NOT block the sibling Phase 1 E2EE items and is sequenced after the
   server-blind confidentiality baseline (which is already achieved). Until it lands, the 1:1 E2EE
   posture is honestly stated as: confidential and server-blind, but not yet forward-secret and not yet
   a true Signal ratchet.

## Consequences

- Easier: signed-pre-key authentication now actually works (it was impossible before); the server-
  blind invariant is upheld and verified; the encryption path (`ChatScreen.tsx`, `buildSharedSecret`)
  is untouched, keeping the security fix's diff tight and reviewable.
- Harder / deferred: true forward secrecy still requires the X3DH + Double-Ratchet work now tracked
  separately. Anyone reading `[x] E2EE: Signal Protocol integration (1:1 chat)` in TASKS.md must read
  it as "confidential + server-blind," not "full Signal parity" — the new task line makes that
  explicit.
- Forecloses nothing: the X3DH upgrade can layer onto this identity shape (the ECDSA signing key is
  exactly what X3DH needs to authenticate pre-keys; agreement simply moves onto ephemeral/pre-keys).
  The uploaded pre-key/OTK schema already supports it — no database change is required now.
- No **Decided** item in `PROJECT_SPEC.md` §15/§20 is reversed; E2EE stays decided and intact, so no
  user escalation is triggered. If a future decision moves 1:1 off WebCrypto onto `libsignal`/Ed25519,
  this ADR should be marked Superseded.

## Alternatives considered

- **Full X3DH redesign inside the bug fix (Position B):** rejected as scope for _this_ fix — it turns
  a tight, reviewed security patch into a large under-reviewed rewrite of the most sensitive path,
  against `CLAUDE.md` §4 ("don't build for scale that isn't needed yet") and basic crypto-change
  hygiene. Adopted instead as a separately-scoped follow-up task (see decision 3). Not re-proposable
  as "the bug fix should have done this."
- **Reuse one ECDH key for both agreement and signing:** impossible on WebCrypto (single-purpose EC
  keys) — this was the original spec and is the reason this ADR exists.
- **Fold forward secrecy under the existing group-key or recovery-key task:** rejected as
  miscategorization that would hide 1:1 live-protocol work under group/backup scope.
