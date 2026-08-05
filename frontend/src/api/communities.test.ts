import {
  createCommunity,
  listCommunities,
  getCommunity,
  updateCommunity,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  listCommunityMembers,
  updateMemberRole,
} from './communities';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

const community = {
  id: 'c1',
  name: 'Accra Tech',
  slug: 'accra-tech',
  description: 'Builders in Accra',
  avatar: null,
  visibility: 'PUBLIC',
  ownerId: 'u1',
  memberCount: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const withMembership = { ...community, isMember: true, role: 'OWNER' };

const member = {
  communityId: 'c1',
  userId: 'u2',
  role: 'MEMBER',
  joinedAt: '2026-08-02T00:00:00.000Z',
  displayName: 'Kofi',
  avatarUrl: null,
};

const pageMeta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

describe('communities API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a community and unwraps the envelope', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { community, role: 'OWNER' } },
    });

    await expect(
      createCommunity({
        name: 'Accra Tech',
        description: 'Builders in Accra',
        visibility: 'PUBLIC',
      }),
    ).resolves.toEqual({ community, role: 'OWNER' });
    expect(mockClient.post).toHaveBeenCalledWith('/communities', {
      name: 'Accra Tech',
      description: 'Builders in Accra',
      visibility: 'PUBLIC',
    });
  });

  it('lists communities and maps pagination meta', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [community], meta: pageMeta },
    });

    await expect(listCommunities({ q: 'tech', page: 1, pageSize: 20 })).resolves.toEqual({
      items: [community],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/communities', {
      params: { q: 'tech', page: 1, pageSize: 20 },
    });
  });

  it('gets a single community with membership info', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: withMembership } });

    await expect(getCommunity('accra-tech')).resolves.toEqual(withMembership);
    expect(mockClient.get).toHaveBeenCalledWith('/communities/accra-tech');
  });

  it('updates a community', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: community } });

    await expect(updateCommunity('accra-tech', { name: 'Accra Tech' })).resolves.toEqual(community);
    expect(mockClient.patch).toHaveBeenCalledWith('/communities/accra-tech', {
      name: 'Accra Tech',
    });
  });

  it('deletes a community', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: null } });

    await expect(deleteCommunity('accra-tech')).resolves.toBeUndefined();
    expect(mockClient.delete).toHaveBeenCalledWith('/communities/accra-tech');
  });

  it('joins a community', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: withMembership } });

    await expect(joinCommunity('accra-tech')).resolves.toEqual(withMembership);
    expect(mockClient.post).toHaveBeenCalledWith('/communities/accra-tech/join');
  });

  it('leaves a community', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { ...withMembership, isMember: false, role: null } },
    });

    await expect(leaveCommunity('accra-tech')).resolves.toEqual({
      ...withMembership,
      isMember: false,
      role: null,
    });
    expect(mockClient.post).toHaveBeenCalledWith('/communities/accra-tech/leave');
  });

  it('lists members with pagination meta', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [member], meta: pageMeta },
    });

    await expect(listCommunityMembers('accra-tech', { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [member],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/communities/accra-tech/members', {
      params: { page: 1, pageSize: 20 },
    });
  });

  it('updates a member role', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: null } });

    await expect(updateMemberRole('accra-tech', 'u2', 'MODERATOR')).resolves.toBeUndefined();
    expect(mockClient.patch).toHaveBeenCalledWith('/communities/accra-tech/members/u2', {
      role: 'MODERATOR',
    });
  });
});
