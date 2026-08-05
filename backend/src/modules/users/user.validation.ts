import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name cannot be empty')
      .max(50, 'Display name is too long')
      .optional(),
    bio: z.string().trim().max(160, 'Bio is too long').optional(),
  })
  .strict()
  .refine((data) => data.displayName !== undefined || data.bio !== undefined, {
    message: 'At least one field to update is required',
  });

export const matchContactsSchema = z
  .object({
    phoneNumbers: z
      .array(z.string().trim().min(3).max(32))
      .min(1, 'At least one phone number is required')
      .max(2000, 'Too many phone numbers'),
  })
  .strict();

export const listChatUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type MatchContactsBody = z.infer<typeof matchContactsSchema>;
export type ListChatUsersQuery = z.infer<typeof listChatUsersQuerySchema>;
