import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import {
  notificationKeys,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsFeed,
  useUnreadNotificationCount,
} from './useNotifications';
import * as notificationsApi from '../api/notifications';
import type { AppNotification, NotificationFeedPage } from '../api/notifications';

jest.mock('../api/notifications', () => ({
  listNotifications: jest.fn(),
  getUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const mockApi = notificationsApi as jest.Mocked<typeof notificationsApi>;

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'chat:message',
    title: 'Ama',
    body: 'Sent you a message',
    data: { type: 'chat:message', senderId: 'u2', senderName: 'Ama' },
    readAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

type NotificationFeed = { pages: NotificationFeedPage[]; pageParams: (string | null)[] };

function seedFeed(queryClient: QueryClient, items: AppNotification[]) {
  queryClient.setQueryData<NotificationFeed>(notificationKeys.feed(), {
    pages: [{ items, nextCursor: null }],
    pageParams: [null],
  });
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useNotificationsFeed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the first page without a cursor', async () => {
    const { wrapper } = renderWithClient();
    mockApi.listNotifications.mockResolvedValue({
      items: [makeNotification()],
      nextCursor: 'cursor-2',
    });

    const feed = await renderHook(() => useNotificationsFeed(), { wrapper });

    await waitFor(() => {
      expect(feed.result.current.data?.pages[0].items[0].id).toBe('n1');
    });
    expect(mockApi.listNotifications).toHaveBeenCalledWith({ limit: 20, cursor: null });
  });
});

describe('useUnreadNotificationCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the count', async () => {
    const { wrapper } = renderWithClient();
    mockApi.getUnreadNotificationCount.mockResolvedValue(4);

    const count = await renderHook(() => useUnreadNotificationCount(), { wrapper });

    await waitFor(() => expect(count.result.current.data).toBe(4));
  });
});

describe('useMarkNotificationRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('patches the cached row from the authoritative response', async () => {
    const { queryClient, wrapper } = renderWithClient();
    seedFeed(queryClient, [makeNotification()]);
    mockApi.markNotificationRead.mockResolvedValue(
      makeNotification({ readAt: '2026-09-02T00:00:00.000Z' }),
    );

    const markRead = await renderHook(() => useMarkNotificationRead(), { wrapper });
    await act(async () => {
      markRead.result.current.mutate('n1');
    });

    await waitFor(() => {
      const feed = queryClient.getQueryData<NotificationFeed>(notificationKeys.feed());
      expect(feed?.pages[0].items[0].readAt).toBe('2026-09-02T00:00:00.000Z');
      expect(mockApi.markNotificationRead).toHaveBeenCalledWith('n1');
    });
  });
});

describe('useMarkAllNotificationsRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks every cached row read and zeroes the badge', async () => {
    const { queryClient, wrapper } = renderWithClient();
    seedFeed(queryClient, [
      makeNotification(),
      makeNotification({ id: 'n2', type: 'story:liked' }),
      makeNotification({ id: 'n3', readAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    queryClient.setQueryData(notificationKeys.unreadCount(), 2);
    mockApi.markAllNotificationsRead.mockResolvedValue(2);

    const markAll = await renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    await act(async () => {
      markAll.result.current.mutate();
    });

    await waitFor(() => {
      const feed = queryClient.getQueryData<NotificationFeed>(notificationKeys.feed());
      expect(feed?.pages[0].items.every((item) => item.readAt)).toBe(true);
    });
    expect(queryClient.getQueryData(notificationKeys.unreadCount())).toBe(0);
    expect(mockApi.markAllNotificationsRead).toHaveBeenCalled();
  });
});
