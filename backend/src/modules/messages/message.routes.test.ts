import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as messageServiceModule from './message.service.js';
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

vi.mock('./message.service.js', () => ({
  messageService: {
    storeMessage: vi.fn(),
    listConversation: vi.fn(),
  },
}));

const service = vi.mocked(messageServiceModule.messageService);
const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const UID = 'a'.repeat(24);

const stored = {
  id: 'msg-1',
  senderId: 'user-1',
  recipientId: UID,
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/messages/:userId', () => {
  it('lists the conversation with pagination meta', async () => {
    service.listConversation.mockResolvedValue({
      items: [stored],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);

    const res = await request(app).get(`/api/v1/messages/${UID}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([stored]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(service.listConversation).toHaveBeenCalledWith('user-1', UID, 1, 20);
  });

  it('honours custom pagination', async () => {
    service.listConversation.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      pageSize: 50,
    } as never);

    const res = await request(app).get(`/api/v1/messages/${UID}?page=2&pageSize=50`).set(AUTH);
    expect(res.status).toBe(200);
    expect(service.listConversation).toHaveBeenCalledWith('user-1', UID, 2, 50);
  });

  it('propagates a 404 from the service', async () => {
    service.listConversation.mockRejectedValue(
      new AppError(404, 'USER_NOT_FOUND', 'User not found'),
    );
    const res = await request(app).get(`/api/v1/messages/${UID}`).set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects a non-ObjectId userId', async () => {
    const res = await request(app).get('/api/v1/messages/not-valid').set(AUTH);
    expect(res.status).toBe(422);
  });

  it('rejects a pageSize over the maximum', async () => {
    const res = await request(app).get(`/api/v1/messages/${UID}?pageSize=500`).set(AUTH);
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/api/v1/messages/${UID}`);
    expect(res.status).toBe(401);
  });
});
