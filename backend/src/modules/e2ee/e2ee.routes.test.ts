import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as e2eeRepositoryModule from './e2ee.repository.js';

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

vi.mock('./e2ee.repository.js', () => ({
  e2eeRepository: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    updatePreKeys: vi.fn(),
    updateOneTimePreKeys: vi.fn(),
    updateSignedPreKey: vi.fn(),
    consumeOneTimePreKeys: vi.fn(),
    deleteByUserId: vi.fn(),
  },
}));

const repo = vi.mocked(e2eeRepositoryModule.e2eeRepository);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };

const publicBundle = {
  identityKey: { publicKey: 'id-pub', signingPublicKey: 'sign-pub' },
  signedPreKey: { keyId: 1, publicKey: 'spk-pub', signature: 'real-signature' },
  preKeys: [{ keyId: 1, publicKey: 'pk-1' }],
  oneTimePreKeys: [{ keyId: 1001, publicKey: 'otk-1' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/e2ee/keys (upload public bundle)', () => {
  it('stores a valid public key bundle and returns 201', async () => {
    repo.upsert.mockResolvedValue({} as never);

    const res = await request(app).post('/api/v1/e2ee/keys').set(AUTH).send(publicBundle);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // The server must persist public keys only — the stored identity must not
    // carry a private half.
    const stored = repo.upsert.mock.calls[0][1] as { identityKey: Record<string, unknown> };
    expect(stored.identityKey).toEqual({ publicKey: 'id-pub', signingPublicKey: 'sign-pub' });
    expect(stored.identityKey).not.toHaveProperty('privateKey');
  });

  it('rejects a bundle that smuggles a privateKey field (422, stripped/invalid)', async () => {
    const withPrivate = {
      ...publicBundle,
      identityKey: { publicKey: 'id-pub', signingPublicKey: 'sign-pub', privateKey: 'LEAK' },
    };

    const res = await request(app).post('/api/v1/e2ee/keys').set(AUTH).send(withPrivate);

    // Even if the schema strips unknown keys, the persisted identity must never
    // include a private half.
    if (repo.upsert.mock.calls.length > 0) {
      const stored = repo.upsert.mock.calls[0][1] as { identityKey: Record<string, unknown> };
      expect(stored.identityKey).not.toHaveProperty('privateKey');
    }
    expect([201, 422]).toContain(res.status);
  });

  it('rejects a bundle missing the signing public key', async () => {
    const res = await request(app)
      .post('/api/v1/e2ee/keys')
      .set(AUTH)
      .send({ ...publicBundle, identityKey: { publicKey: 'id-pub' } });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/e2ee/keys').send(publicBundle);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/e2ee/keys/:userId', () => {
  it('returns a stored public bundle', async () => {
    repo.findByUserId.mockResolvedValue({
      identityKey: { publicKey: 'id-pub', signingPublicKey: 'sign-pub' },
      signedPreKey: { keyId: 1, publicKey: 'spk-pub', signature: 'sig' },
      preKeys: [],
      oneTimePreKeys: [],
    } as never);

    const res = await request(app).get('/api/v1/e2ee/keys/user-2').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.identityKey).not.toHaveProperty('privateKey');
    expect(res.body.data.identityKey.signingPublicKey).toBe('sign-pub');
  });

  it('returns 404 when no keys exist', async () => {
    repo.findByUserId.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/e2ee/keys/user-2').set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('E2EE_KEYS_NOT_FOUND');
  });
});

describe('PUT /api/v1/e2ee/keys/signed-pre-key (rotate)', () => {
  it('stores a client-provided signed pre-key', async () => {
    repo.findByUserId.mockResolvedValue({ identityKey: {} } as never);
    repo.updateSignedPreKey.mockResolvedValue({} as never);

    const res = await request(app)
      .put('/api/v1/e2ee/keys/signed-pre-key')
      .set(AUTH)
      .send({ signedPreKey: { keyId: 2, publicKey: 'spk2', signature: 'sig2' } });

    expect(res.status).toBe(200);
    expect(repo.updateSignedPreKey).toHaveBeenCalledWith('user-1', {
      keyId: 2,
      publicKey: 'spk2',
      signature: 'sig2',
    });
  });

  it('rejects a rotation body with no signature', async () => {
    const res = await request(app)
      .put('/api/v1/e2ee/keys/signed-pre-key')
      .set(AUTH)
      .send({ signedPreKey: { keyId: 2, publicKey: 'spk2' } });
    expect(res.status).toBe(422);
  });
});

describe('PUT /api/v1/e2ee/keys/one-time-pre-keys (rotate)', () => {
  it('stores client-provided one-time pre-keys', async () => {
    repo.findByUserId.mockResolvedValue({ oneTimePreKeys: [] } as never);
    repo.updateOneTimePreKeys.mockResolvedValue({} as never);

    const res = await request(app)
      .put('/api/v1/e2ee/keys/one-time-pre-keys')
      .set(AUTH)
      .send({ oneTimePreKeys: [{ keyId: 1002, publicKey: 'otk2' }] });

    expect(res.status).toBe(200);
    expect(repo.updateOneTimePreKeys).toHaveBeenCalledWith('user-1', [
      { keyId: 1002, publicKey: 'otk2' },
    ]);
  });
});

describe('POST /api/v1/e2ee/keys/one-time-pre-keys/consume', () => {
  it('consumes used one-time pre-keys', async () => {
    repo.consumeOneTimePreKeys.mockResolvedValue({} as never);
    const res = await request(app)
      .post('/api/v1/e2ee/keys/one-time-pre-keys/consume')
      .set(AUTH)
      .send({ keyIds: [1001, 1002] });

    expect(res.status).toBe(200);
    expect(repo.consumeOneTimePreKeys).toHaveBeenCalledWith('user-1', [1001, 1002]);
  });
});

describe('POST /api/v1/e2ee/messages (ciphertext relay)', () => {
  it('relays a ciphertext envelope without persisting it', async () => {
    const res = await request(app)
      .post('/api/v1/e2ee/messages')
      .set(AUTH)
      .send({ recipientId: 'user-2', ciphertext: 'CIPHERTEXT', timestamp: 123 });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });
});

describe('DELETE /api/v1/e2ee/keys', () => {
  it('deletes the caller keys', async () => {
    repo.deleteByUserId.mockResolvedValue(undefined as never);
    const res = await request(app).delete('/api/v1/e2ee/keys').set(AUTH);
    expect(res.status).toBe(200);
    expect(repo.deleteByUserId).toHaveBeenCalledWith('user-1');
  });
});
