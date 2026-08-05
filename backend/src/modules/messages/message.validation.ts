import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const conversationParamSchema = z
  .object({
    userId: objectId,
  })
  .strict();

export const conversationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type ConversationParam = z.infer<typeof conversationParamSchema>;
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
