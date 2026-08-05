/**
 * REAL-crypto round-trip test.
 *
 * Unlike the rest of the suite, this file deliberately does NOT mock
 * `./crypto`. It exercises the actual pure-JS (@noble) key generation,
 * signing/verification and AES-GCM encryption so that a regression of the
 * class of bug fixed here — private key material leaking off-device, a fake
 * signature, or the server being able to decrypt — would fail CI rather than
 * relying on human code review.
 *
 * The "server" is modelled as a relay that only ever sees the public bundle and
 * the ciphertext envelope; it is given no private key and must not be able to
 * decrypt.
 */
import {
  generateE2eeKeys,
  getPublicKeyBundle,
  buildSharedSecret,
  encryptMessage,
  decryptMessage,
  verifyPreKeySignature,
} from './crypto';
import type { E2eeKeyBundle, E2eePublicKeyBundle } from './types';

/** Recursively collects every string value found under keys that look private. */
function findPrivateMaterial(obj: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const here = path ? `${path}.${key}` : key;
      if (/priv/i.test(key)) {
        hits.push(here);
      }
      hits.push(...findPrivateMaterial(value, here));
    }
  }
  return hits;
}

describe('E2EE 1:1 real crypto round-trip', () => {
  let alice: E2eeKeyBundle;
  let bob: E2eeKeyBundle;

  beforeAll(async () => {
    // Small pre-key counts keep the test fast while still generating real keys.
    alice = await generateE2eeKeys(1, 1);
    bob = await generateE2eeKeys(1, 1);
  }, 20000);

  it('generates real key material that can sign and verify the signed pre-key', async () => {
    const ok = await verifyPreKeySignature(
      alice.identityKey.signingPublicKey,
      alice.signedPreKey.publicKey,
      alice.signedPreKey.signature,
    );
    expect(ok).toBe(true);
  });

  it('rejects a tampered signed-pre-key (MITM detection)', async () => {
    const tamperedOk = await verifyPreKeySignature(
      alice.identityKey.signingPublicKey,
      bob.signedPreKey.publicKey, // wrong public key for Alice's signature
      alice.signedPreKey.signature,
    );
    expect(tamperedOk).toBe(false);
  });

  it('the public bundle carries no private key material', () => {
    const publicBundle: E2eePublicKeyBundle = getPublicKeyBundle(alice);
    const leaks = findPrivateMaterial(publicBundle);
    expect(leaks).toEqual([]);
    // The signature field is present but is a signature, not a private key.
    expect(publicBundle.signedPreKey.signature).toBe(alice.signedPreKey.signature);
    expect(JSON.stringify(publicBundle)).not.toContain(alice.identityKey.privateKey);
    expect(JSON.stringify(publicBundle)).not.toContain(alice.identityKey.signingPrivateKey);
    expect(JSON.stringify(publicBundle)).not.toContain(alice.signedPreKey.privateKey);
  });

  it('encrypts on one device, relays ciphertext only, and decrypts on the other', async () => {
    const plaintext = 'Akwaaba — this must never be readable by the server';

    // Alice uploads her PUBLIC bundle; Bob uploads his. The relay only ever
    // holds these public bundles.
    const alicePublic = getPublicKeyBundle(alice);
    const bobPublic = getPublicKeyBundle(bob);

    // Alice derives the shared secret from HER private key + Bob's PUBLIC key.
    const aliceSecret = await buildSharedSecret(
      alice.identityKey.privateKey,
      bobPublic.identityKey.publicKey,
    );
    const envelope = await encryptMessage(aliceSecret, plaintext);

    // The relay transports only { ciphertext, iv } — no key material.
    const relayed = { ciphertext: envelope.ciphertext, iv: envelope.iv };
    expect(relayed.ciphertext).not.toContain(plaintext);

    // Bob derives the same shared secret from HIS private key + Alice's PUBLIC key.
    const bobSecret = await buildSharedSecret(
      bob.identityKey.privateKey,
      alicePublic.identityKey.publicKey,
    );
    const decrypted = await decryptMessage(bobSecret, relayed.ciphertext, relayed.iv);

    expect(decrypted).toBe(plaintext);
  });

  it('a third party holding only public bundles cannot decrypt', async () => {
    const plaintext = 'secret';
    const aliceSecret = await buildSharedSecret(
      alice.identityKey.privateKey,
      getPublicKeyBundle(bob).identityKey.publicKey,
    );
    const envelope = await encryptMessage(aliceSecret, plaintext);

    // An eavesdropper (e.g. the server) generates its own keypair — the only
    // private key it can ever hold — and tries to derive the session key from
    // the public bundles. It gets a different secret and cannot decrypt.
    const eve = await generateE2eeKeys(1, 1);
    const eveSecret = await buildSharedSecret(
      eve.identityKey.privateKey,
      getPublicKeyBundle(alice).identityKey.publicKey,
    );

    await expect(decryptMessage(eveSecret, envelope.ciphertext, envelope.iv)).rejects.toBeDefined();
  }, 20000);
});
