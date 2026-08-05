import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as groupSenderKeyRepositoryModule from './groupSenderKey.repository.js';
import * as groupRepositoryModule from '../groups/group.repository.js';

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

vi.mock('./groupSenderKey.repository.js', () => ({
  groupSenderKeyRepository: {
    find: vi.fn(),
    upsertEnvelopes: vi.fn(),
    findEnvelopeForRecipient: vi.fn(),
    listSendersForRecipient: vi.fn(),
    deleteSenderKey: vi.fn(),
    deleteByGroup: vi.fn(),
  },
}));

vi.mock('../groups/group.repository.js', () => ({
  groupRepository: {
    listMemberIds: vi.fn(),
  },
}));

const repo = vi.mocked(groupSenderKeyRepositoryModule.groupSenderKeyRepository);
const groups = vi.mocked(groupRepositoryModule.groupRepository);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const GID = '5f5f5f5f5f5f5f5f5f5f5f5f';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/e2ee/groups/:groupId/sender-keys', () => {
  it('stores sender-key envelopes and returns 201', async () => {
    groups.listMemberIds.mockResolvedValue(['user-1', 'user-2']);
    repo.upsertEnvelopes.mockResolvedValue({} as never);

    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [{ recipientId: 'user-2', keyId: 3, ciphertext: 'abc', iv: 'def' }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.envelopes).toHaveLength(1);
  });

  it('returns 403 when a non-member uploads into the group', async () => {
    groups.listMemberIds.mockResolvedValue(['user-2', 'user-3']);

    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [{ recipientId: 'user-2', keyId: 3, ciphertext: 'abc', iv: 'def' }] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_GROUP_MEMBER');
    expect(repo.upsertEnvelopes).not.toHaveBeenCalled();
  });

  it('returns 422 when envelopes is empty', async () => {
    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 422 for a malformed envelope', async () => {
    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [{ recipientId: 'user-2', ciphertext: 'abc' }] });

    expect(res.status).toBe(422);
  });

  it('rejects a groupId that is not an ObjectId', async () => {
    const res = await request(app)
      .post('/api/v1/e2ee/groups/not-an-object-id/sender-keys')
      .set(AUTH)
      .send({ envelopes: [{ recipientId: 'user-2', keyId: 3, ciphertext: 'a', iv: 'b' }] });

    expect(res.status).toBe(422);
  });

  it('rejects requests without a token', async () => {
    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .send({ envelopes: [{ recipientId: 'user-2', keyId: 3, ciphertext: 'a', iv: 'b' }] });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/e2ee/groups/:groupId/sender-keys', () => {
  it('lists senders that distributed a key to the caller', async () => {
    repo.listSendersForRecipient.mockResolvedValue([
      { senderId: 'user-1', keyId: 3, updatedAt: new Date() },
    ]);

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(repo.listSendersForRecipient).toHaveBeenCalledWith(GID, 'user-1');
  });
});

describe('GET /api/v1/e2ee/groups/:groupId/sender-keys/:senderId', () => {
  it('returns the caller envelope for a sender', async () => {
    repo.findEnvelopeForRecipient.mockResolvedValue({
      recipientId: 'user-1',
      keyId: 3,
      ciphertext: 'abc',
      iv: 'def',
      createdAt: new Date(),
    });

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys/user-9`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.recipientId).toBe('user-1');
  });

  it('returns 404 when no envelope exists for the caller', async () => {
    repo.findEnvelopeForRecipient.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys/user-9`).set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SENDER_KEY_NOT_FOUND');
  });
});

describe('DELETE /api/v1/e2ee/groups/:groupId/sender-keys/:senderId', () => {
  it('deletes the caller own sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    // Authenticated user is user-1 (see token mock), deleting user-1's own key.
    const res = await request(app)
      .delete(`/api/v1/e2ee/groups/${GID}/sender-keys/user-1`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(repo.deleteSenderKey).toHaveBeenCalledWith(GID, 'user-1');
  });

  it('forbids deleting another member sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    // Authenticated user is user-1, attempting to delete user-9's key.
    const res = await request(app)
      .delete(`/api/v1/e2ee/groups/${GID}/sender-keys/user-9`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repo.deleteSenderKey).not.toHaveBeenCalled();
  });
});
