import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';
import type { SafePost } from '../modules/channels/channelPost.service.js';
import type { ReactionCounts } from '../modules/channels/channelReaction.service.js';

export const CHANNEL_EVENTS = {
  POST_NEW: 'channel:post:new',
  POST_UPDATED: 'channel:post:updated',
  POST_DELETED: 'channel:post:deleted',
  POST_REACTION: 'channel:post:reaction',
  SUBSCRIBER_JOINED: 'channel:subscriber:joined',
  SUBSCRIBER_LEFT: 'channel:subscriber:left',
  SUBSCRIBER_ROLE: 'channel:subscriber:role',
  DELETED: 'channel:deleted',
} as const;

interface ChannelEventBus {
  emitPostNew(channelId: string, post: SafePost): void;
  emitPostUpdated(channelId: string, post: SafePost): void;
  emitPostDeleted(channelId: string, postId: string): void;
  emitPostReaction(channelId: string, postId: string, reactionCounts: ReactionCounts): void;
  emitSubscriberJoined(channelId: string, userId: string, role: string): void;
  emitSubscriberLeft(channelId: string, userId: string): void;
  emitSubscriberRole(channelId: string, userId: string, role: string): void;
  emitDeleted(channelId: string, subscriberIds: string[]): void;
  attach(io: Server): void;
}

/**
 * Thin event bus that forwards channel post/reaction/subscriber events to the
 * realtime layer. Holds no business logic — it only translates service events
 * into Socket.IO broadcasts (ENGINEERING_RULES §5).
 *
 * Post/reaction events go to the whole `channel:{id}` room via `io.to(room)`
 * (NOT `socket.to(room)`): the author's composing device ignores its own echo
 * client-side, but `socket.to` would wrongly starve the author's other devices.
 *
 * Subscriber events are broadcast to the `channel:{id}` room **and** the
 * affected user's own `user:{id}` room (mirrors `communityEventBus` / the
 * member-list lesson): everyone in the room learns the member list changed, and
 * the affected user's other devices stay consistent even when they are not
 * currently subscribed to the channel room.
 */
class ChannelEventBusImpl implements ChannelEventBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
    logger.info('Channel event bus attached to realtime server');
  }

  private emitToChannel(event: string, channelId: string, payload: Record<string, unknown>): void {
    if (!this.io) {
      return;
    }
    this.io.to(`channel:${channelId}`).emit(event, { ...payload, at: new Date().toISOString() });
  }

  private emitToChannelAndUser(
    event: string,
    channelId: string,
    userId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.io) {
      return;
    }
    const body = { channelId, userId, ...payload, at: new Date().toISOString() };
    this.io.to(`channel:${channelId}`).emit(event, body);
    this.io.to(`user:${userId}`).emit(event, body);
  }

  emitPostNew(channelId: string, post: SafePost): void {
    this.emitToChannel(CHANNEL_EVENTS.POST_NEW, channelId, { channelId, post });
  }

  emitPostUpdated(channelId: string, post: SafePost): void {
    this.emitToChannel(CHANNEL_EVENTS.POST_UPDATED, channelId, { channelId, post });
  }

  emitPostDeleted(channelId: string, postId: string): void {
    this.emitToChannel(CHANNEL_EVENTS.POST_DELETED, channelId, { channelId, postId });
  }

  emitPostReaction(channelId: string, postId: string, reactionCounts: ReactionCounts): void {
    this.emitToChannel(CHANNEL_EVENTS.POST_REACTION, channelId, {
      channelId,
      postId,
      reactionCounts,
    });
  }

  emitSubscriberJoined(channelId: string, userId: string, role: string): void {
    this.emitToChannelAndUser(CHANNEL_EVENTS.SUBSCRIBER_JOINED, channelId, userId, { role });
  }

  emitSubscriberLeft(channelId: string, userId: string): void {
    this.emitToChannelAndUser(CHANNEL_EVENTS.SUBSCRIBER_LEFT, channelId, userId, {});
    // Server-authoritative eviction (group-chat revocation lesson): the departed
    // subscriber's sockets must leave `channel:{id}` so they can no longer
    // receive room broadcasts. Emitted after the broadcast above so the member
    // still receives the `channel:subscriber:left` notification on their own
    // `user:{id}` room.
    this.evictFromChannel(channelId, userId);
  }

  emitSubscriberRole(channelId: string, userId: string, role: string): void {
    this.emitToChannelAndUser(CHANNEL_EVENTS.SUBSCRIBER_ROLE, channelId, userId, { role });
  }

  emitDeleted(channelId: string, subscriberIds: string[]): void {
    if (!this.io) {
      return;
    }
    const payload = { channelId, at: new Date().toISOString() };
    this.io.to(`channel:${channelId}`).emit(CHANNEL_EVENTS.DELETED, payload);
    for (const userId of subscriberIds) {
      this.io.to(`user:${userId}`).emit(CHANNEL_EVENTS.DELETED, payload);
      this.evictFromChannel(channelId, userId);
    }
  }

  /**
   * Removes every one of a user's sockets from `channel:{channelId}`. Room
   * presence is the server-authoritative proof of subscription, so eviction is
   * what keeps that invariant true after a user unsubscribes, is removed, or
   * the channel is soft-deleted.
   */
  private evictFromChannel(channelId: string, userId: string): void {
    if (!this.io) {
      return;
    }
    this.io.in(`user:${userId}`).socketsLeave(`channel:${channelId}`);
  }
}

export const channelEventBus: ChannelEventBus = new ChannelEventBusImpl();
