import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./channel.repository.js', () => ({
  channelRepository: {
    findByIdOrSlug: vi.fn(),
    findSubscriber: vi.fn(),
    incrementPostCount: vi.fn(),
  },
}));

vi.mock('./channelPost.repository.js', () => ({
  channelPostRepository: {
    createPost: vi.fn(),
    findPostById: vi.fn(),
    listPosts: vi.fn(),
    updatePostBody: vi.fn(),
    softDeletePost: vi.fn(),
    appendPostImage: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findByIds: vi.fn(),
  },
}));

vi.mock('../users/mediaStorage.js', () => ({
  isSupportedImage: vi.fn(() => true),
  sniffImageMimeType: vi.fn(() => true),
  mediaStorage: {
    uploadPostImage: vi.fn(),
  },
}));

import * as channelRepositoryModule from './channel.repository.js';
import * as channelPostRepositoryModule from './channelPost.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as mediaStorageModule from '../users/mediaStorage.js';
import { channelPostService } from './channelPost.service.js';

const repo = vi.mocked(channelRepositoryModule.channelRepository);
const postRepo = vi.mocked(channelPostRepositoryModule.channelPostRepository);
const userRepo = vi.mocked(userRepositoryModule.userRepository);
const media = vi.mocked(mediaStorageModule.mediaStorage);

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
    postCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as never;
}

function fakePost(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'post-1' },
    channelId: { toString: () => 'channel-1' },
    authorId: { toString: () => 'user-1' },
    body: 'Hello world',
    images: [],
    reactionCounts: new Map(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never;
}

function mockViewableChannel(role: string | null = 'SUBSCRIBER', visibility = 'PUBLIC') {
  repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility }));
  repo.findSubscriber.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mediaStorageModule.isSupportedImage).mockReturnValue(true);
  vi.mocked(mediaStorageModule.sniffImageMimeType).mockReturnValue(true);
});

describe('channelPostService.createPost', () => {
  it('creates a post as a manager and increments the post count', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    postRepo.createPost.mockResolvedValue(fakePost());
    userRepo.findByIds.mockResolvedValue([
      {
        _id: { toString: () => 'user-1' },
        displayName: 'Ama',
        avatar: { url: 'https://cdn.test/a.png' },
      },
    ]);

    const result = await channelPostService.createPost('user-1', 'accra-news', 'Hello world');

    expect(postRepo.createPost).toHaveBeenCalledWith('channel-1', 'user-1', 'Hello world');
    expect(repo.incrementPostCount).toHaveBeenCalledWith('channel-1', 1);
    expect(result.author.displayName).toBe('Ama');
    expect(result.body).toBe('Hello world');
  });

  it('rejects a non-manager with 403', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);

    await expect(channelPostService.createPost('user-9', 'accra-news', 'Hi')).rejects.toMatchObject(
      {
        statusCode: 403,
        code: 'FORBIDDEN',
      },
    );
    expect(postRepo.createPost).not.toHaveBeenCalled();
  });
});

describe('channelPostService.listPosts', () => {
  it('returns enriched posts and the next cursor', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.listPosts.mockResolvedValue({
      items: [fakePost()],
      nextCursor: 'cursor-1',
    });
    userRepo.findByIds.mockResolvedValue([
      {
        _id: { toString: () => 'user-1' },
        displayName: 'Ama',
        avatar: { url: 'https://cdn.test/a.png' },
      },
    ]);

    const result = await channelPostService.listPosts('accra-news', 'user-1', { limit: 20 });

    expect(postRepo.listPosts).toHaveBeenCalledWith('channel-1', { limit: 20 });
    expect(result.items[0].author.displayName).toBe('Ama');
    expect(result.nextCursor).toBe('cursor-1');
  });

  it('gates a private channel feed from a non-subscriber with 403', async () => {
    mockViewableChannel(null, 'PRIVATE');

    await expect(
      channelPostService.listPosts('accra-news', 'user-9', { limit: 20 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PRIVATE_CHANNEL',
    });
    expect(postRepo.listPosts).not.toHaveBeenCalled();
  });
});

describe('channelPostService.getPost', () => {
  it('returns an enriched post for a subscriber', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost());
    userRepo.findByIds.mockResolvedValue([
      { _id: { toString: () => 'user-1' }, displayName: 'Ama', avatar: null },
    ]);

    const result = await channelPostService.getPost('accra-news', 'user-1', 'post-1');

    expect(result.id).toBe('post-1');
    expect(result.channelId).toBe('channel-1');
  });

  it('returns 404 when the post is missing', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(null);

    await expect(
      channelPostService.getPost('accra-news', 'user-1', 'post-1'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'POST_NOT_FOUND',
    });
  });

  it('returns 404 when the post belongs to a different channel', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(
      fakePost({ channelId: { toString: () => 'other-channel' } }),
    );

    await expect(
      channelPostService.getPost('accra-news', 'user-1', 'post-1'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'POST_NOT_FOUND',
    });
  });
});

describe('channelPostService.updatePost', () => {
  it('lets the author edit their own post', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost());
    postRepo.updatePostBody.mockResolvedValue(fakePost({ body: 'Edited' }));
    userRepo.findByIds.mockResolvedValue([]);

    const result = await channelPostService.updatePost('user-1', 'accra-news', 'post-1', 'Edited');

    expect(postRepo.updatePostBody).toHaveBeenCalledWith('post-1', 'Edited');
    expect(result.body).toBe('Edited');
  });

  it('lets an admin edit anyone else post', async () => {
    mockViewableChannel('ADMIN');
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));
    postRepo.updatePostBody.mockResolvedValue(fakePost({ body: 'Edited' }));

    await channelPostService.updatePost('user-1', 'accra-news', 'post-1', 'Edited');
    expect(postRepo.updatePostBody).toHaveBeenCalled();
  });

  it('rejects a plain subscriber editing someone else post with 403', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));

    await expect(
      channelPostService.updatePost('user-1', 'accra-news', 'post-1', 'Edited'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(postRepo.updatePostBody).not.toHaveBeenCalled();
  });
});

describe('channelPostService.softDeletePost', () => {
  it('deletes the post as author and decrements the count', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost());
    postRepo.softDeletePost.mockResolvedValue(fakePost());

    await channelPostService.softDeletePost('user-1', 'accra-news', 'post-1');

    expect(postRepo.softDeletePost).toHaveBeenCalledWith('post-1');
    expect(repo.incrementPostCount).toHaveBeenCalledWith('channel-1', -1);
  });

  it('rejects a stranger with 403', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));

    await expect(
      channelPostService.softDeletePost('user-1', 'accra-news', 'post-1'),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('channelPostService.addPostImage', () => {
  it('uploads a valid image and appends it at the next order index', async () => {
    mockViewableChannel('SUBSCRIBER');
    postRepo.findPostById.mockResolvedValue(fakePost({ images: [{ order: 0 }] }));
    media.uploadPostImage.mockResolvedValue({ publicId: 'img-1', url: 'https://cdn.test/i.png' });
    postRepo.appendPostImage.mockResolvedValue(fakePost());

    await channelPostService.addPostImage('user-1', 'accra-news', 'post-1', {
      mimetype: 'image/png',
      buffer: Buffer.from('png'),
    });

    expect(postRepo.appendPostImage).toHaveBeenCalledWith('post-1', {
      publicId: 'img-1',
      url: 'https://cdn.test/i.png',
      alt: '',
      order: 1,
    });
  });

  it('rejects an unsupported mimetype with 422 before any repo call', async () => {
    vi.mocked(mediaStorageModule.isSupportedImage).mockReturnValue(false);

    await expect(
      channelPostService.addPostImage('user-1', 'accra-news', 'post-1', {
        mimetype: 'text/plain',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_FILE_TYPE' });
    expect(media.uploadPostImage).not.toHaveBeenCalled();
  });

  it('rejects spoofed bytes that fail the magic-byte sniff with 422', async () => {
    vi.mocked(mediaStorageModule.isSupportedImage).mockReturnValue(true);
    vi.mocked(mediaStorageModule.sniffImageMimeType).mockReturnValue(false);

    await expect(
      channelPostService.addPostImage('user-1', 'accra-news', 'post-1', {
        mimetype: 'image/png',
        buffer: Buffer.from('not really png'),
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_FILE_TYPE' });
    expect(media.uploadPostImage).not.toHaveBeenCalled();
  });

  it('gates a non-subscriber from uploading to a private channel', async () => {
    mockViewableChannel(null, 'PRIVATE');

    await expect(
      channelPostService.addPostImage('user-9', 'accra-news', 'post-1', {
        mimetype: 'image/png',
        buffer: Buffer.from('png'),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'PRIVATE_CHANNEL' });
  });
});
