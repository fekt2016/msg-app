import * as SecureStore from 'expo-secure-store';
import { generateE2eeKeys, getPublicKeyBundle } from './crypto';
import { keyStore } from './keyStore';
import { fetchKeyBundle, uploadKeyBundle } from './e2eeApi';
import { isApiError } from '../api/client';
import type { E2eeKeyBundle } from './types.js';

const BUNDLE_OWNER_KEY = 'e2ee_bundle_owner_user';
const UPLOAD_ATTEMPTS = 3;

function uploadedFlagFor(userId: string): string {
  // SecureStore keys allow only alphanumerics, ".", "-", "_" — no colons.
  return `e2ee_public_bundle_uploaded_${userId}`;
}

async function uploadWithRetry(publicBundle: Parameters<typeof uploadKeyBundle>[0]): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
    try {
      await uploadKeyBundle(publicBundle);
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Best-effort check of whether the server's published identity public key for
 * the CURRENT user still matches this device's identity. Compares ONLY the
 * public identity agreement key — never touches private material.
 *
 * Returns:
 *  - `true`  — directory holds our current key; no re-publish needed.
 *  - `false` — the directory holds a DIFFERENT key, or has no bundle at all
 *              (404). This is the failure mode behind "can't be decrypted on
 *              this device": a re-provisioned/second device overwrote the
 *              single stored bundle, so peers encrypt to a key we do not hold.
 *              Must re-publish.
 *  - `null`  — could not determine (offline / 5xx). The caller falls back to the
 *              local upload flag rather than hammering uploads while unreachable.
 */
async function serverHasCurrentIdentityKey(
  userId: string,
  bundle: E2eeKeyBundle,
): Promise<boolean | null> {
  try {
    const published = await fetchKeyBundle(userId);
    return published?.identityKey?.publicKey === bundle.identityKey.publicKey;
  } catch (err) {
    // 404 = the directory has no bundle for us: definitively absent, so treat it
    // as a mismatch and re-publish. Any other error is indeterminate.
    if (isApiError(err) && err.response?.status === 404) return false;
    return null;
  }
}

/**
 * Ensures the signed-in device has an E2EE identity for the CURRENT user and
 * that its PUBLIC bundle is published to the server's key directory. Without
 * this, no message can be sent or received: `keyStore.getKeyBundle()` returns
 * null (so the sender bails) and no peer can fetch the recipient's public keys.
 *
 * The identity is PER-USER, not per-device: a device that was previously used
 * by a different account holds that account's bundle + upload flag, so logging
 * in as a new user must generate a fresh identity for them and upload it —
 * otherwise the new user is silently left without any registered keys (their
 * peers report "this contact has not set up encryption yet"). The device keeps
 * one identity at a time (the current session's user), tracked via
 * `BUNDLE_OWNER_KEY`.
 *
 * Idempotent and safe to call on every session activation (login, OTP verify,
 * session restore):
 *  - generates + persists a bundle only if none exists for the current user
 *    (or the stored bundle belongs to a different user) — it never regenerates
 *    over the CURRENT user's identity (that would silently break history);
 *  - RECONCILES the directory with this device's current identity on every call:
 *    the local upload flag alone is NOT authoritative. A re-provisioned or
 *    second device can overwrite the server's single stored bundle with a key
 *    THIS device does not hold; peers then encrypt to that key and the
 *    recipient sees "This message can't be decrypted on this device". So we
 *    fetch our own published bundle and re-upload whenever the server's identity
 *    public key is absent or differs — not merely when a local flag is unset.
 *
 * Only ever uploads the PUBLIC bundle (getPublicKeyBundle) — private material
 * never leaves the device. Failures are surfaced to the caller (which logs and
 * ignores them) rather than thrown into the auth flow — a transient upload
 * failure must not block sign-in.
 */
export async function ensureE2eeKeysRegistered(userId: string): Promise<{ created: boolean }> {
  const owner = await SecureStore.getItemAsync(BUNDLE_OWNER_KEY);
  let bundle = await keyStore.getKeyBundle();
  let created = false;
  if (!bundle || owner !== userId) {
    bundle = await generateE2eeKeys();
    await keyStore.saveKeyBundle(bundle);
    await SecureStore.setItemAsync(BUNDLE_OWNER_KEY, userId);
    created = true;
  }

  if (created) {
    // Fresh identity for this user — publish it unconditionally. `created` also
    // signals the caller (AuthContext) that this device now holds a brand-new
    // identity: a moment to prompt a recovery-key backup, or — if the user
    // already has a server backup — to offer restoring their history instead.
    await uploadWithRetry(getPublicKeyBundle(bundle));
    await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
    return { created };
  }

  // Existing identity: reconcile with the directory instead of trusting the
  // local flag. This self-heals the divergence that leaves peers encrypting to
  // a stale key we can no longer use.
  const serverMatches = await serverHasCurrentIdentityKey(userId, bundle);
  const alreadyUploaded = (await SecureStore.getItemAsync(uploadedFlagFor(userId))) === 'true';

  // Re-publish when the server is known to be wrong (absent/different), OR when
  // we couldn't verify AND have no record of ever having uploaded (a
  // never-published device must still self-heal once it can reach the server).
  const needsUpload = serverMatches === false || (serverMatches === null && !alreadyUploaded);

  if (needsUpload) {
    await uploadWithRetry(getPublicKeyBundle(bundle));
    await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
  } else if (serverMatches === true && !alreadyUploaded) {
    // Directory already holds our current key (e.g. the flag was lost on
    // reinstall but the same identity was restored) — record it so the next
    // call skips the fetch/compare without a redundant upload.
    await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
  }

  return { created };
}

/**
 * Installs a bundle restored from a recovery backup as the current user's
 * on-device identity: persists it, claims device ownership for `userId` (so a
 * later ensureE2eeKeysRegistered does NOT regenerate over it), and re-publishes
 * the unchanged public keys. Re-uploading is idempotent — the server already
 * holds these public keys — but it re-marks any peer who saw a stale/absent
 * bundle. Restoring the identity is what makes the server's stored ciphertext
 * history decryptable again on the new device.
 */
export async function restoreE2eeKeys(userId: string, bundle: E2eeKeyBundle): Promise<void> {
  // Claim device ownership BEFORE persisting the bundle. If the app is killed
  // between these awaits, the next ensureE2eeKeysRegistered must not find a
  // bundle whose owner still mismatches `userId` and regenerate a fresh identity
  // over the just-restored one (silently destroying recoverable history). With
  // this order the worst case is a missing/stale bundle — retryable — never an
  // overwrite of the good restored bundle.
  await SecureStore.setItemAsync(BUNDLE_OWNER_KEY, userId);
  await keyStore.saveKeyBundle(bundle);
  await uploadWithRetry(getPublicKeyBundle(bundle));
  await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
}
