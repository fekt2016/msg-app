import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const channelPostSchema = new Schema(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    images: [
      {
        publicId: { type: String, required: true },
        url: { type: String, required: true },
        alt: { type: String, default: '' },
        order: { type: Number, default: 0 },
      },
    ],
    reactionCounts: { type: Map, of: Number, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Feed reads filter {channelId, deletedAt: null} and sort {createdAt: -1, _id: -1}
// for cursor pagination — the index matches that exact compound path.
channelPostSchema.index({ channelId: 1, deletedAt: 1, createdAt: -1, _id: -1 });
channelPostSchema.index({ authorId: 1 });

export type ChannelPostDoc = InferSchemaType<typeof channelPostSchema> & {
  _id: Types.ObjectId;
};
export const ChannelPostModel: Model<ChannelPostDoc> = model<ChannelPostDoc>(
  'ChannelPost',
  channelPostSchema,
);
