import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as groupMessageServiceModule from './groupMessage.service.js';
import { AppError } from '../../errors/AppError.js';

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

vi.mock('./groupMessage.service.js', () => ({
  groupMessageService: {
    storeMessage: vi.fn(),
    listGroupMessages: vi.fn(),
  },
}));

const service = vi.mocked(groupMessageServiceModule.groupMessageService);
const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const GID = 'b'.repeat(24);

const stored = {
  id: 'gm-1',
  groupId: GID,
  senderId: 'user-1',
  keyId: 3,
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/groups/:groupId/messages', () => {
  it('lists the group history with pagination meta', async () => {
    service.listGroupMessages.mockResolvedValue({
      items: [stored],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);

    const res = await request(app).get(`/api/v1/groups/${GID}/messages`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([stored]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(service.listGroupMessages).toHaveBeenCalledWith('user-1', GID, 1, 20);
  });

  it('honours custom pagination', async () => {
    service.listGroupMessages.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      pageSize: 50,
    } as never);

    const res = await request(app)
      .get(`/api/v1/groups/${GID}/messages?page=2&pageSize=50`)
      .set(AUTH);
    expect(res.status).toBe(200);
    expect(service.listGroupMessages).toHaveBeenCalledWith('user-1', GID, 2, 50);
  });

  it('propagates a 403 from the service', async () => {
    service.listGroupMessages.mockRejectedValue(
      new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group'),
    );
    const res = await request(app).get(`/api/v1/groups/${GID}/messages`).set(AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_GROUP_MEMBER');
  });

  it('propagates a 404 from the service', async () => {
    service.listGroupMessages.mockRejectedValue(
      new AppError(404, 'GROUP_NOT_FOUND', 'Group not found'),
    );
    const res = await request(app).get(`/api/v1/groups/${GID}/messages`).set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });

  it('rejects a non-ObjectId groupId', async () => {
    const res = await request(app).get('/api/v1/groups/not-valid/messages').set(AUTH);
    expect(res.status).toBe(422);
  });

  it('rejects a pageSize over the maximum', async () => {
    const res = await request(app).get(`/api/v1/groups/${GID}/messages?pageSize=500`).set(AUTH);
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/api/v1/groups/${GID}/messages`);
    expect(res.status).toBe(401);
  });
});
