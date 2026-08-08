import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./channelPost.model.js', () => ({
  ChannelPostModel: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import { ChannelPostModel } from './channelPost.model.js';
import { channelPostRepository } from './channelPost.repository.js';
import { encodePostCursor } from './postCursor.js';

const postModel = vi.mocked(ChannelPostModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

function postDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'post-1' },
    channelId: { toString: () => 'channel-1' },
    authorId: { toString: () => 'user-1' },
    body: 'Hello world',
    images: [],
    reactionCounts: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelPostRepository.createPost', () => {
  it('creates a post with channel, author and body', async () => {
    postModel.create.mockResolvedValue(postDoc());
    const result = await channelPostRepository.createPost('channel-1', 'user-1', 'Hello world');
    expect(postModel.create).toHaveBeenCalledWith({
      channelId: 'channel-1',
      authorId: 'user-1',
      body: 'Hello world',
    });
    expect(result._id.toString()).toBe('post-1');
  });
});

describe('channelPostRepository.findPostById', () => {
  it('finds a non-deleted post by id', async () => {
    postModel.findOne.mockResolvedValue(postDoc());
    const result = await channelPostRepository.findPostById('post-1');
    expect(postModel.findOne).toHaveBeenCalledWith({ _id: 'post-1', deletedAt: null });
    expect(result?.channelId.toString()).toBe('channel-1');
  });
});

describe('channelPostRepository.listPosts', () => {
  it('returns items and no cursor when fewer than limit', async () => {
    postModel.find.mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([postDoc()]) }),
    });
    const result = await channelPostRepository.listPosts('channel-1', { limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(postModel.find).toHaveBeenCalledWith({ channelId: 'channel-1', deletedAt: null });
  });

  it('returns limit items plus a nextCursor when more exist', async () => {
    const docs = [
      postDoc({ _id: { toString: () => 'post-1' } }),
      postDoc({ _id: { toString: () => 'post-2' } }),
    ];
    postModel.find.mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve(docs) }),
    });
    const result = await channelPostRepository.listPosts('channel-1', { limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it('applies the compound cursor filter when a cursor is supplied', async () => {
    postModel.find.mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([]) }),
    });
    const cursor = encodePostCursor({
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      postId: '664f1c2b8f1b2c001f000001',
    });
    await channelPostRepository.listPosts('channel-1', { limit: 20, cursor });
    expect(postModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        deletedAt: null,
        $or: expect.any(Array),
      }),
    );
  });

  it('sorts by createdAt then id, both descending', async () => {
    const limit = vi.fn(() => Promise.resolve([]));
    const sort = vi.fn(() => ({ limit }));
    postModel.find.mockReturnValue({ sort });
    await channelPostRepository.listPosts('channel-1', { limit: 20 });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(limit).toHaveBeenCalledWith(21);
  });
});

describe('channelPostRepository.updatePostBody', () => {
  it('updates the body atomically', async () => {
    postModel.findByIdAndUpdate.mockResolvedValue(postDoc({ body: 'Edited' }));
    const result = await channelPostRepository.updatePostBody('post-1', 'Edited');
    expect(postModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'post-1',
      { $set: { body: 'Edited' } },
      { new: true, runValidators: true },
    );
    expect(result?.body).toBe('Edited');
  });
});

describe('channelPostRepository.softDeletePost', () => {
  it('sets deletedAt', async () => {
    postModel.findByIdAndUpdate.mockResolvedValue(postDoc());
    await channelPostRepository.softDeletePost('post-1');
    expect(postModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'post-1',
      { $set: { deletedAt: expect.any(Date) } },
      { new: true },
    );
  });
});

describe('channelPostRepository.appendPostImage', () => {
  it('pushes the image onto the post', async () => {
    postModel.findByIdAndUpdate.mockResolvedValue(postDoc());
    const image = { publicId: 'abc', url: 'https://cdn.test/abc', alt: '', order: 0 };
    await channelPostRepository.appendPostImage('post-1', image);
    expect(postModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'post-1',
      { $push: { images: image } },
      { new: true, runValidators: true },
    );
  });
});
