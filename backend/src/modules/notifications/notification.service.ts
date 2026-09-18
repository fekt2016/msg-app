import { logger } from '../../config/logger.js';
import { AppError } from '../../errors/AppError.js';
import { userRepository } from '../auth/user.repository.js';
import { notificationRepository, type CreateNotificationInput } from './notification.repository.js';
import type { NotificationDoc, NotificationType } from './notification.model.js';
import { notificationEventBus } from '../../realtime/notificationEvents.js';

export interface PublicNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface NewNotification extends Omit<CreateNotificationInput, 'userId'> {
  userId: string;
}

function toPublic(n: NotificationDoc): PublicNotification {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, unknown>) ?? {},
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

/**
 * Records an in-app notification and fans it out to the recipient's realtime
 * room. Never throws — every call site fires-and-forgets from an event path and
 * a failed notification (storage or realtime) must never take those paths down.
 */
async function notify(input: NewNotification): Promise<void> {
  try {
    const doc = input.coalesceKey
      ? await notificationRepository.upsertUnread(input)
      : await notificationRepository.create(input);
    notificationEventBus.emitNew(input.userId, toPublic(doc));
    const unread = await notificationRepository.countUnread(input.userId);
    notificationEventBus.emitUnread(input.userId, unread);
  } catch (err) {
    logger.warn(
      { err, userId: input.userId, type: input.type },
      'Failed to record in-app notification',
    );
  }
}

// Human-readable verb per role for the community role-changed body.
const ROLE_DISPLAY: Record<string, string> = {
  MODERATOR: 'a moderator',
  MEMBER: 'a member',
};

export const notificationService = {
  // Feed / read-state are the user-visible API surface and may throw typed
  // errors for the route handlers — unlike `notify`, which is fire-and-forget.
  async listFeed(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ items: PublicNotification[]; nextCursor: string | null }> {
    const result = await notificationRepository.listFeed(userId, { limit, cursor });
    return { items: result.items.map(toPublic), nextCursor: result.nextCursor };
  },

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    return { count: await notificationRepository.countUnread(userId) };
  },

  async markRead(userId: string, notificationId: string): Promise<PublicNotification> {
    const owned = await notificationRepository.findOwned(notificationId, userId);
    if (!owned) {
      throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    }
    let doc = owned;
    if (!owned.readAt) {
      const updated = await notificationRepository.markRead(notificationId, userId);
      if (updated) {
        doc = updated;
      }
    }
    notificationEventBus.emitUnread(userId, await notificationRepository.countUnread(userId));
    return toPublic(doc);
  },

  async markAllRead(userId: string): Promise<{ updatedCount: number }> {
    const updatedCount = await notificationRepository.markAllRead(userId);
    notificationEventBus.emitUnread(userId, 0);
    return { updatedCount };
  },

  /**
   * 1:1 chat (E2EE). Body/data carry sender metadata only — never message
   * content, which the server cannot read. Coalesced to one unread row per
   * conversation so a busy chat never floods the feed.
   */
  async chatMessage(senderId: string, recipientId: string): Promise<void> {
    try {
      const sender = await userRepository.findById(senderId);
      const senderName = sender?.displayName ?? 'New message';
      await notify({
        userId: recipientId,
        type: 'chat:message',
        title: senderName,
        body: 'Sent you a message',
        data: { type: 'chat:message', senderId, senderName },
        coalesceKey: `chat:${senderId}`,
      });
    } catch (err) {
      logger.warn({ err, senderId, recipientId }, 'Failed to record chat notification');
    }
  },

  /** Member promoted/demoted — delivered to the affected member only. */
  async communityRoleUpdated(
    communitySlug: string,
    communityName: string,
    targetUserId: string,
    role: string,
  ): Promise<void> {
    await notify({
      userId: targetUserId,
      type: 'community:role',
      title: communityName,
      body: `You are now ${ROLE_DISPLAY[role] ?? role.toLowerCase()}`,
      data: { type: 'community:role', identifier: communitySlug },
    });
  },

  /**
   * A member was added to a group — delivered to the other members (the joiner
   * knows they were added; `notifyMemberIds` excludes them and the actor).
   */
  async groupMemberJoined(
    groupId: string,
    groupName: string,
    joinerId: string,
    notifyMemberIds: string[],
  ): Promise<void> {
    try {
      if (notifyMemberIds.length === 0) {
        return;
      }
      const joiner = await userRepository.findById(joinerId);
      const joinerName = joiner?.displayName ?? 'A member';
      await Promise.all(
        notifyMemberIds.map((memberId) =>
          notify({
            userId: memberId,
            type: 'group:member:joined',
            title: groupName,
            body: `${joinerName} joined the group`,
            data: { type: 'group:member:joined', groupId, groupName },
          }),
        ),
      );
    } catch (err) {
      logger.warn({ err, groupId, joinerId }, 'Failed to record group-joined notifications');
    }
  },

  /** Member removed from a group — delivered to the removed member only. */
  async groupMemberRemoved(
    groupId: string,
    groupName: string,
    targetUserId: string,
  ): Promise<void> {
    await notify({
      userId: targetUserId,
      type: 'group:member:left',
      title: groupName,
      body: 'You were removed from the group',
      data: { type: 'group:member:left', groupId, groupName },
    });
  },

  /** New channel post — fan-out to subscribers, excluding the author. */
  async channelPostCreated(
    channelSlug: string,
    channelName: string,
    subscriberIds: string[],
    authorId: string,
    authorName: string,
    postId: string,
  ): Promise<void> {
    try {
      if (subscriberIds.length === 0) {
        return;
      }
      await Promise.all(
        subscriberIds.map((subscriberId) =>
          subscriberId === authorId
            ? Promise.resolve()
            : notify({
                userId: subscriberId,
                type: 'channel:post:new',
                title: channelName,
                body: `${authorName} posted a message`,
                data: {
                  type: 'channel:post:new',
                  identifier: channelSlug,
                  channelName,
                  postId,
                },
              }),
        ),
      );
    } catch (err) {
      logger.warn({ err, channelSlug, authorId }, 'Failed to record channel-post notifications');
    }
  },

  /** Private-channel join request approved — delivered to the requester. */
  async channelRequestApproved(
    channelSlug: string,
    channelName: string,
    targetUserId: string,
  ): Promise<void> {
    await notify({
      userId: targetUserId,
      type: 'channel:request:approved',
      title: channelName,
      body: 'Your request to join was approved',
      data: { type: 'channel:request:approved', identifier: channelSlug, channelName },
    });
  },

  /** Story liked — delivered to the author (never the liker themselves). */
  async storyLiked(storyId: string, likerId: string, authorId: string): Promise<void> {
    try {
      if (likerId === authorId) {
        return;
      }
      const [liker, author] = await Promise.all([
        userRepository.findById(likerId),
        userRepository.findById(authorId),
      ]);
      await notify({
        userId: authorId,
        type: 'story:liked',
        title: liker?.displayName ?? 'Someone',
        body: 'Liked your story',
        data: {
          type: 'story:liked',
          storyId,
          authorId,
          authorDisplayName: author?.displayName ?? '',
        },
      });
    } catch (err) {
      logger.warn({ err, storyId, likerId, authorId }, 'Failed to record story-like notification');
    }
  },
};
