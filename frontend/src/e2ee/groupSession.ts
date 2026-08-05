import { keyStore } from './keyStore';
import { groupKeyStore } from './groupKeyStore';
import {
  generateSenderKey,
  importSenderKey,
  wrapSenderKeyForRecipient,
  unwrapSenderKey,
} from './groupCrypto';
import { encryptMessage, decryptMessage } from './crypto';
import { fetchKeyBundle } from './e2eeApi';
import { uploadSenderKeys, fetchSenderKey, type SenderKeyEnvelope } from './groupE2eeApi';
import { bytesToBase64, base64ToBytes } from './base64';
import type { E2eeKeyBundle } from './types';

/**
 * Mints the next sender-key id for this group. Key ids are opaque monotonic
 * counters per (group, sender) that let receivers detect a rotated sender key:
 * a message carrying a keyId other than the one they cached means the sender
 * rotated and their copy is stale. `Date.now()` is only the base for the first
 * key; every rotation after that is strictly `previous + 1` so ordering is
 * deterministic rather than clock-dependent.
 */
function mintKeyId(previous: number | null): number {
  return previous === null ? Date.now() : previous + 1;
}

/**
 * Wraps `keyBase64` for every member except the sender, tagged with `keyId`.
 * Members without a fetchable identity bundle are skipped. Returns the list of
 * envelopes ready to upload (possibly empty).
 */
async function wrapForKey(
  groupId: string,
  keyBase64: string,
  keyId: number,
  memberIds: string[],
  currentUserId: string,
  own: E2eeKeyBundle,
): Promise<SenderKeyEnvelope[]> {
  const keyBytes = base64ToBytes(keyBase64);
  const recipients = memberIds.filter((id) => id !== currentUserId);
  const envelopes: SenderKeyEnvelope[] = [];
  for (const recipientId of recipients) {
    const bundle = await fetchKeyBundle(recipientId).catch(() => null);
    if (!bundle?.identityKey?.publicKey) {
      continue;
    }
    const { ciphertext, iv } = await wrapSenderKeyForRecipient(
      keyBytes,
      own.identityKey.privateKey,
      bundle.identityKey.publicKey,
    );
    envelopes.push({ recipientId, keyId, ciphertext, iv, createdAt: '' });
  }
  return envelopes;
}

/**
 * Ensures the caller has a sender key for `groupId` and that every other member
 * holds a pairwise-wrapped copy of it. The sender key is generated on-device and
 * never leaves it in the clear — each recipient gets it wrapped (AES-GCM over an
 * ECDH shared secret) to their identity public key. Idempotent: re-running
 * re-wraps the same key, so it is safe to call on every screen open and whenever
 * a member joins. A single keyId is minted per key and persisted alongside it so
 * every envelope (and every later encrypted message) carries the same id.
 */
export async function ensureOwnSenderKeyDistributed(
  groupId: string,
  memberIds: string[],
  currentUserId: string,
): Promise<void> {
  const own = await keyStore.getKeyBundle();
  if (!own) {
    throw new Error('Missing local key bundle — cannot join encrypted group');
  }

  let keyBase64 = await groupKeyStore.getOwnSenderKey(groupId);
  let keyId = await groupKeyStore.getOwnSenderKeyId(groupId);
  if (!keyBase64 || keyId === null) {
    if (!keyBase64) {
      keyBase64 = await generateSenderKey();
    }
    keyId = mintKeyId(keyId);
    await groupKeyStore.saveOwnSenderKey(groupId, keyBase64, keyId);
  }

  const envelopes = await wrapForKey(groupId, keyBase64, keyId, memberIds, currentUserId, own);
  if (envelopes.length > 0) {
    await uploadSenderKeys(groupId, envelopes);
  }
}

/**
 * Rotates the caller's sender key — used when a member leaves so departed
 * members can no longer decrypt future messages (the core forward-secrecy
 * guarantee of a sender-key scheme). Generates a fresh key with a strictly-newer
 * keyId, distributes it to the remaining members, and only then persists it, so
 * a distribution failure leaves the previous key intact and the caller can keep
 * sending (Bug 2 — the old code cleared the key first, orphaning the member).
 */
export async function rotateOwnSenderKey(
  groupId: string,
  memberIds: string[],
  currentUserId: string,
): Promise<void> {
  const own = await keyStore.getKeyBundle();
  if (!own) {
    throw new Error('Missing local key bundle — cannot rotate group key');
  }

  const previousKeyId = await groupKeyStore.getOwnSenderKeyId(groupId);
  const keyBase64 = await generateSenderKey();
  const keyId = mintKeyId(previousKeyId);

  const envelopes = await wrapForKey(groupId, keyBase64, keyId, memberIds, currentUserId, own);
  if (envelopes.length > 0) {
    await uploadSenderKeys(groupId, envelopes);
  }

  // Persist only after a successful distribute — never discard the old key.
  await groupKeyStore.saveOwnSenderKey(groupId, keyBase64, keyId);
}

/** Encrypts a plaintext with the caller's own group sender key, tagging the current keyId. */
export async function encryptGroupMessage(
  groupId: string,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string; keyId: number }> {
  const keyBase64 = await groupKeyStore.getOwnSenderKey(groupId);
  if (!keyBase64) {
    throw new Error('No sender key established for this group');
  }
  const keyId = await groupKeyStore.getOwnSenderKeyId(groupId);
  if (keyId === null) {
    throw new Error('No keyId established for this group sender key');
  }
  const key = await importSenderKey(keyBase64);
  const { ciphertext, iv } = await encryptMessage(key, plaintext);
  return { ciphertext, iv, keyId };
}

/**
 * Decrypts a group message from `senderId`. Lazily fetches and unwraps the
 * sender's key the first time it is seen (using the caller's identity private
 * key and the sender's identity public key), caching it on-device thereafter.
 * The message's `keyId` is compared to the cached one: a mismatch (the sender
 * rotated after a member left) forces a re-fetch and overwrites the stale copy,
 * since the stale key would fail AES-GCM (Bug 1).
 */
export async function decryptGroupMessage(
  groupId: string,
  senderId: string,
  keyId: number,
  ciphertext: string,
  iv: string,
): Promise<string> {
  let keyBase64 = await groupKeyStore.getReceivedSenderKey(groupId, senderId);
  const cachedKeyId = await groupKeyStore.getReceivedSenderKeyId(groupId, senderId);
  if (!keyBase64 || cachedKeyId !== keyId) {
    const own = await keyStore.getKeyBundle();
    if (!own) {
      throw new Error('Missing local key bundle — cannot decrypt group message');
    }
    const senderBundle = await fetchKeyBundle(senderId);
    if (!senderBundle?.identityKey?.publicKey) {
      throw new Error('Missing sender identity key');
    }
    const envelope = await fetchSenderKey(groupId, senderId);
    const senderKeyBytes = await unwrapSenderKey(
      { ciphertext: envelope.ciphertext, iv: envelope.iv },
      own.identityKey.privateKey,
      senderBundle.identityKey.publicKey,
    );
    keyBase64 = bytesToBase64(senderKeyBytes);
    await groupKeyStore.saveReceivedSenderKey(groupId, senderId, keyBase64, keyId);
  }
  const key = await importSenderKey(keyBase64);
  return decryptMessage(key, ciphertext, iv);
}
