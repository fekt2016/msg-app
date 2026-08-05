import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as repoModule from './recoveryBackup.repository.js';

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

vi.mock('./recoveryBackup.repository.js', () => ({
  recoveryBackupRepository: {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    softDelete: vi.fn(),
  },
}));

const repo = vi.mocked(repoModule.recoveryBackupRepository);

const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };

const validBackup = {
  ciphertext: 'Y2lwaGVydGV4dA==',
  iv: 'aXZpdml2aXZpdg==',
  salt: 'c2FsdHNhbHRzYWx0',
  kdf: { algorithm: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1 },
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/v1/e2ee/recovery', () => {
  it('stores a valid encrypted backup and returns 200', async () => {
    repo.upsert.mockResolvedValue({ updatedAt: new Date('2026-01-01') } as never);

    const res = await request(app).put('/api/v1/e2ee/recovery').set(AUTH).send(validBackup);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedAt).toBeDefined();
    // The server persists ciphertext + non-secret KDF params only — the phrase
    // and derived key never appear in the payload it receives.
    const [, stored] = repo.upsert.mock.calls[0];
    expect(stored.ciphertext).toBe(validBackup.ciphertext);
    expect(stored).not.toHaveProperty('phrase');
    expect(stored).not.toHaveProperty('key');
  });

  it('rejects a non-base64 ciphertext (422)', async () => {
    const res = await request(app)
      .put('/api/v1/e2ee/recovery')
      .set(AUTH)
      .send({ ...validBackup, ciphertext: 'not base64!!' });

    expect(res.status).toBe(422);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unsupported KDF algorithm (422)', async () => {
    const res = await request(app)
      .put('/api/v1/e2ee/recovery')
      .set(AUTH)
      .send({ ...validBackup, kdf: { ...validBackup.kdf, algorithm: 'pbkdf2' } });

    expect(res.status).toBe(422);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range Argon2 memory cost (422)', async () => {
    const res = await request(app)
      .put('/api/v1/e2ee/recovery')
      .set(AUTH)
      .send({ ...validBackup, kdf: { ...validBackup.kdf, memoryKiB: 10 } });

    expect(res.status).toBe(422);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).put('/api/v1/e2ee/recovery').send(validBackup);
    expect(res.status).toBe(401);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/e2ee/recovery', () => {
  it('returns the stored backup blob for restore (200)', async () => {
    repo.findByUserId.mockResolvedValue({
      ...validBackup,
      updatedAt: new Date('2026-01-01'),
    } as never);

    const res = await request(app).get('/api/v1/e2ee/recovery').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.ciphertext).toBe(validBackup.ciphertext);
    expect(res.body.data.kdf.algorithm).toBe('argon2id');
  });

  it('returns 404 when no backup exists', async () => {
    repo.findByUserId.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/e2ee/recovery').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RECOVERY_BACKUP_NOT_FOUND');
  });
});

describe('GET /api/v1/e2ee/recovery/status', () => {
  it('reports exists=true without shipping the ciphertext', async () => {
    repo.findByUserId.mockResolvedValue({
      ...validBackup,
      updatedAt: new Date('2026-01-01'),
    } as never);

    const res = await request(app).get('/api/v1/e2ee/recovery/status').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.exists).toBe(true);
    expect(res.body.data.updatedAt).toBeDefined();
    expect(res.body.data).not.toHaveProperty('ciphertext');
  });

  it('reports exists=false when there is no backup', async () => {
    repo.findByUserId.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/e2ee/recovery/status').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ exists: false, updatedAt: null });
  });
});

describe('DELETE /api/v1/e2ee/recovery', () => {
  it('disables the backup (200) and is idempotent', async () => {
    repo.softDelete.mockResolvedValue(false);

    const res = await request(app).delete('/api/v1/e2ee/recovery').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(repo.softDelete).toHaveBeenCalledWith('user-1');
  });
});
