import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long'),
    memberIds: z.array(objectId).max(255).optional(),
  })
  .strict();

export const addMembersSchema = z
  .object({
    memberIds: z.array(objectId).min(1, 'At least one member is required').max(255),
  })
  .strict();

export const groupIdParamSchema = z
  .object({
    groupId: objectId,
  })
  .strict();

export const groupMemberParamSchema = z
  .object({
    groupId: objectId,
    userId: objectId,
  })
  .strict();

export const listMembersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type CreateGroupBody = z.infer<typeof createGroupSchema>;
export type AddMembersBody = z.infer<typeof addMembersSchema>;
