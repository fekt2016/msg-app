import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const groupMessageParamSchema = z
  .object({
    groupId: objectId,
  })
  .strict();

export const groupMessageQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type GroupMessageParam = z.infer<typeof groupMessageParamSchema>;
export type GroupMessageQuery = z.infer<typeof groupMessageQuerySchema>;
