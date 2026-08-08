import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as channelRepositoryModule from './channel.repository.js';
import * as channelPostRepositoryModule from './channelPost.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as mediaStorageModule from '../users/mediaStorage.js';

vi.mock('../../modules/auth/token.service.js', () => ({
  signAccessToken: vi.fn(() => 'access-token'),
  signRefreshToken: vi.fn(() => 'refresh-token'),
  generateJti: vi.fn(() => 'jti-1'),
  verifyAccessToken: vi.fn((token: string) => {
    if (token !== 'valid-token') {
      const err = new Error('jwt malformed') as Error & { name: string };
      err.name = 'JsonWebTokenError';
      throw err;
    }
    return { sub: 'user-1', role: 'USER', deviceId: 'device-1', type: 'access' };
  }),
  verifyRefreshToken: vi.fn(),
  hashToken: vi.fn((t: string) => `hashed-${t}`),
}));

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

// Keep the real `isSupportedImage`/`sniffImageMimeType` implementations so the
// upload route genuinely exercises magic-byte sniffing — only the
// Cloudinary-facing provider is mocked.
vi.mock('../users/mediaStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof mediaStorageModule>();
  return {
    ...actual,
    mediaStorage: {
      uploadPostImage: vi.fn(),
    },
  };
});

const repo = vi.mocked(channelRepositoryModule.channelRepository);
const postRepo = vi.mocked(channelPostRepositoryModule.channelPostRepository);
const userRepo = vi.mocked(userRepositoryModule.userRepository);
const media = vi.mocked(mediaStorageModule.mediaStorage);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

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

function mockManager() {
  repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
  repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
}

function mockSubscriber() {
  repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
  repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });
}

function mockEnrich() {
  userRepo.findByIds.mockResolvedValue([
    {
      _id: { toString: () => 'user-1' },
      displayName: 'Ama',
      avatar: { url: 'https://cdn.test/a.png' },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/channels/:identifier/posts', () => {
  it('creates a post as a channel manager and returns 201', async () => {
    mockManager();
    postRepo.createPost.mockResolvedValue(fakePost());
    mockEnrich();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts')
      .set(AUTH)
      .send({ body: 'Hello world' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('post-1');
    expect(res.body.data.author.displayName).toBe('Ama');
    expect(repo.incrementPostCount).toHaveBeenCalledWith('channel-1', 1);
  });

  it('returns 403 for a non-manager subscriber', async () => {
    mockSubscriber();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts')
      .set(AUTH)
      .send({ body: 'Hello world' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(postRepo.createPost).not.toHaveBeenCalled();
  });

  it('rejects an empty body with 422', async () => {
    mockManager();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts')
      .set(AUTH)
      .send({ body: '' });

    expect(res.status).toBe(422);
    expect(postRepo.createPost).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/channels/accra-news/posts').send({ body: 'Hi' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/channels/:identifier/posts', () => {
  it('returns a cursor-paginated feed', async () => {
    mockSubscriber();
    postRepo.listPosts.mockResolvedValue({ items: [fakePost()], nextCursor: 'cursor-1' });
    mockEnrich();

    const res = await request(app).get('/api/v1/channels/accra-news/posts?limit=20').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.nextCursor).toBe('cursor-1');
  });

  it('gates a private channel feed from a non-subscriber with 403', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/channels/accra-news/posts').set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVATE_CHANNEL');
    expect(postRepo.listPosts).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range limit with 422', async () => {
    mockSubscriber();

    const res = await request(app).get('/api/v1/channels/accra-news/posts?limit=101').set(AUTH);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/channels/:identifier/posts/:postId', () => {
  it('returns the post for a subscriber', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost());
    mockEnrich();

    const res = await request(app).get('/api/v1/channels/accra-news/posts/post-1').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('post-1');
    expect(res.body.data.channelId).toBe('channel-1');
  });

  it('returns 404 for a missing post', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/channels/accra-news/posts/post-1').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('POST_NOT_FOUND');
  });
});

describe('PATCH /api/v1/channels/:identifier/posts/:postId', () => {
  it('lets the author edit their own post', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost());
    postRepo.updatePostBody.mockResolvedValue(fakePost({ body: 'Edited' }));
    mockEnrich();

    const res = await request(app)
      .patch('/api/v1/channels/accra-news/posts/post-1')
      .set(AUTH)
      .send({ body: 'Edited' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Edited');
  });

  it('rejects a plain subscriber editing someone else post with 403', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));

    const res = await request(app)
      .patch('/api/v1/channels/accra-news/posts/post-1')
      .set(AUTH)
      .send({ body: 'Edited' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(postRepo.updatePostBody).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/channels/:identifier/posts/:postId', () => {
  it('lets an admin delete a post and decrements the count', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'ADMIN' });
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));
    postRepo.softDeletePost.mockResolvedValue(fakePost());

    const res = await request(app).delete('/api/v1/channels/accra-news/posts/post-1').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(repo.incrementPostCount).toHaveBeenCalledWith('channel-1', -1);
  });

  it('rejects a stranger with 403', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost({ authorId: { toString: () => 'user-2' } }));

    const res = await request(app).delete('/api/v1/channels/accra-news/posts/post-1').set(AUTH);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/channels/:identifier/posts/:postId/images', () => {
  it('uploads a valid image and returns the updated post', async () => {
    mockSubscriber();
    postRepo.findPostById.mockResolvedValue(fakePost());
    media.uploadPostImage.mockResolvedValue({ publicId: 'img-1', url: 'https://cdn.test/i.png' });
    postRepo.appendPostImage.mockResolvedValue(fakePost());
    mockEnrich();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts/post-1/images')
      .set(AUTH)
      .attach('image', VALID_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(media.uploadPostImage).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'photo.png' }),
    );
    expect(postRepo.appendPostImage).toHaveBeenCalledWith('post-1', {
      publicId: 'img-1',
      url: 'https://cdn.test/i.png',
      alt: '',
      order: 0,
    });
  });

  it('returns 422 for a non-image file (rejected by the Content-Type pre-filter)', async () => {
    mockSubscriber();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts/post-1/images')
      .set(AUTH)
      .attach('image', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(media.uploadPostImage).not.toHaveBeenCalled();
  });

  it('returns 422 for a spoofed image/png header on non-image bytes', async () => {
    mockSubscriber();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts/post-1/images')
      .set(AUTH)
      .attach('image', Buffer.from('definitely a png, trust me'), {
        filename: 'photo.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(media.uploadPostImage).not.toHaveBeenCalled();
  });

  it('returns 422 when the image field is missing', async () => {
    mockSubscriber();

    const res = await request(app)
      .post('/api/v1/channels/accra-news/posts/post-1/images')
      .set(AUTH);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISSING_FILE');
  });
});
