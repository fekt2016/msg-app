import { StoryLikeModel, type StoryLikeDoc } from './storyLike.model.js';

export const storyLikeRepository = {
  /**
   * Inserts a like row. The unique `{storyId, userId}` index is the
   * idempotency boundary — a duplicate-key error means the user already liked
   * the story (the service treats it as a no-op).
   */
  async addLike(input: {
    storyId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<StoryLikeDoc> {
    return StoryLikeModel.create(input);
  },

  /**
   * Removes a like row. Returns the deleted count so the caller knows whether a
   * like actually existed (a remove on a non-liked story is a no-op).
   */
  async removeLike(storyId: string, userId: string): Promise<number> {
    const result = await StoryLikeModel.deleteOne({ storyId, userId });
    return result.deletedCount;
  },

  async deleteLikesByStoryId(storyId: string): Promise<void> {
    await StoryLikeModel.deleteMany({ storyId });
  },

  async countLikes(storyId: string): Promise<number> {
    return StoryLikeModel.countDocuments({ storyId });
  },

  /** Which of `storyIds` the viewer has liked — one query, no per-row lookups. */
  async listLikedStoryIds(storyIds: string[], userId: string): Promise<string[]> {
    const likes = await StoryLikeModel.find({ storyId: { $in: storyIds }, userId }).lean();
    return likes.map((l) => l.storyId.toString());
  },

  async hasLiked(storyId: string, userId: string): Promise<boolean> {
    return StoryLikeModel.exists({ storyId, userId }).then((v) => v !== null);
  },
};
