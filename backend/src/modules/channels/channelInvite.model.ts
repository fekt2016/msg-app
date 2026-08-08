import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const INVITE_ROLES = ['SUBSCRIBER', 'ADMIN'] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

const channelInviteSchema = new Schema(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: INVITE_ROLES, default: 'SUBSCRIBER' },
    expiresAt: { type: Date, required: true },
    usedCount: { type: Number, default: 0 },
    maxUses: { type: Number, default: 1 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

channelInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
channelInviteSchema.index({ channelId: 1, revokedAt: 1 });

export type ChannelInviteDoc = InferSchemaType<typeof channelInviteSchema> & {
  _id: Types.ObjectId;
};
export const ChannelInviteModel: Model<ChannelInviteDoc> = model<ChannelInviteDoc>(
  'ChannelInvite',
  channelInviteSchema,
);
