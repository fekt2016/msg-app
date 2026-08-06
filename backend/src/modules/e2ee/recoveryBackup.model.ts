import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Encrypted E2EE identity backup (recovery-key flow).
//
// The server stores an OPAQUE ciphertext blob only: the user's private key
// bundle is encrypted on-device with a key derived (Argon2id) from a 24-word
// BIP39 recovery phrase the user alone holds. The salt and KDF parameters are
// NOT secret — they are required to reproduce the derivation on a new device
// and are safe to store. The recovery phrase and the plaintext bundle never
// reach the server, so this collection cannot be used to decrypt a user's
// messages. Any change that would let the server see the phrase, the derived
// key, or the plaintext bundle violates CLAUDE.md §5 and must be rejected.
// ---------------------------------------------------------------------------

/** KDF parameters needed to re-derive the backup key from the phrase on restore. */
export interface RecoveryKdfParams {
  /** Only Argon2id is supported for v1 backups. */
  algorithm: 'argon2id';
  /** Argon2 memory cost in KiB. */
  memoryKiB: number;
  /** Argon2 time cost (number of iterations/passes). */
  iterations: number;
  /** Argon2 parallelism (lanes). */
  parallelism: number;
}

const kdfParamsSchema = new Schema<RecoveryKdfParams>(
  {
    algorithm: { type: String, required: true, enum: ['argon2id'] },
    memoryKiB: { type: Number, required: true },
    iterations: { type: Number, required: true },
    parallelism: { type: Number, required: true },
  },
  { _id: false },
);

const recoveryBackupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** AES-256-GCM ciphertext of the JSON-serialized private key bundle (base64). */
    ciphertext: { type: String, required: true },
    /** AES-GCM nonce (12 bytes, base64). */
    iv: { type: String, required: true },
    /** KDF salt (base64) — non-secret, needed to re-derive the key on restore. */
    salt: { type: String, required: true },
    kdf: { type: kdfParamsSchema, required: true },
    /** Backup format version, for forward migration. */
    version: { type: Number, required: true, default: 1 },
    /** Soft-delete: a disabled backup is retained but never served (CLAUDE.md §11). */
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One backup document per user. Reads always filter `deletedAt: null`, so a
// soft-deleted backup is invisible and a fresh PUT reactivates the same doc.
recoveryBackupSchema.index({ userId: 1 }, { unique: true });

export type RecoveryBackupDoc = InferSchemaType<typeof recoveryBackupSchema> & {
  _id: Types.ObjectId;
};
export const RecoveryBackupModel: Model<RecoveryBackupDoc> = model<RecoveryBackupDoc>(
  'RecoveryBackup',
  recoveryBackupSchema,
  'e2ee_recovery_backups',
);
