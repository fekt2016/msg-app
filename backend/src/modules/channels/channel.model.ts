import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const CHANNEL_VISIBILITY = ['PUBLIC', 'PRIVATE'] as const;

export type ChannelVisibility = (typeof CHANNEL_VISIBILITY)[number];

const channelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    slug: { type: String, required: true, trim: true, unique: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    avatar: {
      publicId: { type: String },
      url: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    visibility: { type: String, enum: CHANNEL_VISIBILITY, default: 'PUBLIC' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscriberCount: { type: Number, default: 0 },
    postCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

channelSchema.index({ visibility: 1, deletedAt: 1, subscriberCount: -1 });
channelSchema.index({ ownerId: 1, deletedAt: 1 });

export type ChannelDoc = InferSchemaType<typeof channelSchema> & { _id: Types.ObjectId };
export const ChannelModel: Model<ChannelDoc> = model<ChannelDoc>('Channel', channelSchema);
