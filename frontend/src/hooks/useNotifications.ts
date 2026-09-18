import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationFeedPage,
} from '../api/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  feed: () => [...notificationKeys.all, 'feed'] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

type NotificationFeed = InfiniteData<NotificationFeedPage, string | null>;

const FEED_PAGE_SIZE = 20;

/** Newest-first feed — `fetchNextPage` loads the next `meta.nextCursor` page. */
export function useNotificationsFeed() {
  return useInfiniteQuery({
    queryKey: notificationKeys.feed(),
    queryFn: ({ pageParam }) => listNotifications({ limit: FEED_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Unread count for the tab badge (kept live by the realtime bridge). */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadNotificationCount,
  });
}

function patchFeedItem(
  feed: NotificationFeed | undefined,
  id: string,
  patch: Partial<AppNotification>,
): NotificationFeed | undefined {
  if (!feed) {
    return feed;
  }
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  };
}

/** Marks one notification read, patching the cached row from the authoritative response. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationFeed>(notificationKeys.feed(), (feed) =>
        patchFeedItem(feed, updated.id, { readAt: updated.readAt }),
      );
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

/** Marks every notification read, zeroing the cached badge immediately. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<NotificationFeed>(notificationKeys.feed(), (feed) => {
        if (!feed) {
          return feed;
        }
        return {
          ...feed,
          pages: feed.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.readAt ? item : { ...item, readAt })),
          })),
        };
      });
      queryClient.setQueryData(notificationKeys.unreadCount(), 0);
    },
  });
}
