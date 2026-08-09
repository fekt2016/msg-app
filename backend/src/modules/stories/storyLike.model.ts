import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const storyLikeSchema = new Schema(
  {
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the story so a like TTL-purges at the same instant as its
    // story — never outlives it.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One like per user per story — the idempotency boundary for like/unlike.
storyLikeSchema.index({ storyId: 1, userId: 1 }, { unique: true });
storyLikeSchema.index({ userId: 1 });
storyLikeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type StoryLikeDoc = InferSchemaType<typeof storyLikeSchema> & { _id: Types.ObjectId };
export const StoryLikeModel: Model<StoryLikeDoc> = model<StoryLikeDoc>(
  'StoryLike',
  storyLikeSchema,
);
