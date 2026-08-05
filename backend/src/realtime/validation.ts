import { z } from 'zod';

export const chatMessageNewSchema = z.object({
  recipientId: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export const chatMessageDeliveredSchema = z.object({
  senderId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export const chatMessageReadSchema = z.object({
  senderId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

// `groupId` is a real Group `_id` — validated as an ObjectId so the membership
// lookup against `group_members` never hits a Mongoose CastError.
const groupId = z.string().regex(/^[a-f\d]{24}$/i);

export const groupSubscribeSchema = z.object({
  groupId,
});

export const chatGroupMessageNewSchema = z.object({
  groupId,
  keyId: z.number().int().positive(),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export const chatGroupAckSchema = z.object({
  groupId,
  timestamp: z.number().int().positive(),
});

export type ChatMessageNewPayload = z.infer<typeof chatMessageNewSchema>;
export type ChatMessageDeliveredPayload = z.infer<typeof chatMessageDeliveredSchema>;
export type ChatMessageReadPayload = z.infer<typeof chatMessageReadSchema>;
export type GroupSubscribePayload = z.infer<typeof groupSubscribeSchema>;
export type ChatGroupMessageNewPayload = z.infer<typeof chatGroupMessageNewSchema>;
export type ChatGroupAckPayload = z.infer<typeof chatGroupAckSchema>;
