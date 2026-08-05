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
    // `sub` must be an ObjectId — sender/recipient ids are ObjectId refs.
    return {
      sub: '5f5f5f5f5f5f5f5f5f5f5f01',
      role: 'USER',
      deviceId: 'device-1',
      type: 'access',
    };
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
    deleteEnvelopesForRecipient: vi.fn(),
  },
}));

vi.mock('../groups/group.repository.js', () => ({
  groupRepository: {
    listMemberIds: vi.fn(),
    isMember: vi.fn(),
  },
}));

const repo = vi.mocked(groupSenderKeyRepositoryModule.groupSenderKeyRepository);
const groups = vi.mocked(groupRepositoryModule.groupRepository);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const GID = '5f5f5f5f5f5f5f5f5f5f5f5f';
// The authenticated caller (matches the token mock's `sub`) and another member.
const CALLER = '5f5f5f5f5f5f5f5f5f5f5f01';
const OTHER = '5f5f5f5f5f5f5f5f5f5f5f02';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/e2ee/groups/:groupId/sender-keys', () => {
  it('stores sender-key envelopes and returns 201', async () => {
    groups.listMemberIds.mockResolvedValue([CALLER, OTHER]);
    repo.upsertEnvelopes.mockResolvedValue({} as never);

    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [{ recipientId: OTHER, keyId: 3, ciphertext: 'abc', iv: 'def' }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.envelopes).toHaveLength(1);
  });

  it('returns 403 when a non-member uploads into the group', async () => {
    groups.listMemberIds.mockResolvedValue([OTHER, 'user-3']);

    const res = await request(app)
      .post(`/api/v1/e2ee/groups/${GID}/sender-keys`)
      .set(AUTH)
      .send({ envelopes: [{ recipientId: OTHER, keyId: 3, ciphertext: 'abc', iv: 'def' }] });

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
    groups.isMember.mockResolvedValue(true);
    repo.listSendersForRecipient.mockResolvedValue([
      { senderId: OTHER, keyId: 3, updatedAt: new Date() },
    ]);

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(repo.listSendersForRecipient).toHaveBeenCalledWith(GID, CALLER);
  });

  it('returns 403 for a caller who is no longer a member', async () => {
    groups.isMember.mockResolvedValue(false);

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys`).set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_GROUP_MEMBER');
    expect(repo.listSendersForRecipient).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/e2ee/groups/:groupId/sender-keys/:senderId', () => {
  it('returns the caller envelope for a sender', async () => {
    groups.isMember.mockResolvedValue(true);
    repo.findEnvelopeForRecipient.mockResolvedValue({
      recipientId: CALLER,
      keyId: 3,
      ciphertext: 'abc',
      iv: 'def',
      createdAt: new Date(),
    });

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys/${OTHER}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.recipientId).toBe(CALLER);
  });

  it('returns 404 when no envelope exists for the caller', async () => {
    groups.isMember.mockResolvedValue(true);
    repo.findEnvelopeForRecipient.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/e2ee/groups/${GID}/sender-keys/${OTHER}`).set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SENDER_KEY_NOT_FOUND');
  });

  it('rejects a senderId that is not an ObjectId (422, not a 500 CastError)', async () => {
    const res = await request(app)
      .get(`/api/v1/e2ee/groups/${GID}/sender-keys/not-an-object-id`)
      .set(AUTH);

    expect(res.status).toBe(422);
    expect(repo.findEnvelopeForRecipient).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/e2ee/groups/:groupId/sender-keys/:senderId', () => {
  it('deletes the caller own sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    // Authenticated caller is CALLER (see token mock), deleting their own key.
    const res = await request(app)
      .delete(`/api/v1/e2ee/groups/${GID}/sender-keys/${CALLER}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(repo.deleteSenderKey).toHaveBeenCalledWith(GID, CALLER);
  });

  it('forbids deleting another member sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    // Authenticated caller is CALLER, attempting to delete OTHER's key.
    const res = await request(app)
      .delete(`/api/v1/e2ee/groups/${GID}/sender-keys/${OTHER}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repo.deleteSenderKey).not.toHaveBeenCalled();
  });
});
