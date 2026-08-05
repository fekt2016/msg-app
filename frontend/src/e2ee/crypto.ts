import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import type {
  E2eeKeyBundle,
  E2eeIdentityKey,
  E2eeSignedPreKey,
  E2eePreKey,
  E2eeOneTimePreKey,
  E2eePublicKeyBundle,
} from './types.js';
import { bytesToBase64, base64ToBytes } from './base64';

// ---------------------------------------------------------------------------
// Crypto backend: pure-JS @noble (curves/ciphers/hashes).
//
// The app runs in Hermes / Expo Go, which has no `crypto.subtle`, so the E2EE
// primitives are implemented with the audited @noble libraries instead of
// WebCrypto. This runs identically on-device and in Node (so it is testable),
// and needs no native module.
//
// Message key agreement: ECDH P-256 (shared secret = the 32-byte X coordinate,
// matching WebCrypto's deriveBits, used directly as the AES-256-GCM key).
// Signed-pre-key authentication: ECDSA P-256 over SHA-256. As with the previous
// WebCrypto design the identity is two keypairs — an ECDH agreement key and an
// ECDSA signing key — kept separate so a leak of one role does not imply the
// other.
//
// Serialization: base64 of raw bytes — private/secret keys are the 32-byte
// scalar, public keys the 65-byte uncompressed point, signatures 64-byte
// compact (r||s). There is no key material predating this scheme to migrate.
// ---------------------------------------------------------------------------

interface RawKeyPair {
  publicKey: string; // base64 of 65-byte uncompressed point
  privateKey: string; // base64 of 32-byte secret scalar
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // getRandomValues is provided natively in Node (tests) and polyfilled from
  // expo-crypto on-device (see src/cryptoPolyfill.ts).
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function generateEcKeyPair(): RawKeyPair {
  const secretKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(secretKey, false); // uncompressed
  return { publicKey: bytesToBase64(publicKey), privateKey: bytesToBase64(secretKey) };
}

function generatePreKeys(startId: number, count: number): E2eePreKey[] {
  const keys: E2eePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({ keyId: startId + i, publicKey: generateEcKeyPair().publicKey });
  }
  return keys;
}

function generateOneTimePreKeys(startId: number, count: number): E2eeOneTimePreKey[] {
  const keys: E2eeOneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({ keyId: startId + i, publicKey: generateEcKeyPair().publicKey });
  }
  return keys;
}

/**
 * Signs a signed-pre-key's public key bytes with the identity signing private
 * key, producing an authenticating signature. Runs entirely on-device. The
 * returned value is a signature (64-byte compact, base64) — never a private key.
 */
export async function signPreKeyPublicKey(
  signingPrivateKeyBase64: string,
  preKeyPublicKeyBase64: string,
): Promise<string> {
  const secretKey = base64ToBytes(signingPrivateKeyBase64);
  const digest = sha256(base64ToBytes(preKeyPublicKeyBase64));
  // noble v2 `sign` returns the 64-byte compact (r||s) signature directly.
  const signature = p256.sign(digest, secretKey, { prehash: false });
  return bytesToBase64(signature);
}

/**
 * Verifies a signed-pre-key signature against a peer's identity signing public
 * key. Recipients MUST call this before trusting a fetched signed pre-key.
 * Returns false (never throws) for malformed input.
 */
export async function verifyPreKeySignature(
  signingPublicKeyBase64: string,
  preKeyPublicKeyBase64: string,
  signatureBase64: string,
): Promise<boolean> {
  try {
    const publicKey = base64ToBytes(signingPublicKeyBase64);
    const digest = sha256(base64ToBytes(preKeyPublicKeyBase64));
    const signature = base64ToBytes(signatureBase64);
    return p256.verify(signature, digest, publicKey, { prehash: false });
  } catch {
    return false;
  }
}

/**
 * Generates a complete key bundle ON-DEVICE. Every private half stays in the
 * returned local bundle (to be persisted only in secure storage). Nothing here
 * is transmitted directly — call getPublicKeyBundle() to produce the
 * public-only shape that is uploaded to the server.
 */
export async function generateE2eeKeys(
  preKeyCount = 100,
  oneTimePreKeyCount = 100,
): Promise<E2eeKeyBundle> {
  const identityAgreement = generateEcKeyPair();
  const identitySigning = generateEcKeyPair();
  const signedPreKeyPair = generateEcKeyPair();
  const preKeys = generatePreKeys(1, preKeyCount);
  const oneTimePreKeys = generateOneTimePreKeys(1001, oneTimePreKeyCount);

  const identityKey: E2eeIdentityKey = {
    publicKey: identityAgreement.publicKey,
    privateKey: identityAgreement.privateKey,
    signingPublicKey: identitySigning.publicKey,
    signingPrivateKey: identitySigning.privateKey,
  };

  const signedPreKey: E2eeSignedPreKey = {
    keyId: 1,
    publicKey: signedPreKeyPair.publicKey,
    privateKey: signedPreKeyPair.privateKey,
    // A real ECDSA signature over the signed pre-key's public key bytes — NOT a
    // private key. Authenticates the pre-key against the identity signing key.
    signature: await signPreKeyPublicKey(identitySigning.privateKey, signedPreKeyPair.publicKey),
  };

  return { identityKey, signedPreKey, preKeys, oneTimePreKeys };
}

/**
 * Derives the ECDH shared secret and returns the 32-byte AES-256-GCM key (the
 * shared point's X coordinate). Callers pass the result straight to
 * encryptMessage/decryptMessage.
 */
export async function buildSharedSecret(
  ourPrivateKeyBase64: string,
  theirPublicKeyBase64: string,
): Promise<Uint8Array> {
  const secretKey = base64ToBytes(ourPrivateKeyBase64);
  const publicKey = base64ToBytes(theirPublicKeyBase64);
  const shared = p256.getSharedSecret(secretKey, publicKey); // 33-byte compressed point
  return shared.slice(1, 33); // 32-byte X coordinate === WebCrypto deriveBits(256)
}

export async function encryptMessage(
  aesKey: Uint8Array,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const nonce = randomBytes(12);
  const ciphertext = gcm(aesKey, nonce).encrypt(new TextEncoder().encode(plaintext));
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(nonce) };
}

export async function decryptMessage(
  aesKey: Uint8Array,
  ciphertextBase64: string,
  ivBase64: string,
): Promise<string> {
  const nonce = base64ToBytes(ivBase64);
  const plaintext = gcm(aesKey, nonce).decrypt(base64ToBytes(ciphertextBase64));
  return new TextDecoder().decode(plaintext);
}

/**
 * Strips all private key material from a local key bundle, yielding the
 * public-only bundle that is safe to upload to the server. This is the ONLY
 * function whose output should ever be passed to the key-upload API.
 */
export function getPublicKeyBundle(bundle: E2eeKeyBundle): E2eePublicKeyBundle {
  return {
    identityKey: {
      publicKey: bundle.identityKey.publicKey,
      signingPublicKey: bundle.identityKey.signingPublicKey,
    },
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: bundle.signedPreKey.publicKey,
      signature: bundle.signedPreKey.signature,
    },
    preKeys: bundle.preKeys.map((k) => ({ keyId: k.keyId, publicKey: k.publicKey })),
    oneTimePreKeys: bundle.oneTimePreKeys.map((k) => ({ keyId: k.keyId, publicKey: k.publicKey })),
  };
}
