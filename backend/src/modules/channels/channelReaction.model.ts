import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const channelPostReactionSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'ChannelPost', required: true },
    // Denormalized for scoping: a reaction always belongs to the channel its
    // post belongs to, so a malformed postId→channelId pairing is impossible.
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, enum: REACTION_EMOJIS, required: true },
  },
  { timestamps: true },
);

// One reaction per user per post — changing emoji updates the row, enforced at
// the collection level (a racing duplicate set gets a Mongo duplicate-key error,
// never two rows).
channelPostReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });
channelPostReactionSchema.index({ postId: 1 });

export type ChannelPostReactionDoc = InferSchemaType<typeof channelPostReactionSchema> & {
  _id: Types.ObjectId;
};
export const ChannelPostReactionModel: Model<ChannelPostReactionDoc> =
  model<ChannelPostReactionDoc>('ChannelPostReaction', channelPostReactionSchema);
