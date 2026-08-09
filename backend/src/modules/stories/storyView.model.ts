import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const storyViewSchema = new Schema(
  {
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the story at insert so a view TTL-purges at the same instant
    // as its story — never outlives it (no orphaned view rows after expiry).
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One view per user per story — the idempotency boundary for mark-viewed.
storyViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
storyViewSchema.index({ storyId: 1, createdAt: -1 });
storyViewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type StoryViewDoc = InferSchemaType<typeof storyViewSchema> & { _id: Types.ObjectId };
export const StoryViewModel: Model<StoryViewDoc> = model<StoryViewDoc>(
  'StoryView',
  storyViewSchema,
);
