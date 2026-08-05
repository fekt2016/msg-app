import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as groupServiceModule from './group.service.js';
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

vi.mock('./group.service.js', () => ({
  groupService: {
    create: vi.fn(),
    listMine: vi.fn(),
    getForMember: vi.fn(),
    listMembers: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
    softDelete: vi.fn(),
  },
}));

const service = vi.mocked(groupServiceModule.groupService);
const app = createApp();
const AUTH = { Authorization: 'Bearer valid-token' };
const GID = '5f5f5f5f5f5f5f5f5f5f5f5f';
const UID = 'a'.repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/groups', () => {
  it('creates a group and returns 201', async () => {
    service.create.mockResolvedValue({ id: GID, name: 'Squad', role: 'OWNER' } as never);

    const res = await request(app)
      .post('/api/v1/groups')
      .set(AUTH)
      .send({ name: 'Squad', memberIds: [UID] });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('OWNER');
    expect(service.create).toHaveBeenCalledWith('user-1', { name: 'Squad', memberIds: [UID] });
  });

  it('rejects a missing name with 422', async () => {
    const res = await request(app)
      .post('/api/v1/groups')
      .set(AUTH)
      .send({ memberIds: [UID] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a non-ObjectId member id with 422', async () => {
    const res = await request(app)
      .post('/api/v1/groups')
      .set(AUTH)
      .send({ name: 'Squad', memberIds: ['nope'] });
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/groups').send({ name: 'Squad' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/groups', () => {
  it('lists the caller groups', async () => {
    service.listMine.mockResolvedValue([{ id: GID, name: 'Squad', role: 'OWNER' }] as never);
    const res = await request(app).get('/api/v1/groups').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(service.listMine).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /api/v1/groups/:groupId', () => {
  it('returns a group for a member', async () => {
    service.getForMember.mockResolvedValue({ id: GID, role: 'MEMBER' } as never);
    const res = await request(app).get(`/api/v1/groups/${GID}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(service.getForMember).toHaveBeenCalledWith('user-1', GID);
  });

  it('propagates a 403 from the service for a non-member', async () => {
    service.getForMember.mockRejectedValue(new AppError(403, 'NOT_GROUP_MEMBER', 'nope'));
    const res = await request(app).get(`/api/v1/groups/${GID}`).set(AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_GROUP_MEMBER');
  });

  it('rejects a non-ObjectId groupId', async () => {
    const res = await request(app).get('/api/v1/groups/not-valid').set(AUTH);
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/groups/:groupId/members', () => {
  it('adds members', async () => {
    service.addMembers.mockResolvedValue({ added: [UID] } as never);
    const res = await request(app)
      .post(`/api/v1/groups/${GID}/members`)
      .set(AUTH)
      .send({ memberIds: [UID] });
    expect(res.status).toBe(200);
    expect(service.addMembers).toHaveBeenCalledWith('user-1', GID, [UID]);
  });

  it('rejects an empty member list', async () => {
    const res = await request(app)
      .post(`/api/v1/groups/${GID}/members`)
      .set(AUTH)
      .send({ memberIds: [] });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/groups/:groupId/members/:userId', () => {
  it('removes a member', async () => {
    service.removeMember.mockResolvedValue(undefined as never);
    const res = await request(app).delete(`/api/v1/groups/${GID}/members/${UID}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
    expect(service.removeMember).toHaveBeenCalledWith('user-1', GID, UID);
  });
});

describe('POST /api/v1/groups/:groupId/leave', () => {
  it('leaves a group', async () => {
    service.leave.mockResolvedValue(undefined as never);
    const res = await request(app).post(`/api/v1/groups/${GID}/leave`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.left).toBe(true);
  });
});

describe('DELETE /api/v1/groups/:groupId', () => {
  it('deletes a group', async () => {
    service.softDelete.mockResolvedValue(undefined as never);
    const res = await request(app).delete(`/api/v1/groups/${GID}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(service.softDelete).toHaveBeenCalledWith('user-1', GID);
  });
});
