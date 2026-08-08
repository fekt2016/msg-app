import { AppError } from '../../errors/AppError.js';
import { channelService } from './channel.service.js';
import { channelPostRepository } from './channelPost.repository.js';
import { channelReactionRepository } from './channelReaction.repository.js';
import { REACTION_EMOJIS, type ReactionEmoji } from './channelReaction.model.js';

export type ReactionCounts = Record<string, number>;

function toReactionCounts(post: { reactionCounts?: Map<string, number> }): ReactionCounts {
  return post.reactionCounts ? Object.fromEntries(post.reactionCounts) : {};
}

async function resolvePost(channelId: string, postId: string) {
  const post = await channelPostRepository.findPostById(postId);
  if (!post || post.channelId.toString() !== channelId) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  return post;
}

export const channelReactionService = {
  /**
   * Sets or changes the caller's reaction on a post. Single-writer sequence
   * (channels-plan.md CH3, decision #5 — the accepted drift posture, no Mongo
   * transactions): upsert the reaction row, then one atomic `$inc` on the
   * denormalized reactionCounts Map. S1 gate first — a non-subscriber never
   * reaches a post on a PRIVATE channel.
   */
  async setReaction(userId: string, identifier: string, postId: string, emoji: ReactionEmoji) {
    const channel = await channelService.getChannel(identifier, userId);
    const post = await resolvePost(channel.id, postId);

    const existing = await channelReactionRepository.findReaction(postId, userId);

    const changes: { emoji: string; delta: 1 | -1 }[] = [];
    if (existing && existing.emoji === emoji) {
      // Idempotent set — no row update, no count change.
      return toReactionCounts(post);
    }

    if (existing) {
      changes.push({ emoji: existing.emoji, delta: -1 });
      await channelReactionRepository.setReactionEmoji(postId, userId, emoji);
    } else {
      await channelReactionRepository.createReaction(postId, channel.id, userId, emoji);
    }
    changes.push({ emoji, delta: 1 });

    const updated = await channelPostRepository.adjustReactionCounts(postId, changes);
    return toReactionCounts(updated ?? post);
  },

  /**
   * Removes the caller's reaction (idempotent — no reaction is a no-op).
   * Deletes the row then `$dec` the count, same single-writer posture.
   */
  async removeReaction(
    userId: string,
    identifier: string,
    postId: string,
  ): Promise<ReactionCounts> {
    const channel = await channelService.getChannel(identifier, userId);
    const post = await resolvePost(channel.id, postId);

    const existing = await channelReactionRepository.findReaction(postId, userId);
    if (!existing) {
      return toReactionCounts(post);
    }

    await channelReactionRepository.deleteReaction(postId, userId);
    const updated = await channelPostRepository.adjustReactionCounts(postId, [
      { emoji: existing.emoji, delta: -1 },
    ]);
    return toReactionCounts(updated ?? post);
  },

  isSupportedReaction(value: unknown): value is ReactionEmoji {
    return typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value);
  },
};
