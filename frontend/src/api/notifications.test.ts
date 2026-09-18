import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from './notifications';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
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

const notification: AppNotification = {
  id: 'n1',
  type: 'channel:post:new',
  title: 'Accra News',
  body: 'Ama posted a message',
  data: {
    type: 'channel:post:new',
    identifier: 'accra-news',
    channelName: 'Accra News',
    postId: 'p1',
  },
  readAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('notifications API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists notifications and unwraps the cursor from meta', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        success: true,
        data: [notification],
        meta: { nextCursor: 'cursor-2' },
      },
    });

    await expect(listNotifications({ limit: 20, cursor: 'cursor-1' })).resolves.toEqual({
      items: [notification],
      nextCursor: 'cursor-2',
    });
    expect(mockClient.get).toHaveBeenCalledWith('/notifications', {
      params: { limit: 20, cursor: 'cursor-1' },
    });
  });

  it('omits null cursor and limit params when not provided', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [], meta: { nextCursor: null } },
    });

    await expect(listNotifications()).resolves.toEqual({ items: [], nextCursor: null });
    expect(mockClient.get).toHaveBeenCalledWith('/notifications', { params: {} });
  });

  it('returns the unread count', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: { count: 3 } } });

    await expect(getUnreadNotificationCount()).resolves.toBe(3);
    expect(mockClient.get).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('marks a notification read', async () => {
    const read = { ...notification, readAt: '2026-09-02T00:00:00.000Z' };
    mockClient.post.mockResolvedValue({ data: { success: true, data: read } });

    await expect(markNotificationRead('n1')).resolves.toEqual(read);
    expect(mockClient.post).toHaveBeenCalledWith('/notifications/read', { notificationId: 'n1' });
  });

  it('marks all notifications read', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: { updatedCount: 5 } } });

    await expect(markAllNotificationsRead()).resolves.toBe(5);
    expect(mockClient.post).toHaveBeenCalledWith('/notifications/read-all');
  });
});
