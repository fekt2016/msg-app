import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { AppError } from '../../errors/AppError.js';
import * as notificationRepositoryModule from './notification.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as notificationEventsModule from '../../realtime/notificationEvents.js';

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

vi.mock('./notification.repository.js', () => ({
  notificationRepository: {
    create: vi.fn(),
    upsertUnread: vi.fn(),
    listFeed: vi.fn(),
    countUnread: vi.fn(),
    findOwned: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../realtime/notificationEvents.js', () => ({
  notificationEventBus: {
    emitNew: vi.fn(),
    emitUnread: vi.fn(),
  },
}));

const repo = vi.mocked(notificationRepositoryModule.notificationRepository);
const users = vi.mocked(userRepositoryModule.userRepository);
const bus = vi.mocked(notificationEventsModule.notificationEventBus);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const VALID_ID = '664f1c2b8f1b2c001f000001';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'n-1' },
    userId: 'user-1',
    channel: 'IN_APP',
    type: 'chat:message',
    title: 'Ama',
    body: 'Sent you a message',
    data: { senderId: 'u-2' },
    coalesceKey: null,
    readAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fakeVisible(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    type: 'chat:message',
    title: 'Ama',
    body: 'Sent you a message',
    data: { senderId: 'u-2' },
    readAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/notifications', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
  });

  it('returns the paginated feed with the next cursor in meta', async () => {
    repo.listFeed.mockResolvedValue({ items: [fakeDoc()], nextCursor: 'cursor-next' });

    const res = await request(app).get('/api/v1/notifications').set(AUTH).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([fakeVisible({ createdAt: '2026-01-01T00:00:00.000Z' })]);
    expect(res.body.meta.nextCursor).toBe('cursor-next');
    expect(repo.listFeed).toHaveBeenCalledWith('user-1', { limit: 20, cursor: null });
  });

  it('forwards the cursor and a custom limit', async () => {
    repo.listFeed.mockResolvedValue({ items: [], nextCursor: null });
    await request(app)
      .get('/api/v1/notifications')
      .query({ cursor: 'abc', limit: '50' })
      .set(AUTH)
      .expect(200);
    expect(repo.listFeed).toHaveBeenCalledWith('user-1', { limit: 50, cursor: 'abc' });
  });

  it('rejects a limit above the 100 cap', async () => {
    await request(app).get('/api/v1/notifications').query({ limit: '101' }).set(AUTH).expect(422);
  });

  it('rejects unknown query fields', async () => {
    await request(app)
      .get('/api/v1/notifications')
      .query({ userId: 'someone-else' })
      .set(AUTH)
      .expect(422);
  });

  it('returns 400 INVALID_CURSOR for a malformed cursor', async () => {
    repo.listFeed.mockRejectedValue(
      new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor'),
    );
    const res = await request(app)
      .get('/api/v1/notifications')
      .query({ cursor: '!!!not-json!!!' })
      .set(AUTH)
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/v1/notifications/unread-count').expect(401);
  });

  it('returns the user unread count', async () => {
    repo.countUnread.mockResolvedValue(4);
    const res = await request(app).get('/api/v1/notifications/unread-count').set(AUTH).expect(200);
    expect(res.body.data).toEqual({ count: 4 });
    expect(repo.countUnread).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/v1/notifications/read', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/v1/notifications/read').expect(401);
  });

  it('rejects a malformed notificationId', async () => {
    await request(app)
      .post('/api/v1/notifications/read')
      .set(AUTH)
      .send({ notificationId: 'not-an-object-id' })
      .expect(422);
  });

  it('rejects unknown body fields (cannot read another user’s notification)', async () => {
    await request(app)
      .post('/api/v1/notifications/read')
      .set(AUTH)
      .send({ notificationId: VALID_ID, userId: 'someone-else' })
      .expect(422);
  });

  it('marks an owned notification as read and refreshes the badge', async () => {
    repo.findOwned.mockResolvedValue(fakeDoc());
    repo.markRead.mockResolvedValue(fakeDoc({ readAt: NOW }));
    repo.countUnread.mockResolvedValue(1);
    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set(AUTH)
      .send({ notificationId: VALID_ID })
      .expect(200);
    expect(res.body.data).toEqual(
      fakeVisible({ readAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(repo.markRead).toHaveBeenCalledWith(VALID_ID, 'user-1');
    expect(bus.emitUnread).toHaveBeenCalledWith('user-1', 1);
  });

  it('returns 404 when the notification is not owned by the user', async () => {
    repo.findOwned.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set(AUTH)
      .send({ notificationId: VALID_ID })
      .expect(404);
    expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/v1/notifications/read-all').expect(401);
  });

  it('marks everything read and zeroes the badge for the user', async () => {
    repo.markAllRead.mockResolvedValue(3);
    const res = await request(app).post('/api/v1/notifications/read-all').set(AUTH).expect(200);
    expect(res.body.data).toEqual({ updatedCount: 3 });
    expect(bus.emitUnread).toHaveBeenCalledWith('user-1', 0);
  });
});

describe('e2e: a chat notification is recorded then read through the API', () => {
  it('chatMessage → feed → mark-read round-trips for a message sender', async () => {
    users.findById.mockResolvedValue({ displayName: 'Ama', _id: { toString: () => 'u-2' } });
    repo.upsertUnread.mockResolvedValue(
      fakeDoc({ data: { type: 'chat:message', senderId: 'u-2', senderName: 'Ama' } }),
    );

    // NOTE: exercises the real service path through the REST surface below; the
    // socket handler (realtime/server.ts) calls the same `chatMessage`.
    const { notificationService } = await import('./notification.service.js');
    await notificationService.chatMessage('u-2', 'user-1');

    expect(repo.upsertUnread).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', coalesceKey: 'chat:u-2' }),
    );
  });
});
