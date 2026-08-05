import { z } from 'zod';

export const preKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: z.string().min(1),
});

export const signedPreKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: z.string().min(1),
  // A real ECDSA signature over the signed pre-key's public key bytes — never a
  // private key.
  signature: z.string().min(1),
});

// Public identity only. There is deliberately no privateKey field: the server
// never receives or stores private key material.
export const identityKeySchema = z.object({
  publicKey: z.string().min(1),
  signingPublicKey: z.string().min(1),
});

export const oneTimePreKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: z.string().min(1),
});

/** The public key bundle a client uploads. Public keys + a signature only. */
export const publicKeyBundleSchema = z.object({
  identityKey: identityKeySchema,
  signedPreKey: signedPreKeySchema,
  preKeys: z.array(preKeySchema).max(100),
  oneTimePreKeys: z.array(oneTimePreKeySchema).max(100),
});

export const preKeyUploadSchema = z.object({
  preKeys: z.array(preKeySchema).max(100),
});

export const rotateSignedPreKeySchema = z.object({
  signedPreKey: signedPreKeySchema,
});

export const rotateOneTimePreKeysSchema = z.object({
  oneTimePreKeys: z.array(oneTimePreKeySchema).max(100),
});

export const messageEnvelopeSchema = z.object({
  recipientId: z.string().min(1),
  ciphertext: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export const consumeOneTimePreKeysSchema = z.object({
  keyIds: z.array(z.number().int().nonnegative()).min(1),
});

export type PreKeyBody = z.infer<typeof preKeySchema>;
export type SignedPreKeyBody = z.infer<typeof signedPreKeySchema>;
export type IdentityKeyBody = z.infer<typeof identityKeySchema>;
export type OneTimePreKeyBody = z.infer<typeof oneTimePreKeySchema>;
export type PublicKeyBundleBody = z.infer<typeof publicKeyBundleSchema>;
export type PreKeyUploadBody = z.infer<typeof preKeyUploadSchema>;
export type RotateSignedPreKeyBody = z.infer<typeof rotateSignedPreKeySchema>;
export type RotateOneTimePreKeysBody = z.infer<typeof rotateOneTimePreKeysSchema>;
export type MessageEnvelopeBody = z.infer<typeof messageEnvelopeSchema>;
export type ConsumeOneTimePreKeysBody = z.infer<typeof consumeOneTimePreKeysSchema>;
