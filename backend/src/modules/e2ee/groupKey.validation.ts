import { z } from 'zod';
import { GROUP_SENDER_KEY_MAX_ENVELOPES } from './groupSenderKey.model.js';

// `groupId` is a real Group `_id` (see groupKey.service authorization note) — it
// must be a Mongo ObjectId so membership resolves against `group_members`
// without a Mongoose CastError.
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid group id');

export const groupIdParamSchema = z.object({
  groupId: objectId,
});

export const senderKeyParamSchema = z.object({
  groupId: objectId,
  senderId: z.string().min(1),
});

export const senderKeyEnvelopeSchema = z.object({
  recipientId: z.string().min(1),
  keyId: z.number().int().positive(),
  ciphertext: z.string().min(1).max(5000),
  iv: z.string().min(1).max(200),
});

export const uploadSenderKeysSchema = z.object({
  envelopes: z.array(senderKeyEnvelopeSchema).min(1).max(GROUP_SENDER_KEY_MAX_ENVELOPES),
});

export type GroupIdParam = z.infer<typeof groupIdParamSchema>;
export type SenderKeyParam = z.infer<typeof senderKeyParamSchema>;
export type SenderKeyEnvelopeBody = z.infer<typeof senderKeyEnvelopeSchema>;
export type UploadSenderKeysBody = z.infer<typeof uploadSenderKeysSchema>;
