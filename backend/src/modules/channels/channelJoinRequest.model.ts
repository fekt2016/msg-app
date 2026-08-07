import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const JOIN_REQUEST_STATUS = ['PENDING', 'APPROVED', 'DENIED'] as const;

export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUS)[number];

const channelJoinRequestSchema = new Schema(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['SUBSCRIBER'], default: 'SUBSCRIBER' },
    status: { type: String, enum: JOIN_REQUEST_STATUS, default: 'PENDING' },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

channelJoinRequestSchema.index({ channelId: 1, userId: 1, status: 1 }, { unique: true });
channelJoinRequestSchema.index({ channelId: 1, status: 1 });

export type ChannelJoinRequestDoc = InferSchemaType<typeof channelJoinRequestSchema> & {
  _id: Types.ObjectId;
};
export const ChannelJoinRequestModel: Model<ChannelJoinRequestDoc> = model<ChannelJoinRequestDoc>(
  'ChannelJoinRequest',
  channelJoinRequestSchema,
);
