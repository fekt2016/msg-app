import { verifyPreKeySignature } from './crypto';
import type { E2eePublicKeyBundle } from './types';

/**
 * Authenticates a fetched peer bundle before any of its public keys are used
 * for key agreement (B-1). Verifies the signed-pre-key's ECDSA signature
 * against the peer's identity signing key; a tampered/forged bundle from a
 * malicious relay fails here and the caller refuses to encrypt/decrypt with it.
 * This does not by itself pin the identity key (there is no TOFU yet — that is
 * the X3DH follow-up in TASKS.md), but it defeats a relay that cannot also
 * forge the signing key.
 */
export async function isPeerBundleVerified(bundle: E2eePublicKeyBundle): Promise<boolean> {
  const signingKey = bundle.identityKey?.signingPublicKey;
  const preKey = bundle.signedPreKey?.publicKey;
  const signature = bundle.signedPreKey?.signature;
  if (!signingKey || !preKey || !signature) return false;
  try {
    return await verifyPreKeySignature(signingKey, preKey, signature);
  } catch {
    return false;
  }
}
