import { buildSharedSecret, encryptMessage, decryptMessage } from './crypto';
import { bytesToBase64, base64ToBytes } from './base64';

// Group sender-key crypto (pure-JS @noble, via ./crypto).
//
// Each group member has a symmetric "sender key" (32 random bytes) used to
// encrypt their own messages to the whole group. To share it, the sender key is
// wrapped pairwise: encrypted with AES-GCM under the ECDH shared secret between
// the sender's and the recipient's identity keys — the same agreement + AES-GCM
// primitives as 1:1 chat. The server only ever relays these ciphertext
// envelopes; it never sees a sender key.

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateSenderKey(): string {
  return bytesToBase64(randomBytes(32));
}

/** A group sender key is raw AES-256 key bytes; "importing" is just decoding. */
export function importSenderKey(base64: string): Uint8Array {
  return base64ToBytes(base64);
}

/**
 * Wraps a sender key for one recipient: encrypted with AES-GCM under the ECDH
 * shared secret between sender and recipient identity keys. The envelope carries
 * no keyId — the keyId is a session-level identity minted once per sender key
 * (see groupSession), not per-recipient.
 */
export async function wrapSenderKeyForRecipient(
  senderKeyBytes: Uint8Array,
  senderIdentityPrivateKey: string,
  recipientIdentityPublicKey: string,
): Promise<{ ciphertext: string; iv: string }> {
  const aesKey = await buildSharedSecret(senderIdentityPrivateKey, recipientIdentityPublicKey);
  const { ciphertext, iv } = await encryptMessage(aesKey, bytesToBase64(senderKeyBytes));
  return { ciphertext, iv };
}

export async function unwrapSenderKey(
  envelope: { ciphertext: string; iv: string },
  recipientIdentityPrivateKey: string,
  senderIdentityPublicKey: string,
): Promise<Uint8Array> {
  const aesKey = await buildSharedSecret(recipientIdentityPrivateKey, senderIdentityPublicKey);
  const senderKeyBase64 = await decryptMessage(aesKey, envelope.ciphertext, envelope.iv);
  return base64ToBytes(senderKeyBase64);
}
