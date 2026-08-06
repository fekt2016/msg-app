# ADR 0003: Recovery-key backup uses a 24-word BIP39 phrase + Argon2id, backing up the identity bundle only

**Status**: Accepted
**Date**: 2026-08-05
**Deciding agent**: e2ee (implementation), with the three load-bearing choices confirmed by the user
**Affected agents**: e2ee (owns the crypto + flow), security (must know the server-blind boundary and KDF posture), database (new `e2ee_recovery_backups` collection), mobile (setup/restore screens), documentation, project-manager (task tracking)

## Context

Phase 1 requires message-history recovery on a lost/replaced device (CLAUDE.md §5: "Message backup
requires a user-held recovery key … a lost device without one means lost history. This is in-scope
for Phase 1, not optional polish"). Today `ensureE2eeKeysRegistered` generates a **fresh** identity on
any device with no local bundle (per-user, tracked by `BUNDLE_OWNER_KEY`), so a new device makes new
keys and can never decrypt the ciphertext history the server stores. The recovery flow must let a user
restore their **original** identity from a secret only they hold, without the server ever seeing that
secret or the plaintext key material (the server-blind invariant is non-negotiable — CLAUDE.md §5).

Three choices were genuine cryptographic forks that should not be decided ad hoc (changing them after
users create backups forces a painful migration of everyone's recovery phrase). All three were put to
the user; the recommended option was chosen in each case.

## Decision

1. **Recovery secret = 24-word BIP39 mnemonic (256-bit entropy).** Uses `@scure/bip39` (audited, same
   authors as the `@noble/*` libraries already on the stack). The wordlist checksum rejects a
   mistranscribed phrase on restore before any expensive derivation runs — a real UX win over a raw
   code. Rejected: 12-word (128-bit — ample, but 24-word is the recognizable "seed phrase" and the
   entropy headroom is free) and a dependency-free base32 code (no checksum → a typo fails opaquely).

2. **KDF = Argon2id** (`@noble/hashes/argon2.js`), parameters **m = 19 456 KiB (19 MiB), t = 2,
   p = 1**, deriving a 32-byte AES-256-GCM key. Memory-hard at the OWASP memory floor. Rejected scrypt
   (comparable, but Argon2id is the modern default and Signal's choice) and PBKDF2 (not memory-hard).
   **Parameter rationale (important):** pure-JS Argon2id at the originally-imagined 64 MiB/t=3 runs
   ~7 s in Node and far worse on Hermes — unusable. Benchmarking drove the tuning to 19 MiB/t=2
   (~2 s in Node). This is sound because the KDF cost here is **defense-in-depth, not the primary
   barrier**: a full-entropy 256-bit mnemonic is not brute-forceable regardless of Argon2 cost, and
   the operation runs at most twice in a user's lifetime (backup once, restore once), so a ~2–5 s
   spinner is acceptable. The KDF params are stored (non-secret) alongside the ciphertext so restore
   can reproduce the derivation; `RECOVERY_KDF_PARAMS` is versioned via the backup `version` field for
   future upgrades.

3. **Backup scope = identity key bundle only.** The encrypted blob is `AES-256-GCM(JSON(E2eeKeyBundle))`.
   Because 1:1 chat currently has **no forward secrecy** (the identity ECDH key _is_ the message
   agreement key — see ADR 0001 and the forward-secrecy follow-up in TASKS.md), restoring the identity
   alone already makes the server's stored ciphertext history decryptable. Backing up decrypted
   message history as well would be redundant today. **This property breaks when X3DH/Double-Ratchet
   lands** — at that point past ciphertext will no longer be recoverable from the identity key, and the
   backup scope must expand to per-conversation/per-message key material. That is explicitly deferred
   to the forward-secrecy milestone, not designed now.

## Consequences

- New server collection `e2ee_recovery_backups` (one soft-deletable doc per user) stores an opaque
  `{ ciphertext, iv, salt, kdf, version }` blob. The backend module (`recoveryBackup.*`) is a pure
  server-blind store: it never derives a key, sees the phrase, or decrypts anything. Endpoints:
  `PUT/GET/DELETE /api/v1/e2ee/recovery` + `GET /api/v1/e2ee/recovery/status`.
- On restore, `restoreE2eeKeys` (new export in `ensureKeys.ts`) installs the recovered bundle, claims
  device ownership for the user so `ensureE2eeKeysRegistered` does not regenerate over it, and
  re-publishes the unchanged public keys.
- Losing the phrase means the backup is unrecoverable — by design. The setup screen gates upload
  behind an explicit "I've saved it" confirmation.
- `@scure/*` added to the frontend Jest `transformIgnorePatterns` (ESM package, mirrors the existing
  `@noble/*` entry).
