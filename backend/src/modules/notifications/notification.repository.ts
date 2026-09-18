import {
  NotificationModel,
  type NotificationDoc,
  type NotificationType,
} from './notification.model.js';
import { decodeNotificationCursor, encodeNotificationCursor } from './notificationCursor.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  coalesceKey?: string | null;
}

export interface PaginatedNotifications {
  items: NotificationDoc[];
  nextCursor: string | null;
}

function toPage(docs: NotificationDoc[], limit: number): PaginatedNotifications {
  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    if (last) {
      nextCursor = encodeNotificationCursor({
        createdAt: last.createdAt,
        notificationId: last._id.toString(),
      });
    }
  }
  return { items, nextCursor };
}

export const notificationRepository = {
  async create(input: CreateNotificationInput): Promise<NotificationDoc> {
    return NotificationModel.create({ ...input, channel: 'IN_APP' });
  },

  /**
   * Thread-style upsert: bumps an existing *unread* row for the same
   * `{type, coalesceKey}` to the top of the feed (fresh `createdAt` + content)
   * rather than inserting a duplicate. Once the row is read, the next event
   * starts a fresh notification.
   */
  async upsertUnread(input: CreateNotificationInput): Promise<NotificationDoc> {
    const now = new Date();
    return NotificationModel.findOneAndUpdate(
      {
        userId: input.userId,
        type: input.type,
        coalesceKey: input.coalesceKey ?? null,
        readAt: null,
      },
      {
        $set: {
          title: input.title,
          body: input.body,
          data: input.data,
          createdAt: now,
          updatedAt: now,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  },

  async listFeed(
    userId: string,
    options: { limit: number; cursor?: string | null },
  ): Promise<PaginatedNotifications> {
    const filter = { userId };
    if (options.cursor) {
      const { createdAt, notificationId } = decodeNotificationCursor(options.cursor);
      const docs = await NotificationModel.find({
        ...filter,
        $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: notificationId } }],
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(options.limit + 1);
      return toPage(docs, options.limit);
    }
    const docs = await NotificationModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit + 1);
    return toPage(docs, options.limit);
  },

  async countUnread(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ userId, readAt: null });
  },

  async findOwned(notificationId: string, userId: string): Promise<NotificationDoc | null> {
    return NotificationModel.findOne({ _id: notificationId, userId });
  },

  async markRead(notificationId: string, userId: string): Promise<NotificationDoc | null> {
    return NotificationModel.findOneAndUpdate(
      { _id: notificationId, userId, readAt: null },
      { $set: { readAt: new Date() } },
      { new: true },
    );
  },

  async markAllRead(userId: string): Promise<number> {
    const result = await NotificationModel.updateMany(
      { userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return result.modifiedCount;
  },
};
