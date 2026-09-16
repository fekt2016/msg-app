import { getRecoveryBackupStatus } from './recoverySession';

// ---------------------------------------------------------------------------
// Decides which recovery-backup nudge (if any) the app should surface right
// after an E2EE key bootstrap. This is the "wiring" that turns the recovery
// feature from a buried Profile option into something the user is actually
// offered at the one moment it matters: when this device just took on a
// brand-new identity.
// ---------------------------------------------------------------------------

export type RecoveryPrompt =
  // Nothing to surface.
  | 'none'
  // This device generated a fresh identity and the user has NO server backup —
  // nudge them to set up a recovery phrase so a future device change is
  // survivable.
  | 'backup'
  // This device generated a fresh identity but the user DOES have a server
  // backup — almost certainly a new device / reinstall. Offer to restore their
  // history instead of silently starting over on the new key.
  | 'restore';

/**
 * Resolves the recovery nudge from the key-bootstrap outcome. Only a freshly
 * created identity is worth prompting about; an existing, already-registered
 * identity is left alone (no nagging on every launch). Best-effort — a failed
 * status lookup resolves to `none` so a transient network error never blocks or
 * spams the user. Reads only the PUBLIC backup-existence flag; it never touches
 * key material.
 */
export async function resolveRecoveryPrompt(created: boolean): Promise<RecoveryPrompt> {
  if (!created) return 'none';
  try {
    const status = await getRecoveryBackupStatus();
    return status.exists ? 'restore' : 'backup';
  } catch {
    return 'none';
  }
}
