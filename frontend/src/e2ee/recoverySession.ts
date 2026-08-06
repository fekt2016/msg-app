import { keyStore } from './keyStore';
import { restoreE2eeKeys } from './ensureKeys';
import { createRecoveryBackup, restoreRecoveryBackup, generateRecoveryPhrase } from './recovery';
import {
  putRecoveryBackup,
  fetchRecoveryBackup,
  fetchRecoveryBackupStatus,
  deleteRecoveryBackup,
  type RecoveryBackupStatus,
} from './recoveryApi';

// ---------------------------------------------------------------------------
// Orchestrates the recovery-backup flow across the local key store, the backup
// crypto, and the server API. Screens/hooks call these; they never touch the
// raw crypto or SecureStore directly.
// ---------------------------------------------------------------------------

/** Thrown by enableRecoveryBackup when the device holds no identity to back up. */
export class NoLocalIdentityError extends Error {
  constructor() {
    super('This device has no E2EE identity to back up yet');
    this.name = 'NoLocalIdentityError';
  }
}

/** Generates a fresh phrase for the setup screen to display before confirming. */
export function newRecoveryPhrase(): string {
  return generateRecoveryPhrase();
}

/** Whether the current user already has a backup on the server. */
export function getRecoveryBackupStatus(): Promise<RecoveryBackupStatus> {
  return fetchRecoveryBackupStatus();
}

/**
 * Encrypts the current device's identity bundle under `phrase` and uploads it.
 * Call only after the user has confirmed they saved the phrase — losing it
 * makes the backup unrecoverable by design (server-blind).
 */
export async function enableRecoveryBackup(phrase: string): Promise<void> {
  const bundle = await keyStore.getKeyBundle();
  if (!bundle) {
    throw new NoLocalIdentityError();
  }
  const blob = createRecoveryBackup(bundle, phrase);
  await putRecoveryBackup(blob);
}

/**
 * Downloads the server backup, decrypts it with `phrase`, and installs the
 * recovered identity for `userId`. Throws RecoveryPhraseError on a wrong phrase
 * and surfaces a 404 if no backup exists. After this the device can decrypt the
 * user's stored ciphertext history.
 */
export async function restoreFromRecoveryPhrase(userId: string, phrase: string): Promise<void> {
  const blob = await fetchRecoveryBackup();
  const bundle = restoreRecoveryBackup(blob, phrase);
  await restoreE2eeKeys(userId, bundle);
}

/** Disables the server-side backup. Local identity is untouched. */
export function disableRecoveryBackup(): Promise<void> {
  return deleteRecoveryBackup();
}
