/**
 * REAL group sender-key crypto (pure-JS @noble, no mocks).
 *
 * Verifies that a sender key wrapped for a recipient can be unwrapped by that
 * recipient and no one else, and that the wrapped envelope is transport-safe.
 */
import {
  generateSenderKey,
  importSenderKey,
  wrapSenderKeyForRecipient,
  unwrapSenderKey,
} from './groupCrypto';
import { generateE2eeKeys } from './crypto';
import { base64ToBytes } from './base64';
import type { E2eeKeyBundle } from './types';

describe('group sender-key crypto', () => {
  let alice: E2eeKeyBundle;
  let bob: E2eeKeyBundle;

  beforeAll(async () => {
    alice = await generateE2eeKeys(1, 1);
    bob = await generateE2eeKeys(1, 1);
  }, 20000);

  it('generates a 32-byte sender key', () => {
    const key = generateSenderKey();
    expect(base64ToBytes(key)).toHaveLength(32);
  });

  it('importSenderKey decodes to the raw key bytes', () => {
    const key = generateSenderKey();
    expect(importSenderKey(key)).toEqual(base64ToBytes(key));
  });

  it('wraps a sender key for a recipient who can unwrap it', async () => {
    const senderKey = base64ToBytes(generateSenderKey());

    const envelope = await wrapSenderKeyForRecipient(
      senderKey,
      alice.identityKey.privateKey,
      bob.identityKey.publicKey,
    );
    // The envelope is ciphertext only — the raw key never appears in it.
    expect(envelope.ciphertext).not.toContain(String.fromCharCode(...senderKey.slice(0, 4)));

    const unwrapped = await unwrapSenderKey(
      { ciphertext: envelope.ciphertext, iv: envelope.iv },
      bob.identityKey.privateKey,
      alice.identityKey.publicKey,
    );
    expect(unwrapped).toEqual(senderKey);
  });

  it('a different recipient cannot unwrap the envelope', async () => {
    const eve = await generateE2eeKeys(1, 1);
    const senderKey = base64ToBytes(generateSenderKey());
    const envelope = await wrapSenderKeyForRecipient(
      senderKey,
      alice.identityKey.privateKey,
      bob.identityKey.publicKey,
    );

    await expect(
      unwrapSenderKey(
        { ciphertext: envelope.ciphertext, iv: envelope.iv },
        eve.identityKey.privateKey,
        alice.identityKey.publicKey,
      ),
    ).rejects.toBeDefined();
  }, 20000);
});
