import { z } from 'zod';

const CHANNEL_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
const SUBSCRIBER_ROLES = ['ADMIN', 'SUBSCRIBER'] as const;

export const createChannelSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long'),
    description: z.string().trim().max(500, 'Description is too long').optional(),
    visibility: z.enum(CHANNEL_VISIBILITIES).optional(),
  })
  .strict();

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long').optional(),
    description: z.string().trim().max(500, 'Description is too long').optional(),
    visibility: z.enum(CHANNEL_VISIBILITIES).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.visibility !== undefined,
    {
      message: 'At least one field to update is required',
    },
  );

export const updateSubscriberRoleSchema = z
  .object({
    role: z.enum(SUBSCRIBER_ROLES),
  })
  .strict();

export const listChannelsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const channelIdentifierParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
  })
  .strict();

export const subscriberParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
    userId: z.string().min(1),
  })
  .strict();

export const createInviteSchema = z
  .object({
    role: z.enum(['SUBSCRIBER', 'ADMIN']).optional(),
    expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
    maxUses: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();

export const inviteTokenParamSchema = z
  .object({
    token: z.string().min(1).max(500),
  })
  .strict();

export const inviteParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
    inviteId: z.string().min(1),
  })
  .strict();

export const decideJoinRequestSchema = z
  .object({
    action: z.enum(['APPROVE', 'DENY']),
  })
  .strict();

export const listJoinRequestsQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'APPROVED', 'DENIED']).default('PENDING'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const createPostSchema = z
  .object({
    body: z.string().trim().min(1, 'Post body cannot be empty').max(2000, 'Post body is too long'),
  })
  .strict();

export const updatePostSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Post body cannot be empty')
      .max(2000, 'Post body is too long')
      .optional(),
  })
  .strict()
  .refine((data) => data.body !== undefined, {
    message: 'At least one field to update is required',
  });

export const listPostsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().min(1).max(500).optional(),
  })
  .strict();

export const postParamSchema = z
  .object({
    identifier: z.string().min(1).max(100),
    postId: z.string().min(1),
  })
  .strict();

export type CreateChannelBody = z.infer<typeof createChannelSchema>;
export type UpdateChannelBody = z.infer<typeof updateChannelSchema>;
export type UpdateSubscriberRoleBody = z.infer<typeof updateSubscriberRoleSchema>;
export type CreateInviteBody = z.infer<typeof createInviteSchema>;
export type DecideJoinRequestBody = z.infer<typeof decideJoinRequestSchema>;
export type CreatePostBody = z.infer<typeof createPostSchema>;
export type UpdatePostBody = z.infer<typeof updatePostSchema>;
