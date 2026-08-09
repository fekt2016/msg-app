import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const STORY_MEDIA_TYPES = ['IMAGE', 'VIDEO'] as const;

export type StoryMediaType = (typeof STORY_MEDIA_TYPES)[number];

const storySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    media: {
      publicId: { type: String, required: true },
      url: { type: String, required: true },
      width: { type: Number },
      height: { type: Number },
      resourceType: { type: String, enum: STORY_MEDIA_TYPES, required: true },
      durationMs: { type: Number },
    },
    caption: { type: String, trim: true, maxlength: 500, default: '' },
    expiresAt: { type: Date, required: true },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// TTL index: expired stories are hard-purged by MongoDB (stories are ephemeral
// content — a documented exception to the soft-delete default, CLAUDE.md §9).
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ authorId: 1, expiresAt: 1 });
storySchema.index({ authorId: 1, createdAt: -1 });

export type StoryDoc = InferSchemaType<typeof storySchema> & { _id: Types.ObjectId };
export const StoryModel: Model<StoryDoc> = model<StoryDoc>('Story', storySchema);
