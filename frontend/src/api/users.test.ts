import { getMyProfile, listUsers, updateMyProfile, uploadAvatar } from './users';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

const profile = {
  id: 'u1',
  email: 'a@b.com',
  phone: null,
  displayName: 'A',
  bio: 'Hi',
  avatar: { publicId: 'p', url: 'https://cdn/p', width: 512, height: 512 },
  role: 'USER',
  status: 'VERIFIED',
  isVerified: true,
};

describe('users API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gets the profile', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: profile } });

    await expect(getMyProfile()).resolves.toEqual(profile);
    expect(mockClient.get).toHaveBeenCalledWith('/users/me');
  });

  it('lists chat users requesting the max page size (no pagination UI yet)', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: [profile] } });

    await expect(listUsers()).resolves.toEqual([profile]);
    expect(mockClient.get).toHaveBeenCalledWith('/users', { params: { pageSize: 100 } });
  });

  it('updates the profile', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: profile } });

    await expect(updateMyProfile({ displayName: 'A', bio: 'Hi' })).resolves.toEqual(profile);
    expect(mockClient.patch).toHaveBeenCalledWith('/users/me', { displayName: 'A', bio: 'Hi' });
  });

  it('uploads an avatar as multipart form data', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: profile } });

    await expect(
      uploadAvatar({ uri: 'file:///tmp/a.jpg', name: 'a.jpg', type: 'image/jpeg' }),
    ).resolves.toEqual(profile);

    expect(mockClient.post).toHaveBeenCalledWith(
      '/users/me/avatar',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });
});
