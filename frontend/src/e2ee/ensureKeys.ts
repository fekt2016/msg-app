import * as SecureStore from 'expo-secure-store';
import { generateE2eeKeys, getPublicKeyBundle } from './crypto';
import { keyStore } from './keyStore';
import { uploadKeyBundle } from './e2eeApi';
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
 *  - uploads the public half once per user (guarded by a per-user persisted
 *    flag), and re-uploads whenever keys were just generated.
 *
 * Failures are surfaced to the caller (which logs/ignores) rather than thrown
 * into the auth flow — a transient upload failure must not block sign-in.
 */
export async function ensureE2eeKeysRegistered(userId: string): Promise<void> {
  const owner = await SecureStore.getItemAsync(BUNDLE_OWNER_KEY);
  let bundle = await keyStore.getKeyBundle();
  let created = false;
  if (!bundle || owner !== userId) {
    bundle = await generateE2eeKeys();
    await keyStore.saveKeyBundle(bundle);
    await SecureStore.setItemAsync(BUNDLE_OWNER_KEY, userId);
    created = true;
  }

  const alreadyUploaded = await SecureStore.getItemAsync(uploadedFlagFor(userId));
  if (created || alreadyUploaded !== 'true') {
    await uploadWithRetry(getPublicKeyBundle(bundle));
    await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
  }
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
  await keyStore.saveKeyBundle(bundle);
  await SecureStore.setItemAsync(BUNDLE_OWNER_KEY, userId);
  await uploadWithRetry(getPublicKeyBundle(bundle));
  await SecureStore.setItemAsync(uploadedFlagFor(userId), 'true');
}
