import { RecoveryBackupModel, type RecoveryBackupDoc } from './recoveryBackup.model.js';
import type { RecoveryKdfParams } from './recoveryBackup.model.js';

export interface RecoveryBackupData {
  ciphertext: string;
  iv: string;
  salt: string;
  kdf: RecoveryKdfParams;
  version: number;
}

export const recoveryBackupRepository = {
  /** Active (non-deleted) backup for a user, or null. */
  async findByUserId(userId: string): Promise<RecoveryBackupDoc | null> {
    return RecoveryBackupModel.findOne({ userId, deletedAt: null }).lean().exec();
  },

  /**
   * Creates or replaces a user's backup. Reactivates a previously soft-deleted
   * document (clears `deletedAt`) so there is always at most one row per user.
   */
  async upsert(userId: string, data: RecoveryBackupData): Promise<RecoveryBackupDoc> {
    return RecoveryBackupModel.findOneAndUpdate(
      { userId },
      { $set: { ...data, deletedAt: null } },
      { upsert: true, new: true },
    )
      .lean()
      .exec();
  },

  /** Soft-deletes the active backup. Returns true if one was disabled. */
  async softDelete(userId: string): Promise<boolean> {
    const res = await RecoveryBackupModel.updateOne(
      { userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    ).exec();
    return res.modifiedCount > 0;
  },
};
