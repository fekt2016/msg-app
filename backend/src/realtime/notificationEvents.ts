import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';

export const NOTIFICATION_EVENTS = {
  NEW: 'notification:new',
  UNREAD: 'notification:unread',
} as const;

export interface PublicNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationEventBus {
  emitNew(userId: string, notification: PublicNotificationPayload): void;
  emitUnread(userId: string, unreadCount: number): void;
  attach(io: Server): void;
}

/**
 * Thin event bus that forwards persisted in-app notifications to the recipient's
 * own `user:{userId}` room so their connected devices update the feed/badge
 * live. Holds no business logic — notification content is decided by the
 * notifications service, which calls these after persisting (ENGINEERING_RULES
 * §5).
 */
class NotificationEventBusImpl implements NotificationEventBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
    logger.info('Notification event bus attached to realtime server');
  }

  emitNew(userId: string, notification: PublicNotificationPayload): void {
    if (!this.io) {
      return;
    }
    this.io.to(`user:${userId}`).emit(NOTIFICATION_EVENTS.NEW, notification);
  }

  emitUnread(userId: string, unreadCount: number): void {
    if (!this.io) {
      return;
    }
    this.io.to(`user:${userId}`).emit(NOTIFICATION_EVENTS.UNREAD, { unreadCount });
  }
}

export const notificationEventBus: NotificationEventBus = new NotificationEventBusImpl();
