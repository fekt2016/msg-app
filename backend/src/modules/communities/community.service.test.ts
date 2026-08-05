import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as communityRepositoryModule from './community.repository.js';
import * as searchModule from '../search/typesense.js';
import * as eventBusModule from '../../realtime/communityEvents.js';
import { communityService } from './community.service.js';

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
  COMMUNITY_EVENTS: {
    MEMBER_JOINED: 'community:member:joined',
    MEMBER_LEFT: 'community:member:left',
    ROLE_UPDATED: 'community:member:role',
  },
  communityEventBus: {
    emitMemberJoined: vi.fn(),
    emitMemberLeft: vi.fn(),
    emitRoleUpdated: vi.fn(),
  },
}));

const repo = vi.mocked(communityRepositoryModule.communityRepository);
const searchProvider = vi.mocked(searchModule.searchProvider);
const eventBus = vi.mocked(eventBusModule.communityEventBus);

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('communityService.create', () => {
  it('creates a community, adds the creator as owner, and indexes it', async () => {
    repo.create.mockResolvedValue(fakeCommunity());
    repo.findBySlug.mockResolvedValue(null);
    repo.addMember.mockResolvedValue({});
    repo.incrementMemberCount.mockResolvedValue(undefined);
    searchProvider.createCollection.mockResolvedValue(undefined);
    searchProvider.upsertDocuments.mockResolvedValue(undefined);

    const result = await communityService.create('user-1', { name: 'Accra Tech' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'accra-tech', visibility: 'PUBLIC', ownerId: 'user-1' }),
    );
    expect(repo.addMember).toHaveBeenCalledWith('community-1', 'user-1', 'OWNER');
    expect(searchProvider.createCollection).toHaveBeenCalled();
    expect(searchProvider.upsertDocuments).toHaveBeenCalledWith('communities', [
      expect.objectContaining({ id: 'community-1', name: 'Accra Tech' }),
    ]);
    expect(result.role).toBe('OWNER');
    expect(result.community.slug).toBe('accra-tech');
  });

  it('generates a unique slug when the base slug is taken', async () => {
    repo.create.mockResolvedValue(fakeCommunity({ slug: 'accra-tech-2' }));
    repo.findBySlug.mockResolvedValueOnce(fakeCommunity()).mockResolvedValueOnce(null);

    await communityService.create('user-1', { name: 'Accra Tech' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'accra-tech-2' }));
  });

  it('creates a private community when visibility is PRIVATE', async () => {
    repo.create.mockResolvedValue(fakeCommunity({ visibility: 'PRIVATE' }));
    repo.findBySlug.mockResolvedValue(null);

    await communityService.create('user-1', { name: 'Secret Group', visibility: 'PRIVATE' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'PRIVATE' }));
  });
});

describe('communityService.list', () => {
  it('lists visible communities without a search query', async () => {
    repo.findVisible.mockResolvedValue({
      items: [fakeCommunity()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await communityService.list(1, 20);

    expect(repo.findVisible).toHaveBeenCalledWith(1, 20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Accra Tech');
  });

  it('searches via Typesense when a query is provided', async () => {
    searchProvider.search.mockResolvedValue({
      hits: [{ document: { id: 'community-1' } }],
      found: 1,
      page: 1,
      perPage: 20,
    });
    repo.findByIds.mockResolvedValue([fakeCommunity()]);

    const result = await communityService.list(1, 20, 'tech');

    expect(searchProvider.search).toHaveBeenCalledWith(
      'communities',
      expect.objectContaining({ q: 'tech', queryBy: 'name,description,slug' }),
    );
    expect(result.items[0].name).toBe('Accra Tech');
  });

  it('falls back to visible listing when search fails', async () => {
    searchProvider.search.mockRejectedValue(new Error('boom'));
    repo.findVisible.mockResolvedValue({
      items: [fakeCommunity()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await communityService.list(1, 20, 'tech');

    expect(result.items).toHaveLength(1);
  });
});

describe('communityService.getByIdOrSlug', () => {
  it('returns the community without membership for anonymous viewers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());

    const result = await communityService.getByIdOrSlug('accra-tech');

    expect(result).toEqual(
      expect.objectContaining({ isMember: false, role: null, slug: 'accra-tech' }),
    );
    expect(repo.findMember).not.toHaveBeenCalled();
  });

  it('returns membership for authenticated viewers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });

    const result = await communityService.getByIdOrSlug('community-1', 'user-2');

    expect(result.isMember).toBe(true);
    expect(result.role).toBe('MEMBER');
  });

  it('throws 404 for a deleted community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity({ deletedAt: new Date() }));

    await expect(communityService.getByIdOrSlug('accra-tech')).rejects.toMatchObject({
      code: 'COMMUNITY_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws 404 when not found', async () => {
    repo.findByIdOrSlug.mockResolvedValue(null);

    await expect(communityService.getByIdOrSlug('nope')).rejects.toMatchObject({
      code: 'COMMUNITY_NOT_FOUND',
    });
  });
});

describe('communityService.update', () => {
  it('updates name, regenerates the slug, and reindexes', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });
    repo.findBySlug.mockResolvedValue(null);
    repo.update.mockResolvedValue(fakeCommunity({ name: 'New Name', slug: 'new-name' }));
    searchProvider.upsertDocuments.mockResolvedValue(undefined);

    const result = await communityService.update('user-1', 'accra-tech', { name: 'New Name' });

    expect(repo.update).toHaveBeenCalledWith('community-1', { name: 'New Name', slug: 'new-name' });
    expect(searchProvider.upsertDocuments).toHaveBeenCalled();
    expect(result.name).toBe('New Name');
  });

  it('forbids non-members from updating', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue(null);

    await expect(
      communityService.update('user-9', 'accra-tech', { description: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('forbids plain members from updating', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });

    await expect(
      communityService.update('user-9', 'accra-tech', { description: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('communityService.softDelete', () => {
  it('soft-deletes and removes the search document', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });
    repo.softDelete.mockResolvedValue(fakeCommunity({ deletedAt: new Date() }));
    searchProvider.deleteDocument.mockResolvedValue(undefined);

    await communityService.softDelete('user-1', 'accra-tech');

    expect(repo.softDelete).toHaveBeenCalledWith('community-1');
    expect(searchProvider.deleteDocument).toHaveBeenCalledWith('communities', 'community-1');
  });

  it('forbids moderators from deleting', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MODERATOR' });

    await expect(communityService.softDelete('user-2', 'accra-tech')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('communityService.join', () => {
  it('joins a public community and emits an event', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue(null);
    repo.addMember.mockResolvedValue({});
    repo.incrementMemberCount.mockResolvedValue(undefined);

    const result = await communityService.join('user-2', 'accra-tech');

    expect(repo.addMember).toHaveBeenCalledWith('community-1', 'user-2', 'MEMBER');
    expect(eventBus.emitMemberJoined).toHaveBeenCalledWith('community-1', 'user-2', 'MEMBER');
    expect(result.isMember).toBe(true);
    expect(result.memberCount).toBe(2);
  });

  it('forbids joining a private community', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity({ visibility: 'PRIVATE' }));

    await expect(communityService.join('user-2', 'secret')).rejects.toMatchObject({
      code: 'PRIVATE_COMMUNITY',
      statusCode: 403,
    });
  });

  it('is idempotent for existing members', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });

    const result = await communityService.join('user-2', 'accra-tech');

    expect(repo.addMember).not.toHaveBeenCalled();
    expect(result.isMember).toBe(true);
    expect(result.role).toBe('MEMBER');
  });
});

describe('communityService.leave', () => {
  it('leaves and emits an event', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'MEMBER' });
    repo.removeMember.mockResolvedValue(undefined);
    repo.incrementMemberCount.mockResolvedValue(undefined);

    const result = await communityService.leave('user-2', 'accra-tech');

    expect(repo.removeMember).toHaveBeenCalledWith('community-1', 'user-2');
    expect(eventBus.emitMemberLeft).toHaveBeenCalledWith('community-1', 'user-2');
    expect(result.isMember).toBe(false);
  });

  it('forbids the owner from leaving', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });

    await expect(communityService.leave('user-1', 'accra-tech')).rejects.toMatchObject({
      code: 'OWNER_CANNOT_LEAVE',
      statusCode: 400,
    });
  });
});

describe('communityService.updateRole', () => {
  it('updates a member role to MODERATOR and emits an event', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    repo.updateMemberRole.mockResolvedValue({ role: 'MODERATOR' });

    await communityService.updateRole('user-1', 'accra-tech', 'user-2', 'MODERATOR');

    expect(repo.updateMemberRole).toHaveBeenCalledWith('community-1', 'user-2', 'MODERATOR');
    expect(eventBus.emitRoleUpdated).toHaveBeenCalledWith('community-1', 'user-2', 'MODERATOR');
  });

  it('cannot assign the OWNER role', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember.mockResolvedValue({ role: 'OWNER' });

    await expect(
      communityService.updateRole('user-1', 'accra-tech', 'user-2', 'OWNER'),
    ).rejects.toMatchObject({ code: 'CANNOT_ASSIGN_OWNER' });
  });

  it('cannot modify the owner role', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.findMember
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'OWNER' });

    await expect(
      communityService.updateRole('user-1', 'accra-tech', 'user-1', 'MODERATOR'),
    ).rejects.toMatchObject({ code: 'CANNOT_MODIFY_OWNER' });
  });
});

describe('communityService.listMembers', () => {
  it('returns paginated members', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeCommunity());
    repo.listMembers.mockResolvedValue({
      items: [{ userId: 'user-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await communityService.listMembers('accra-tech', 1, 20);

    expect(repo.listMembers).toHaveBeenCalledWith('community-1', 1, 20);
    expect(result.items).toHaveLength(1);
  });
});
