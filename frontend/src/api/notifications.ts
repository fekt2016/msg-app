import { apiClient } from './client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export type NotificationType =
  | 'chat:message'
  | 'community:role'
  | 'group:member:joined'
  | 'group:member:left'
  | 'channel:post:new'
  | 'channel:request:approved'
  | 'story:liked';

/** The backend-attached routing payload (ids + names — never message content, which is E2EE). */
export interface NotificationData {
  type?: string;
  senderId?: string;
  senderName?: string;
  groupId?: string;
  groupName?: string;
  identifier?: string;
  channelName?: string;
  postId?: string;
  storyId?: string;
  authorId?: string;
  authorDisplayName?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
}

/** Cursor-paginated feed (mirrors the channel posts' cursor page shape). */
export interface NotificationFeedPage {
  items: AppNotification[];
  nextCursor: string | null;
}

export async function listNotifications(
  params: { limit?: number; cursor?: string | null } = {},
): Promise<NotificationFeedPage> {
  const query: Record<string, unknown> = {};
  if (params.limit != null) query.limit = params.limit;
  if (params.cursor != null) query.cursor = params.cursor;
  const res = await apiClient.get<ApiEnvelope<AppNotification[]>>('/notifications', {
    params: query,
  });
  return {
    items: res.data.data,
    nextCursor: (res.data.meta?.nextCursor as string | null) ?? null,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const res = await apiClient.get<ApiEnvelope<{ count: number }>>('/notifications/unread-count');
  return res.data.data.count;
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  const res = await apiClient.post<ApiEnvelope<AppNotification>>('/notifications/read', {
    notificationId,
  });
  return res.data.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const res =
    await apiClient.post<ApiEnvelope<{ updatedCount: number }>>('/notifications/read-all');
  return res.data.data.updatedCount;
}
