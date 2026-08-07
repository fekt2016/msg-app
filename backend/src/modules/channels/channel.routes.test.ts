import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as channelRepositoryModule from './channel.repository.js';

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
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByIdOrSlug: vi.fn(),
    findByIds: vi.fn(),
    findVisible: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementSubscriberCount: vi.fn(),
    findSubscriber: vi.fn(),
    findSubscriptions: vi.fn(),
    addSubscriber: vi.fn(),
    removeSubscriber: vi.fn(),
    updateSubscriberRole: vi.fn(),
    countSubscribers: vi.fn(),
    listSubscribers: vi.fn(),
    listSubscriptionsForUser: vi.fn(),
  },
}));

const repo = vi.mocked(channelRepositoryModule.channelRepository);

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

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

const AUTH = { Authorization: 'Bearer valid-token' };

describe('POST /api/v1/channels', () => {
  it('creates a channel and returns 201', async () => {
    repo.create.mockResolvedValue(fakeChannel());
    repo.findBySlug.mockResolvedValue(null);
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/channels')
      .set(AUTH)
      .send({ name: 'Accra News', description: 'City updates' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.channel.name).toBe('Accra News');
    expect(res.body.data.role).toBe('OWNER');
  });

  it('returns 422 for an empty name', async () => {
    const res = await request(app).post('/api/v1/channels').set(AUTH).send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).post('/api/v1/channels').send({ name: 'X' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /api/v1/channels', () => {
  it('lists public channels', async () => {
    repo.findVisible.mockResolvedValue({
      items: [fakeChannel()],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    repo.findSubscriptions.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/channels').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 422 for an invalid page size', async () => {
    const res = await request(app).get('/api/v1/channels?pageSize=101').set(AUTH);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/channels/mine', () => {
  it('returns the viewer subscribed channels (route not shadowed by :identifier)', async () => {
    repo.listSubscriptionsForUser.mockResolvedValue([
      { channelId: { toString: () => 'channel-1' }, role: 'OWNER' },
    ]);
    repo.findByIds.mockResolvedValue([fakeChannel()]);

    const res = await request(app).get('/api/v1/channels/mine').set(AUTH);

    expect(res.status).toBe(200);
    expect(repo.listSubscriptionsForUser).toHaveBeenCalledWith('user-1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('OWNER');
  });
});

describe('GET /api/v1/channels/:identifier', () => {
  it('returns a channel with subscription status', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const res = await request(app).get('/api/v1/channels/accra-news').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('accra-news');
    expect(res.body.data.isSubscribed).toBe(true);
    expect(res.body.data.role).toBe('SUBSCRIBER');
  });

  it('returns 404 for an unknown channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/channels/nope').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHANNEL_NOT_FOUND');
  });

  it('forbids non-subscribers from viewing a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/channels/secret').set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVATE_CHANNEL');
  });
});

describe('PATCH /api/v1/channels/:identifier', () => {
  it('updates a channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.findBySlug.mockResolvedValue(null);
    repo.update.mockResolvedValue(fakeChannel({ description: 'New desc' }));

    const res = await request(app)
      .patch('/api/v1/channels/accra-news')
      .set(AUTH)
      .send({ description: 'New desc' });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('New desc');
  });

  it('forbids a non-subscriber', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/channels/accra-news')
      .set(AUTH)
      .send({ description: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 422 when the body is empty', async () => {
    const res = await request(app).patch('/api/v1/channels/accra-news').set(AUTH).send({});

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/channels/:identifier', () => {
  it('soft-deletes a channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.softDelete.mockResolvedValue(fakeChannel());

    const res = await request(app).delete('/api/v1/channels/accra-news').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('forbids an admin from deleting', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'ADMIN' });

    const res = await request(app).delete('/api/v1/channels/accra-news').set(AUTH);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/channels/:identifier/subscribe', () => {
  it('subscribes to a public channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const res = await request(app).post('/api/v1/channels/accra-news/subscribe').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.isSubscribed).toBe(true);
  });

  it('forbids subscribing to a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const res = await request(app).post('/api/v1/channels/secret/subscribe').set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVATE_CHANNEL');
  });
});

describe('POST /api/v1/channels/:identifier/unsubscribe', () => {
  it('unsubscribes a subscriber', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });
    repo.removeSubscriber.mockResolvedValue(undefined);
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const res = await request(app).post('/api/v1/channels/accra-news/unsubscribe').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.isSubscribed).toBe(false);
  });

  it('forbids the owner from unsubscribing', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });

    const res = await request(app).post('/api/v1/channels/accra-news/unsubscribe').set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OWNER_CANNOT_UNSUBSCRIBE');
  });
});

describe('GET /api/v1/channels/:identifier/subscribers', () => {
  it('lists subscribers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.listSubscribers.mockResolvedValue({
      items: [{ userId: 'user-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await request(app).get('/api/v1/channels/accra-news/subscribers').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('forbids a non-subscriber from listing a private channel subscribers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/channels/secret/subscribers').set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVATE_CHANNEL');
  });
});

describe('PATCH /api/v1/channels/:identifier/subscribers/:userId', () => {
  it('updates a subscriber role', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'SUBSCRIBER' });
    repo.updateSubscriberRole.mockResolvedValue({ role: 'ADMIN' });

    const res = await request(app)
      .patch('/api/v1/channels/accra-news/subscribers/user-2')
      .set(AUTH)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
  });

  it('returns 422 for an invalid role', async () => {
    const res = await request(app)
      .patch('/api/v1/channels/accra-news/subscribers/user-2')
      .set(AUTH)
      .send({ role: 'OWNER' });

    expect(res.status).toBe(422);
  });

  it('returns 422 for an unknown role', async () => {
    const res = await request(app)
      .patch('/api/v1/channels/accra-news/subscribers/user-2')
      .set(AUTH)
      .send({ role: 'SUPERADMIN' });

    expect(res.status).toBe(422);
  });
});
