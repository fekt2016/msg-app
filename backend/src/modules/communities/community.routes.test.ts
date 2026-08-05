import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as communityRepositoryModule from './community.repository.js';
import * as searchModule from '../search/typesense.js';

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

vi.mock('./community.repository.js', () => ({
  communityRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByIdOrSlug: vi.fn(),
    findByIds: vi.fn(),
    findVisible: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementMemberCount: vi.fn(),
    findMember: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    countMembers: vi.fn(),
    listMembers: vi.fn(),
    listMembershipsForUser: vi.fn(),
  },
}));

vi.mock('../search/typesense.js', () => ({
  searchProvider: {
    ping: vi.fn(),
    createCollection: vi.fn(),
    upsertDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('../../realtime/communityEvents.js', () => ({
  communityEventBus: {
    emitMemberJoined: vi.fn(),
    emitMemberLeft: vi.fn(),
    emitRoleUpdated: vi.fn(),
  },
}));

const repo = vi.mocked(communityRepositoryModule.communityRepository);
const searchProvider = vi.mocked(searchModule.searchProvider);

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  searchProvider.createCollection.mockResolvedValue(undefined);
  searchProvider.upsertDocuments.mockResolvedValue(undefined);
  searchProvider.deleteDocument.mockResolvedValue(undefined);
});

function fakeCommunity(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'community-1' },
    name: 'Accra Tech',
    slug: 'accra-tech',
    description: '',
    avatar: undefined,
    visibility: 'PUBLIC',
    ownerId: { toString: () => 'user-1' },
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as never;
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('POST /api/v1/communities', () => {
  it('creates a community and returns 201', async () => {
    repo.create.mockResolvedValue(fakeCommunity());
    repo.findBySlug.mockResolvedValue(null);
    repo.addMember.mockResolvedValue({});
    repo.incrementMemberCount.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/communities')
      .set(AUTH)
      .send({ name: 'Accra Tech', description: 'Devs in Accra' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.community.name).toBe('Accra Tech');
    expect(res.body.data.role).toBe('OWNER');
  });

  it('returns 422 for an empty name', async () => {
    const res = await request(app).post('/api/v1/communities').set(AUTH).send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).post('/api/v1/communities').send({ name: 'X' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /api/v1/communities', () => {
  it('lists communities without a query', async () => {
    repo.findVisible.mockResolvedValue({
      items: [fakeCommunity()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await request(app).get('/api/v1/communities').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('searches with a q query', async () => {
    searchProvider.search.mockResolvedValue({
      hits: [{ document: { id: 'community-1' } }],
      found: 1,
      page: 1,
      perPage: 20,
    });
    repo.findByIds.mockResolvedValue([fakeCommunity()]);

    const res = await request(app).get('/api/v1/communities?q=tech').set(AUTH);

    expect(res.status).toBe(200);
    expect(searchProvider.search).toHaveBeenCalledWith(
      'communities',
      expect.objectContaining({ q: 'tech' }),
    );
  });

  it('returns 422 for an invalid page size', async () => {
    const res = await request(app).get('/api/v1/communities?pageSize=101').set(AUTH);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/communities/:identifier', () => {
  it('returns a community with membership', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });

    const res = await request(app).get('/api/v1/communities/accra-tech').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('accra-tech');
    expect(res.body.data.isMember).toBe(true);
    expect(res.body.data.role).toBe('MEMBER');
  });

  it('returns 404 for an unknown community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/communities/nope').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COMMUNITY_NOT_FOUND');
  });
});

describe('PATCH /api/v1/communities/:identifier', () => {
  it('updates a community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });
    repo.findBySlug.mockResolvedValue(null);
    repo.update.mockResolvedValue(fakeCommunity({ description: 'New desc' }));

    const res = await request(app)
      .patch('/api/v1/communities/accra-tech')
      .set(AUTH)
      .send({ description: 'New desc' });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('New desc');
  });

  it('forbids a non-member', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/communities/accra-tech')
      .set(AUTH)
      .send({ description: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 422 when the body is empty', async () => {
    const res = await request(app).patch('/api/v1/communities/accra-tech').set(AUTH).send({});

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/communities/:identifier', () => {
  it('soft-deletes a community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });
    repo.softDelete.mockResolvedValue(fakeCommunity());

    const res = await request(app).delete('/api/v1/communities/accra-tech').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('forbids a moderator from deleting', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MODERATOR' });

    const res = await request(app).delete('/api/v1/communities/accra-tech').set(AUTH);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/communities/:identifier/join', () => {
  it('joins a community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue(null);
    repo.addMember.mockResolvedValue({});
    repo.incrementMemberCount.mockResolvedValue(undefined);

    const res = await request(app).post('/api/v1/communities/accra-tech/join').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.isMember).toBe(true);
  });

  it('forbids joining a private community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity({ visibility: 'PRIVATE' }));

    const res = await request(app).post('/api/v1/communities/secret/join').set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVATE_COMMUNITY');
  });
});

describe('POST /api/v1/communities/:identifier/leave', () => {
  it('leaves a community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });
    repo.removeMember.mockResolvedValue(undefined);
    repo.incrementMemberCount.mockResolvedValue(undefined);

    const res = await request(app).post('/api/v1/communities/accra-tech/leave').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.isMember).toBe(false);
  });

  it('forbids the owner from leaving', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });

    const res = await request(app).post('/api/v1/communities/accra-tech/leave').set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE');
  });
});

describe('GET /api/v1/communities/:identifier/members', () => {
  it('lists members', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.listMembers.mockResolvedValue({
      items: [{ userId: 'user-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await request(app).get('/api/v1/communities/accra-tech/members').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PATCH /api/v1/communities/:identifier/members/:userId', () => {
  it('updates a member role', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    repo.updateMemberRole.mockResolvedValue({ role: 'MODERATOR' });

    const res = await request(app)
      .patch('/api/v1/communities/accra-tech/members/user-2')
      .set(AUTH)
      .send({ role: 'MODERATOR' });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
  });

  it('returns 422 for an invalid role', async () => {
    const res = await request(app)
      .patch('/api/v1/communities/accra-tech/members/user-2')
      .set(AUTH)
      .send({ role: 'OWNER' });

    expect(res.status).toBe(422);
  });
});
