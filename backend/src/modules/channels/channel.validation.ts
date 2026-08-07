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

export type CreateChannelBody = z.infer<typeof createChannelSchema>;
export type UpdateChannelBody = z.infer<typeof updateChannelSchema>;
export type UpdateSubscriberRoleBody = z.infer<typeof updateSubscriberRoleSchema>;
