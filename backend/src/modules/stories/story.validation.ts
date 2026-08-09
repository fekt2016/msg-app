import { z } from 'zod';

// Path params that are always a Mongo `_id` are validated as an ObjectId at the
// edge so a malformed value returns 422 (not a CastError → 500 from Mongoose).
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

export const createStorySchema = z
  .object({
    caption: z.string().trim().max(500, 'Caption is too long').optional(),
  })
  .strict()
  // Multipart requests with no text fields have no body at all (req.body is
  // undefined), and a media-only story is valid — only the caption is optional.
  .optional();

export const storyIdParamSchema = z
  .object({
    storyId: objectId,
  })
  .strict();

export const feedQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type CreateStoryBody = NonNullable<z.infer<typeof createStorySchema>>;
