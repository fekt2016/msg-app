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

/**
 * Ensures the caller has a sender key for `groupId` and that every other member
 * holds a pairwise-wrapped copy of it. The sender key is generated on-device and
 * never leaves it in the clear — each recipient gets it wrapped (AES-GCM over an
 * ECDH shared secret) to their identity public key. Idempotent: re-running
 * re-wraps the same key, so it is safe to call on every screen open and whenever
 * a member joins.
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
  if (!keyBase64) {
    keyBase64 = await generateSenderKey();
    await groupKeyStore.saveOwnSenderKey(groupId, keyBase64);
  }
  const keyBytes = base64ToBytes(keyBase64);

  const recipients = memberIds.filter((id) => id !== currentUserId);
  const envelopes: SenderKeyEnvelope[] = [];
  for (const recipientId of recipients) {
    const bundle = await fetchKeyBundle(recipientId).catch(() => null);
    if (!bundle?.identityKey?.publicKey) {
      continue;
    }
    const { keyId, ciphertext, iv } = await wrapSenderKeyForRecipient(
      keyBytes,
      own.identityKey.privateKey,
      bundle.identityKey.publicKey,
    );
    envelopes.push({ recipientId, keyId, ciphertext, iv, createdAt: '' });
  }

  if (envelopes.length > 0) {
    await uploadSenderKeys(groupId, envelopes);
  }
}

/**
 * Rotates the caller's sender key — used when a member leaves so departed
 * members can no longer decrypt future messages (the core forward-secrecy
 * guarantee of a sender-key scheme). Discards the old key and distributes a
 * fresh one to the remaining members.
 */
export async function rotateOwnSenderKey(
  groupId: string,
  memberIds: string[],
  currentUserId: string,
): Promise<void> {
  await groupKeyStore.clearGroup(groupId);
  await ensureOwnSenderKeyDistributed(groupId, memberIds, currentUserId);
}

/** Encrypts a plaintext with the caller's own group sender key. */
export async function encryptGroupMessage(
  groupId: string,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const keyBase64 = await groupKeyStore.getOwnSenderKey(groupId);
  if (!keyBase64) {
    throw new Error('No sender key established for this group');
  }
  const key = await importSenderKey(keyBase64);
  return encryptMessage(key, plaintext);
}

/**
 * Decrypts a group message from `senderId`. Lazily fetches and unwraps the
 * sender's key the first time it is seen (using the caller's identity private
 * key and the sender's identity public key), caching it on-device thereafter.
 */
export async function decryptGroupMessage(
  groupId: string,
  senderId: string,
  ciphertext: string,
  iv: string,
): Promise<string> {
  let keyBase64 = await groupKeyStore.getReceivedSenderKey(groupId, senderId);
  if (!keyBase64) {
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
    await groupKeyStore.saveReceivedSenderKey(groupId, senderId, keyBase64, envelope.keyId);
  }
  const key = await importSenderKey(keyBase64);
  return decryptMessage(key, ciphertext, iv);
}
