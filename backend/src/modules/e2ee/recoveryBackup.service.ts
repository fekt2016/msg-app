import { AppError } from '../../errors/AppError.js';
import { logger } from '../../config/logger.js';
import { recoveryBackupRepository, type RecoveryBackupData } from './recoveryBackup.repository.js';

// ---------------------------------------------------------------------------
// Server-blind storage for the encrypted E2EE identity backup. This service
// only accepts, stores, and returns an opaque ciphertext blob plus its
// (non-secret) KDF parameters. It never derives a key, never sees the recovery
// phrase, and never decrypts anything — see recoveryBackup.model.ts.
// ---------------------------------------------------------------------------

export interface RecoveryBackupOutput extends RecoveryBackupData {
  updatedAt: Date;
}

export interface RecoveryBackupStatus {
  exists: boolean;
  updatedAt: Date | null;
}

export const recoveryBackupService = {
  /** Creates or replaces the caller's encrypted backup. */
  async put(userId: string, data: RecoveryBackupData): Promise<{ updatedAt: Date }> {
    const doc = await recoveryBackupRepository.upsert(userId, data);
    logger.info({ userId, version: data.version }, 'E2EE recovery backup stored');
    return { updatedAt: doc.updatedAt };
  },

  /** Returns the caller's encrypted backup for restore, or 404 if none exists. */
  async get(userId: string): Promise<RecoveryBackupOutput> {
    const doc = await recoveryBackupRepository.findByUserId(userId);
    if (!doc) {
      throw new AppError(404, 'RECOVERY_BACKUP_NOT_FOUND', 'No recovery backup exists');
    }
    return {
      ciphertext: doc.ciphertext,
      iv: doc.iv,
      salt: doc.salt,
      kdf: doc.kdf,
      version: doc.version,
      updatedAt: doc.updatedAt,
    };
  },

  /** Lightweight existence check for UI — never ships the ciphertext blob. */
  async status(userId: string): Promise<RecoveryBackupStatus> {
    const doc = await recoveryBackupRepository.findByUserId(userId);
    return { exists: Boolean(doc), updatedAt: doc?.updatedAt ?? null };
  },

  /** Disables (soft-deletes) the caller's backup. Idempotent. */
  async remove(userId: string): Promise<void> {
    const removed = await recoveryBackupRepository.softDelete(userId);
    logger.info({ userId, removed }, 'E2EE recovery backup disabled');
  },
};
