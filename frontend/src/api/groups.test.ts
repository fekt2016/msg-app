import {
  createGroup,
  listGroups,
  getGroup,
  listGroupMembers,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  deleteGroup,
} from './groups';
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

const group = {
  id: 'g1',
  name: 'Squad',
  avatar: null,
  ownerId: 'u1',
  memberCount: 2,
  role: 'OWNER',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('groups api', () => {
  it('createGroup posts and unwraps the envelope', async () => {
    mockClient.post.mockResolvedValueOnce({ data: { success: true, data: group } } as never);
    const result = await createGroup({ name: 'Squad', memberIds: ['u2'] });
    expect(mockClient.post).toHaveBeenCalledWith('/groups', { name: 'Squad', memberIds: ['u2'] });
    expect(result.id).toBe('g1');
  });

  it('listGroups returns the data array', async () => {
    mockClient.get.mockResolvedValueOnce({ data: { success: true, data: [group] } } as never);
    const result = await listGroups();
    expect(mockClient.get).toHaveBeenCalledWith('/groups');
    expect(result).toHaveLength(1);
  });

  it('getGroup unwraps a single group', async () => {
    mockClient.get.mockResolvedValueOnce({ data: { success: true, data: group } } as never);
    const result = await getGroup('g1');
    expect(mockClient.get).toHaveBeenCalledWith('/groups/g1');
    expect(result.name).toBe('Squad');
  });

  it('listGroupMembers maps meta into pagination', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            groupId: 'g1',
            userId: 'u2',
            role: 'MEMBER',
            joinedAt: '',
            displayName: 'Bob',
            avatarUrl: null,
          },
        ],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      },
    } as never);
    const result = await listGroupMembers('g1', { pageSize: 100 });
    expect(mockClient.get).toHaveBeenCalledWith('/groups/g1/members', {
      params: { pageSize: 100 },
    });
    expect(result.total).toBe(1);
    expect(result.items[0].displayName).toBe('Bob');
  });

  it('addGroupMembers posts memberIds', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: { success: true, data: { added: ['u3'] } },
    } as never);
    const result = await addGroupMembers('g1', ['u3']);
    expect(mockClient.post).toHaveBeenCalledWith('/groups/g1/members', { memberIds: ['u3'] });
    expect(result.added).toEqual(['u3']);
  });

  it('removeGroupMember deletes the member', async () => {
    mockClient.delete.mockResolvedValueOnce({ data: { success: true, data: null } } as never);
    await removeGroupMember('g1', 'u2');
    expect(mockClient.delete).toHaveBeenCalledWith('/groups/g1/members/u2');
  });

  it('leaveGroup posts to the leave endpoint', async () => {
    mockClient.post.mockResolvedValueOnce({ data: { success: true, data: null } } as never);
    await leaveGroup('g1');
    expect(mockClient.post).toHaveBeenCalledWith('/groups/g1/leave');
  });

  it('deleteGroup deletes the group', async () => {
    mockClient.delete.mockResolvedValueOnce({ data: { success: true, data: null } } as never);
    await deleteGroup('g1');
    expect(mockClient.delete).toHaveBeenCalledWith('/groups/g1');
  });
});
