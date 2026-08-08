import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./channelReaction.model.js', () => ({
  REACTION_EMOJIS: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
  ChannelPostReactionModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

import { ChannelPostReactionModel } from './channelReaction.model.js';
import { channelReactionRepository } from './channelReaction.repository.js';

const reactionModel = vi.mocked(ChannelPostReactionModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

function reactionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'reaction-1' },
    postId: { toString: () => 'post-1' },
    channelId: { toString: () => 'channel-1' },
    userId: { toString: () => 'user-1' },
    emoji: '👍',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelReactionRepository.findReaction', () => {
  it('finds a reaction by post and user', async () => {
    reactionModel.findOne.mockResolvedValue(reactionDoc());
    const result = await channelReactionRepository.findReaction('post-1', 'user-1');
    expect(reactionModel.findOne).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' });
    expect(result?.emoji).toBe('👍');
  });
});

describe('channelReactionRepository.createReaction', () => {
  it('creates a reaction row with channel and emoji', async () => {
    reactionModel.create.mockResolvedValue(reactionDoc());
    const result = await channelReactionRepository.createReaction(
      'post-1',
      'channel-1',
      'user-1',
      '👍',
    );
    expect(reactionModel.create).toHaveBeenCalledWith({
      postId: 'post-1',
      channelId: 'channel-1',
      userId: 'user-1',
      emoji: '👍',
    });
    expect(result.userId.toString()).toBe('user-1');
  });
});

describe('channelReactionRepository.setReactionEmoji', () => {
  it('updates the emoji on the matching row', async () => {
    reactionModel.findOneAndUpdate.mockResolvedValue(reactionDoc({ emoji: '❤️' }));
    const result = await channelReactionRepository.setReactionEmoji('post-1', 'user-1', '❤️');
    expect(reactionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { postId: 'post-1', userId: 'user-1' },
      { $set: { emoji: '❤️' } },
      { new: true },
    );
    expect(result?.emoji).toBe('❤️');
  });
});

describe('channelReactionRepository.deleteReaction', () => {
  it('deletes the reaction row', async () => {
    await channelReactionRepository.deleteReaction('post-1', 'user-1');
    expect(reactionModel.deleteOne).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' });
  });
});
