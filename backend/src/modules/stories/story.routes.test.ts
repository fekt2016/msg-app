import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as storyRepositoryModule from './story.repository.js';
import * as storyLikeRepositoryModule from './storyLike.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as mediaStorageModule from '../users/mediaStorage.js';
import * as storyEventsModule from '../../realtime/storyEvents.js';

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

vi.mock('./story.repository.js', () => ({
  storyRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findActiveById: vi.fn(),
    deleteById: vi.fn(),
    deleteViewsByStoryId: vi.fn(),
    listFeed: vi.fn(),
    countActiveAuthors: vi.fn(),
    incrementViewCount: vi.fn(),
    adjustLikeCount: vi.fn(),
    addView: vi.fn(),
    listViewers: vi.fn(),
    countViews: vi.fn(),
    hasViewed: vi.fn(),
    listViewedStoryIds: vi.fn(),
  },
}));

vi.mock('./storyLike.repository.js', () => ({
  storyLikeRepository: {
    addLike: vi.fn(),
    removeLike: vi.fn(),
    deleteLikesByStoryId: vi.fn(),
    countLikes: vi.fn(),
    listLikedStoryIds: vi.fn(),
    hasLiked: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findByIds: vi.fn(),
  },
}));

// Keep the real `isSupportedImage`/`sniffStoryMedia` implementations so the
// upload route genuinely exercises magic-byte sniffing — only the
// Cloudinary-facing provider is mocked.
vi.mock('../users/mediaStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof mediaStorageModule>();
  return {
    ...actual,
    mediaStorage: {
      uploadStoryMedia: vi.fn(),
      deleteByPublicId: vi.fn(),
    },
  };
});

vi.mock('../../realtime/storyEvents.js', () => ({
  storyEventBus: {
    emitStoryNew: vi.fn(),
    emitStoryDeleted: vi.fn(),
    emitStoryViewed: vi.fn(),
    emitStoryLiked: vi.fn(),
    emitStoryUnliked: vi.fn(),
  },
}));

const repo = vi.mocked(storyRepositoryModule.storyRepository);
const likeRepo = vi.mocked(storyLikeRepositoryModule.storyLikeRepository);
const userRepo = vi.mocked(userRepositoryModule.userRepository);
const media = vi.mocked(mediaStorageModule.mediaStorage);
const bus = vi.mocked(storyEventsModule.storyEventBus);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const VALID_MP4_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.from(new Array(16).fill(0x00)),
]);

const STORY_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

function fakeStory(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const expiresAt = new Date('2026-01-02T00:00:00.000Z');
  return {
    _id: { toString: () => STORY_ID },
    authorId: { toString: () => 'user-1' },
    media: {
      publicId: 'story-1',
      url: 'https://cdn.test/s1.png',
      width: 720,
      height: 1280,
      resourceType: 'IMAGE',
      durationMs: undefined,
    },
    caption: '',
    expiresAt,
    createdAt: now,
    viewCount: 0,
    likeCount: 0,
    ...overrides,
  } as never;
}

function mockAuthor() {
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

describe('POST /api/v1/stories', () => {
  it('creates an image story and returns 201', async () => {
    repo.create.mockResolvedValue(fakeStory());
    media.uploadStoryMedia.mockResolvedValue({
      publicId: 'story-1',
      url: 'https://cdn.test/s1.png',
      width: 720,
      height: 1280,
      resourceType: 'IMAGE',
    });

    const res = await request(app)
      .post('/api/v1/stories')
      .set(AUTH)
      .field('caption', 'Hello stories')
      .attach('media', VALID_PNG_BYTES, { filename: 's.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(STORY_ID);
    expect(res.body.data.media.resourceType).toBe('IMAGE');
    expect(media.uploadStoryMedia).toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalled();
    expect(bus.emitStoryNew).toHaveBeenCalled();
    // The global broadcast must not carry the author-only viewCount (privacy).
    expect(bus.emitStoryNew.mock.calls[0][0].viewCount).toBeUndefined();
  });

  it('creates a video story from sniffed magic bytes', async () => {
    repo.create.mockResolvedValue(
      fakeStory({ media: { resourceType: 'VIDEO', durationMs: 5000 } }),
    );
    media.uploadStoryMedia.mockResolvedValue({
      publicId: 'story-2',
      url: 'https://cdn.test/s1.mp4',
      width: 720,
      height: 1280,
      resourceType: 'VIDEO',
      durationMs: 5000,
    });

    const res = await request(app)
      .post('/api/v1/stories')
      .set(AUTH)
      .attach('media', VALID_MP4_BYTES, { filename: 's.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.data.media.resourceType).toBe('VIDEO');
    expect(media.uploadStoryMedia).toHaveBeenCalled();
  });

  it('returns 422 for a spoofed image/png header on non-image bytes', async () => {
    const res = await request(app)
      .post('/api/v1/stories')
      .set(AUTH)
      .attach('media', Buffer.from('definitely a png, trust me'), {
        filename: 's.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(media.uploadStoryMedia).not.toHaveBeenCalled();
  });

  it('returns 422 when the media field is missing', async () => {
    const res = await request(app).post('/api/v1/stories').set(AUTH);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISSING_FILE');
  });

  it('rejects an oversized caption with 422', async () => {
    const res = await request(app)
      .post('/api/v1/stories')
      .set(AUTH)
      .field('caption', 'x'.repeat(501))
      .attach('media', VALID_PNG_BYTES, { filename: 's.png', contentType: 'image/png' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/stories')
      .attach('media', VALID_PNG_BYTES, { filename: 's.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/stories/feed', () => {
  it('returns stories grouped by author with viewer-aware hasViewed', async () => {
    repo.listFeed.mockResolvedValue([
      {
        authorId: 'user-2',
        stories: [fakeStory({ authorId: { toString: () => 'user-2' } })],
        latestAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    repo.countActiveAuthors.mockResolvedValue(1);
    userRepo.findByIds.mockResolvedValue([
      {
        _id: { toString: () => 'user-2' },
        displayName: 'Ama',
        avatar: { url: 'https://cdn.test/a.png' },
      },
    ]);
    repo.listViewedStoryIds.mockResolvedValue([STORY_ID]);

    const res = await request(app).get('/api/v1/stories/feed').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].author.displayName).toBe('Ama');
    expect(res.body.data[0].stories[0].hasViewed).toBe(true);
    expect(res.body.data[0].stories[0].viewCount).toBeUndefined();
    expect(res.body.meta.total).toBe(1);
  });

  it('returns viewCount only to the story author', async () => {
    repo.listFeed.mockResolvedValue([
      {
        authorId: 'user-1',
        stories: [fakeStory()],
        latestAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    repo.countActiveAuthors.mockResolvedValue(1);
    mockAuthor();
    repo.listViewedStoryIds.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/stories/feed').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].stories[0].viewCount).toBe(0);
  });

  it('returns an empty feed when no active authors', async () => {
    repo.listFeed.mockResolvedValue([]);
    repo.countActiveAuthors.mockResolvedValue(0);

    const res = await request(app).get('/api/v1/stories/feed').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects an out-of-range pageSize with 422', async () => {
    const res = await request(app).get('/api/v1/stories/feed?pageSize=101').set(AUTH);
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/stories/:storyId', () => {
  it('returns a single active story', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory());
    repo.hasViewed.mockResolvedValue(false);

    const res = await request(app).get(`/api/v1/stories/${STORY_ID}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(STORY_ID);
    expect(res.body.data.hasViewed).toBe(false);
  });

  it('returns 404 for an expired or missing story', async () => {
    repo.findActiveById.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/stories/${STORY_ID}`).set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STORY_NOT_FOUND');
  });

  it('returns 422 for a malformed story id', async () => {
    const res = await request(app).get('/api/v1/stories/not-an-id').set(AUTH);
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/stories/:storyId', () => {
  it("deletes the author's own story and cascades views and likes", async () => {
    repo.findById.mockResolvedValue(fakeStory());

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(repo.deleteViewsByStoryId).toHaveBeenCalledWith(STORY_ID);
    expect(likeRepo.deleteLikesByStoryId).toHaveBeenCalledWith(STORY_ID);
    expect(repo.deleteById).toHaveBeenCalledWith(STORY_ID);
    expect(media.deleteByPublicId).toHaveBeenCalledWith('story-1');
    expect(bus.emitStoryDeleted).toHaveBeenCalledWith(STORY_ID, 'user-1');
  });

  it('returns 403 for a non-author', async () => {
    repo.findById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}`).set(AUTH);

    expect(res.status).toBe(403);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing story', async () => {
    repo.findById.mockResolvedValue(null);

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}`).set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/stories/:storyId/views', () => {
  it('marks the story viewed and increments the count', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));
    repo.addView.mockResolvedValue({ _id: 'view-1' } as never);
    repo.incrementViewCount.mockResolvedValue(fakeStory());

    const res = await request(app).post(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.viewed).toBe(true);
    expect(repo.addView).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: STORY_ID, viewerId: 'user-1' }),
    );
    expect(repo.incrementViewCount).toHaveBeenCalledWith(STORY_ID);
    expect(bus.emitStoryViewed).toHaveBeenCalledWith(STORY_ID, 'user-2', 'user-1');
  });

  it('does not count the author viewing their own story', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-1' } }));

    const res = await request(app).post(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.viewed).toBe(false);
    expect(repo.addView).not.toHaveBeenCalled();
    expect(repo.incrementViewCount).not.toHaveBeenCalled();
    expect(bus.emitStoryViewed).not.toHaveBeenCalled();
  });

  it('returns viewed:false (no-op) on a duplicate view', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));
    const dup = Object.assign(new Error('duplicate'), { code: 11000 });
    repo.addView.mockRejectedValue(dup);

    const res = await request(app).post(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.viewed).toBe(false);
    expect(repo.incrementViewCount).not.toHaveBeenCalled();
    expect(bus.emitStoryViewed).not.toHaveBeenCalled();
  });

  it('returns 404 for an expired story', async () => {
    repo.findActiveById.mockResolvedValue(null);

    const res = await request(app).post(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/stories/:storyId/views', () => {
  it('lists viewers for the author only', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory());
    repo.listViewers.mockResolvedValue([{ viewerId: 'user-2', viewedAt: new Date() }]);
    repo.countViews.mockResolvedValue(1);
    userRepo.findByIds.mockResolvedValue([
      { _id: { toString: () => 'user-2' }, displayName: 'Kofi', avatar: null },
    ]);

    const res = await request(app).get(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].displayName).toBe('Kofi');
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 403 for a non-author', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));

    const res = await request(app).get(`/api/v1/stories/${STORY_ID}/views`).set(AUTH);

    expect(res.status).toBe(403);
    expect(repo.listViewers).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/stories/:storyId/like', () => {
  it('likes a story, increments the count, and emits story:liked', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));
    likeRepo.addLike.mockResolvedValue({ _id: 'like-1' } as never);
    repo.adjustLikeCount.mockResolvedValue(fakeStory({ likeCount: 1 }));

    const res = await request(app).put(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likeCount).toBe(1);
    expect(likeRepo.addLike).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: STORY_ID, userId: 'user-1' }),
    );
    expect(repo.adjustLikeCount).toHaveBeenCalledWith(STORY_ID, 1);
    expect(bus.emitStoryLiked).toHaveBeenCalledWith(STORY_ID, 'user-2', 'user-1', 1);
  });

  it('is a no-op when already liked (duplicate key)', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ likeCount: 3 }));
    const dup = Object.assign(new Error('duplicate'), { code: 11000 });
    likeRepo.addLike.mockRejectedValue(dup);

    const res = await request(app).put(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likeCount).toBe(3);
    expect(repo.adjustLikeCount).not.toHaveBeenCalled();
    expect(bus.emitStoryLiked).not.toHaveBeenCalled();
  });

  it('returns 404 for an expired story', async () => {
    repo.findActiveById.mockResolvedValue(null);

    const res = await request(app).put(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/stories/:storyId/like', () => {
  it('unlikes a story, decrements the count, and emits story:unliked', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ authorId: { toString: () => 'user-2' } }));
    likeRepo.removeLike.mockResolvedValue(1);
    repo.adjustLikeCount.mockResolvedValue(fakeStory({ likeCount: 0 }));

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likeCount).toBe(0);
    expect(likeRepo.removeLike).toHaveBeenCalledWith(STORY_ID, 'user-1');
    expect(repo.adjustLikeCount).toHaveBeenCalledWith(STORY_ID, -1);
    expect(bus.emitStoryUnliked).toHaveBeenCalledWith(STORY_ID, 'user-2', 'user-1', 0);
  });

  it('is a no-op when the story was never liked', async () => {
    repo.findActiveById.mockResolvedValue(fakeStory({ likeCount: 0 }));
    likeRepo.removeLike.mockResolvedValue(0);

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likeCount).toBe(0);
    expect(repo.adjustLikeCount).not.toHaveBeenCalled();
    expect(bus.emitStoryUnliked).not.toHaveBeenCalled();
  });

  it('returns 404 for an expired story', async () => {
    repo.findActiveById.mockResolvedValue(null);

    const res = await request(app).delete(`/api/v1/stories/${STORY_ID}/like`).set(AUTH);

    expect(res.status).toBe(404);
  });
});
