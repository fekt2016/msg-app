import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const CHANNEL_ROLES = ['OWNER', 'ADMIN', 'SUBSCRIBER'] as const;

export type ChannelRole = (typeof CHANNEL_ROLES)[number];

const channelSubscriberSchema = new Schema(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: CHANNEL_ROLES, default: 'SUBSCRIBER' },
    mutedAt: { type: Date, default: null },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

channelSubscriberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
channelSubscriberSchema.index({ channelId: 1, role: 1 });
channelSubscriberSchema.index({ userId: 1 });

export type ChannelSubscriberDoc = InferSchemaType<typeof channelSubscriberSchema> & {
  _id: Types.ObjectId;
};
export const ChannelSubscriberModel: Model<ChannelSubscriberDoc> = model<ChannelSubscriberDoc>(
  'ChannelSubscriber',
  channelSubscriberSchema,
);
