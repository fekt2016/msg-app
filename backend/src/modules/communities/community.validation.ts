import { z } from 'zod';

const COMMUNITY_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
const MEMBER_ROLES = ['MODERATOR', 'MEMBER'] as const;

export const createCommunitySchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long'),
    description: z.string().trim().max(500, 'Description is too long').optional(),
    visibility: z.enum(COMMUNITY_VISIBILITIES).optional(),
  })
  .strict();

export const updateCommunitySchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long').optional(),
    description: z.string().trim().max(500, 'Description is too long').optional(),
    visibility: z.enum(COMMUNITY_VISIBILITIES).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.visibility !== undefined,
    {
      message: 'At least one field to update is required',
    },
  );

export const updateRoleSchema = z
  .object({
    role: z.enum(MEMBER_ROLES),
  })
  .strict();

export const listCommunitiesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const communityIdentifierParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
  })
  .strict();

export const memberParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
    userId: z.string().min(1),
  })
  .strict();

export type CreateCommunityBody = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityBody = z.infer<typeof updateCommunitySchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>;
