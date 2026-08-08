import {
  ChannelPostReactionModel,
  type ChannelPostReactionDoc,
  type ReactionEmoji,
} from './channelReaction.model.js';

export const channelReactionRepository = {
  async findReaction(postId: string, userId: string): Promise<ChannelPostReactionDoc | null> {
    return ChannelPostReactionModel.findOne({ postId, userId });
  },

  async createReaction(
    postId: string,
    channelId: string,
    userId: string,
    emoji: ReactionEmoji,
  ): Promise<ChannelPostReactionDoc> {
    return ChannelPostReactionModel.create({ postId, channelId, userId, emoji });
  },

  async setReactionEmoji(
    postId: string,
    userId: string,
    emoji: ReactionEmoji,
  ): Promise<ChannelPostReactionDoc | null> {
    return ChannelPostReactionModel.findOneAndUpdate(
      { postId, userId },
      { $set: { emoji } },
      { new: true },
    );
  },

  async deleteReaction(postId: string, userId: string): Promise<void> {
    await ChannelPostReactionModel.deleteOne({ postId, userId });
  },
};
