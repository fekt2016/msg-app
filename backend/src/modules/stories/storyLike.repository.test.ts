import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as storyLikeModelModule from './storyLike.model.js';
import { storyLikeRepository } from './storyLike.repository.js';

vi.mock('./storyLike.model.js', () => ({
  StoryLikeModel: {
    create: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn(),
    exists: vi.fn(),
  },
}));

const likeModel = vi.mocked(storyLikeModelModule.StoryLikeModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storyLikeRepository.addLike', () => {
  it('inserts the like row with the story-expiry TTL horizon', async () => {
    const input = { storyId: 's1', userId: 'u1', expiresAt: new Date() };
    likeModel.create.mockResolvedValue({ _id: 'like-1' });

    const result = await storyLikeRepository.addLike(input);

    expect(likeModel.create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ _id: 'like-1' });
  });
});

describe('storyLikeRepository.removeLike', () => {
  it('returns the number of removed rows', async () => {
    likeModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

    expect(await storyLikeRepository.removeLike('s1', 'u1')).toBe(1);
    expect(likeModel.deleteOne).toHaveBeenCalledWith({ storyId: 's1', userId: 'u1' });
  });

  it('returns 0 when no like row existed', async () => {
    likeModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

    expect(await storyLikeRepository.removeLike('s1', 'u1')).toBe(0);
  });
});

describe('storyLikeRepository cascades and counts', () => {
  it('deletes every like for a story', async () => {
    await storyLikeRepository.deleteLikesByStoryId('s1');
    expect(likeModel.deleteMany).toHaveBeenCalledWith({ storyId: 's1' });
  });

  it('counts likes for a story', async () => {
    likeModel.countDocuments.mockResolvedValue(7);
    expect(await storyLikeRepository.countLikes('s1')).toBe(7);
    expect(likeModel.countDocuments).toHaveBeenCalledWith({ storyId: 's1' });
  });
});

describe('storyLikeRepository.liked lookups', () => {
  it('returns which of the given story ids the user liked', async () => {
    const withId = (id: string) => ({ storyId: { toString: () => id } });
    likeModel.find.mockReturnValue({ lean: () => Promise.resolve([withId('s1'), withId('s3')]) });

    const liked = await storyLikeRepository.listLikedStoryIds(['s1', 's2', 's3'], 'u1');

    expect(likeModel.find).toHaveBeenCalledWith({
      storyId: { $in: ['s1', 's2', 's3'] },
      userId: 'u1',
    });
    expect(liked).toEqual(['s1', 's3']);
  });

  it('reports whether a user has liked a story', async () => {
    likeModel.exists.mockResolvedValue({ _id: 'like-1' });
    expect(await storyLikeRepository.hasLiked('s1', 'u1')).toBe(true);

    likeModel.exists.mockResolvedValue(null);
    expect(await storyLikeRepository.hasLiked('s1', 'u1')).toBe(false);
  });
});
