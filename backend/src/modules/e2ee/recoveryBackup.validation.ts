import { z } from 'zod';

// Base64 (standard alphabet, optional padding). Kept deliberately strict so the
// server rejects anything that is not a serialized ciphertext/salt/iv blob.
const base64 = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');

/**
 * KDF parameters echoed back on restore. Bounded so a client cannot force the
 * server to advertise absurd Argon2 costs to other devices. Only Argon2id v1.
 */
export const recoveryKdfSchema = z.object({
  algorithm: z.literal('argon2id'),
  // 8 MiB .. 1 GiB — covers the tuned mobile default (19 MiB) with headroom.
  memoryKiB: z.number().int().min(8192).max(1048576),
  iterations: z.number().int().min(1).max(10),
  parallelism: z.number().int().min(1).max(4),
});

/** Body for PUT /e2ee/recovery — the opaque encrypted backup + its KDF params. */
export const putRecoveryBackupSchema = z.object({
  // ~48 KB base64 ceiling: the identity bundle is a few KB; this leaves ample
  // room without allowing an unbounded upload.
  ciphertext: base64(49152),
  iv: base64(64),
  salt: base64(128),
  kdf: recoveryKdfSchema,
  version: z.number().int().positive().max(1),
});

export type RecoveryKdfBody = z.infer<typeof recoveryKdfSchema>;
export type PutRecoveryBackupBody = z.infer<typeof putRecoveryBackupSchema>;
