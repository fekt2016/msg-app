import { z } from 'zod';

// 1-100, default 20 — the API convention cap (ROADMAP §8).
export const listNotificationsSchema = {
  query: z
    .object({
      cursor: z.string().min(1).max(200).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    })
    .strict(),
};

export const markReadSchema = {
  body: z
    .object({
      notificationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid notification id'),
    })
    .strict(),
};
