import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./channel.repository.js', () => ({
  channelRepository: {
    findByIdOrSlug: vi.fn(),
    findSubscriber: vi.fn(),
  },
}));

vi.mock('./channelPost.repository.js', () => ({
  channelPostRepository: {
    findPostById: vi.fn(),
    adjustReactionCounts: vi.fn(),
  },
}));

vi.mock('./channelReaction.repository.js', () => ({
  channelReactionRepository: {
    findReaction: vi.fn(),
    createReaction: vi.fn(),
    setReactionEmoji: vi.fn(),
    deleteReaction: vi.fn(),
  },
}));

vi.mock('../../realtime/channelEvents.js', () => ({
  channelEventBus: {
    emitPostReaction: vi.fn(),
  },
}));

import * as channelRepositoryModule from './channel.repository.js';
import * as channelPostRepositoryModule from './channelPost.repository.js';
import * as channelReactionRepositoryModule from './channelReaction.repository.js';
import { channelReactionService } from './channelReaction.service.js';

const repo = vi.mocked(channelRepositoryModule.channelRepository);
const postRepo = vi.mocked(channelPostRepositoryModule.channelPostRepository);
const reactionRepo = vi.mocked(channelReactionRepositoryModule.channelReactionRepository);

function fakeChannel(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'channel-1' },
    name: 'Accra News',
    slug: 'accra-news',
    description: '',
    avatar: undefined,
    visibility: 'PUBLIC',
    ownerId: { toString: () => 'user-1' },
    subscriberCount: 1,
    postCount: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as never;
}

function fakePost(reactionCounts: Map<string, number> | Record<string, number> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'post-1' },
    channelId: { toString: () => 'channel-1' },
    authorId: { toString: () => 'user-2' },
    body: 'Hello world',
    images: [],
    reactionCounts:
      reactionCounts instanceof Map ? reactionCounts : new Map(Object.entries(reactionCounts)),
    createdAt: now,
    updatedAt: now,
  } as never;
}

function mockSubscriber(role: string | null = 'SUBSCRIBER', visibility = 'PUBLIC') {
  repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility }));
  repo.findSubscriber.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelReactionService.setReaction', () => {
  it('creates a reaction and $inc the emoji count by one', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost());
    reactionRepo.findReaction.mockResolvedValue(null);
    postRepo.adjustReactionCounts.mockResolvedValue(fakePost({ '👍': 1 }));

    const result = await channelReactionService.setReaction('user-1', 'accra-news', 'post-1', '👍');

    expect(reactionRepo.createReaction).toHaveBeenCalledWith('post-1', 'channel-1', 'user-1', '👍');
    expect(postRepo.adjustReactionCounts).toHaveBeenCalledWith('post-1', [
      { emoji: '👍', delta: 1 },
    ]);
    expect(result['👍']).toBe(1);
  });

  it('changes emoji: updates the row, decs the old emoji, incs the new', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost({ '👍': 1 }));
    reactionRepo.findReaction.mockResolvedValue({
      emoji: '👍',
      postId: { toString: () => 'post-1' },
      userId: { toString: () => 'user-1' },
    });

    await channelReactionService.setReaction('user-1', 'accra-news', 'post-1', '❤️');

    expect(reactionRepo.setReactionEmoji).toHaveBeenCalledWith('post-1', 'user-1', '❤️');
    expect(postRepo.adjustReactionCounts).toHaveBeenCalledWith('post-1', [
      { emoji: '👍', delta: -1 },
      { emoji: '❤️', delta: 1 },
    ]);
    expect(reactionRepo.createReaction).not.toHaveBeenCalled();
  });

  it('is a no-op when the reaction is unchanged (idempotent set)', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost({ '👍': 1 }));
    reactionRepo.findReaction.mockResolvedValue({ emoji: '👍' });

    const result = await channelReactionService.setReaction('user-1', 'accra-news', 'post-1', '👍');

    expect(reactionRepo.setReactionEmoji).not.toHaveBeenCalled();
    expect(reactionRepo.createReaction).not.toHaveBeenCalled();
    expect(postRepo.adjustReactionCounts).not.toHaveBeenCalled();
    expect(result['👍']).toBe(1);
  });

  it('returns 404 when the post is missing', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(null);

    await expect(
      channelReactionService.setReaction('user-1', 'accra-news', 'post-1', '👍'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POST_NOT_FOUND' });
    expect(reactionRepo.createReaction).not.toHaveBeenCalled();
  });

  it('gates a non-subscriber of a private channel with 403', async () => {
    mockSubscriber(null, 'PRIVATE');

    await expect(
      channelReactionService.setReaction('user-9', 'accra-news', 'post-1', '👍'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'PRIVATE_CHANNEL' });
    expect(reactionRepo.createReaction).not.toHaveBeenCalled();
  });
});

describe('channelReactionService.removeReaction', () => {
  it('deletes the reaction and $dec the emoji count', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost({ '👍': 1 }));
    reactionRepo.findReaction.mockResolvedValue({ emoji: '👍' });
    postRepo.adjustReactionCounts.mockResolvedValue(fakePost({ '👍': 0 }));

    const result = await channelReactionService.removeReaction('user-1', 'accra-news', 'post-1');

    expect(reactionRepo.deleteReaction).toHaveBeenCalledWith('post-1', 'user-1');
    expect(postRepo.adjustReactionCounts).toHaveBeenCalledWith('post-1', [
      { emoji: '👍', delta: -1 },
    ]);
    expect(result['👍']).toBe(0);
  });

  it('is a no-op when the user has no reaction (idempotent delete)', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost());
    reactionRepo.findReaction.mockResolvedValue(null);

    const result = await channelReactionService.removeReaction('user-1', 'accra-news', 'post-1');

    expect(reactionRepo.deleteReaction).not.toHaveBeenCalled();
    expect(postRepo.adjustReactionCounts).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('returns 404 when the post is missing', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(null);

    await expect(
      channelReactionService.removeReaction('user-1', 'accra-news', 'post-1'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POST_NOT_FOUND' });
  });
});

describe('channelReactionService.isSupportedReaction', () => {
  it('accepts whitelisted emojis and rejects anything else', () => {
    expect(channelReactionService.isSupportedReaction('👍')).toBe(true);
    expect(channelReactionService.isSupportedReaction('🙏')).toBe(true);
    expect(channelReactionService.isSupportedReaction('💀')).toBe(false);
    expect(channelReactionService.isSupportedReaction('not-an-emoji')).toBe(false);
    expect(channelReactionService.isSupportedReaction(123)).toBe(false);
  });
});
