import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { logger } from '../config/logger.js';
import { socketAuthMiddleware } from './socketAuth.js';
import { buildRealtimeAdapter, type RealtimeAdapter } from './adapter.js';
import { presenceStore, type PresenceStore } from './presence.js';
import { communityEventBus } from './communityEvents.js';
import { groupEventBus } from './groupEvents.js';
import { channelEventBus } from './channelEvents.js';
import { storyEventBus } from './storyEvents.js';
import { groupRepository } from '../modules/groups/group.repository.js';
import { communityRepository } from '../modules/communities/community.repository.js';
import { channelRepository } from '../modules/channels/channel.repository.js';
import { messageService } from '../modules/messages/message.service.js';
import { groupMessageService } from '../modules/groupMessages/groupMessage.service.js';
import {
  chatMessageNewSchema,
  chatMessageDeliveredSchema,
  chatMessageReadSchema,
  groupSubscribeSchema,
  communitySubscribeSchema,
  channelSubscribeSchema,
  chatGroupMessageNewSchema,
  chatGroupAckSchema,
  type ChatMessageNewPayload,
  type ChatMessageDeliveredPayload,
  type ChatMessageReadPayload,
} from './validation.js';

export const REALTIME_EVENTS = {
  CONNECT_ERROR: 'connect_error',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_LIST: 'presence:list',
  CHAT_MESSAGE_NEW: 'chat:message:new',
  CHAT_MESSAGE_DELIVERED: 'chat:message:delivered',
  CHAT_MESSAGE_READ: 'chat:message:read',
  GROUP_SUBSCRIBE: 'group:subscribe',
  GROUP_UNSUBSCRIBE: 'group:unsubscribe',
  GROUP_SUBSCRIBED: 'group:subscribed',
  CHAT_GROUP_MESSAGE_NEW: 'chat:group:message:new',
  CHAT_GROUP_MESSAGE_DELIVERED: 'chat:group:message:delivered',
  CHAT_GROUP_MESSAGE_READ: 'chat:group:message:read',
  COMMUNITY_SUBSCRIBE: 'community:subscribe',
  COMMUNITY_UNSUBSCRIBE: 'community:unsubscribe',
  COMMUNITY_SUBSCRIBED: 'community:subscribed',
  CHANNEL_SUBSCRIBE: 'channel:subscribe',
  CHANNEL_UNSUBSCRIBE: 'channel:unsubscribe',
  CHANNEL_SUBSCRIBED: 'channel:subscribed',
} as const;

export interface RealtimeServer {
  io: Server;
  close(): Promise<void>;
}

/**
 * Bootstraps the Socket.IO server on the shared HTTP server.
 *
 * - Authenticates every connection with the access token (JWT).
 * - Uses the Redis adapter for horizontal scaling — falls back to Socket.IO's
 *   in-memory adapter when Redis is unreachable (see `adapter.ts`); tests
 *   inject a no-op adapter instead so they never depend on a real Redis.
 * - Emits presence updates as connections join/leave.
 *
 * Handlers contain no business logic — they only translate socket events into
 * store calls and broadcasts (ENGINEERING_RULES §5).
 */
export async function createRealtimeServer(
  httpServer: HttpServer,
  opts: { adapter?: RealtimeAdapter; presence?: PresenceStore } = {},
): Promise<RealtimeServer> {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use(socketAuthMiddleware);

  const adapter = opts.adapter ?? buildRealtimeAdapter();
  await adapter.setup(io);

  const store = opts.presence ?? presenceStore;

  communityEventBus.attach(io);
  groupEventBus.attach(io);
  channelEventBus.attach(io);
  storyEventBus.attach(io);

  io.on('connection', (socket: Socket) => {
    const { userId } = socket.user!;
    // socketAuthMiddleware already joins `user:${userId}` during the
    // handshake — no need to join again here.

    void (async () => {
      const connectionCount = await store.addConnection(userId);
      const online = connectionCount === 1;

      logger.info(
        { userId, deviceId: socket.user!.deviceId, connections: connectionCount },
        'Socket connected',
      );

      if (online) {
        broadcastPresence(io, userId, true, connectionCount);
      }

      socket.emit(REALTIME_EVENTS.PRESENCE_LIST, {
        onlineUserIds: await store.getOnlineUserIds(),
      });
    })();

    socket.on('disconnect', () => {
      void (async () => {
        const connectionCount = await store.removeConnection(userId);
        if (connectionCount === 0) {
          broadcastPresence(io, userId, false, 0);
        }
        logger.info(
          { userId, deviceId: socket.user!.deviceId, connections: connectionCount },
          'Socket disconnected',
        );
      })();
    });

    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_NEW, (raw: unknown) => {
      const parsed = chatMessageNewSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({ userId, errors: parsed.error.flatten() }, 'Invalid chat:message:new payload');
        return;
      }
      const payload: ChatMessageNewPayload = parsed.data;
      io.to(`user:${payload.recipientId}`).emit(REALTIME_EVENTS.CHAT_MESSAGE_NEW, {
        senderId: userId,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        timestamp: payload.timestamp,
      });

      // Persist the ciphertext so both participants can replay history on any
      // device. Best-effort: a storage failure must not drop the live message,
      // so the broadcast above happens first and the failure is only logged.
      void messageService
        .storeMessage({
          senderId: userId,
          recipientId: payload.recipientId,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          timestamp: payload.timestamp,
        })
        .catch((err: unknown) => {
          logger.warn({ err, senderId: userId }, 'Failed to persist chat message');
        });
    });

    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_DELIVERED, (raw: unknown) => {
      const parsed = chatMessageDeliveredSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { userId, errors: parsed.error.flatten() },
          'Invalid chat:message:delivered payload',
        );
        return;
      }
      const payload: ChatMessageDeliveredPayload = parsed.data;
      io.to(`user:${payload.senderId}`).emit(REALTIME_EVENTS.CHAT_MESSAGE_DELIVERED, {
        recipientId: userId,
        timestamp: payload.timestamp,
      });
    });

    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_READ, (raw: unknown) => {
      const parsed = chatMessageReadSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { userId, errors: parsed.error.flatten() },
          'Invalid chat:message:read payload',
        );
        return;
      }
      const payload: ChatMessageReadPayload = parsed.data;
      io.to(`user:${payload.senderId}`).emit(REALTIME_EVENTS.CHAT_MESSAGE_READ, {
        recipientId: userId,
        timestamp: payload.timestamp,
      });
    });

    // Group chat (sender-key E2EE). Room membership is server-authoritative:
    // a socket may only join `group:{groupId}` after `isMember` confirms it, so
    // being in the room is itself proof of membership — the message/ack relays
    // below therefore gate on `socket.rooms` rather than re-querying per event.
    // The invariant is kept honest on the way out by `groupEventBus`, which
    // force-evicts a member's sockets from the room when they leave, are removed,
    // or the group is deleted (see realtime/groupEvents.ts).
    socket.on(REALTIME_EVENTS.GROUP_SUBSCRIBE, (raw: unknown) => {
      const parsed = groupSubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({ userId, errors: parsed.error.flatten() }, 'Invalid group:subscribe payload');
        return;
      }
      const { groupId } = parsed.data;
      void (async () => {
        const isMember = await groupRepository.isMember(groupId, userId);
        if (!isMember) {
          logger.warn({ userId, groupId }, 'Rejected group:subscribe from non-member');
          return;
        }
        await socket.join(`group:${groupId}`);
        socket.emit(REALTIME_EVENTS.GROUP_SUBSCRIBED, { groupId });
      })();
    });

    socket.on(REALTIME_EVENTS.GROUP_UNSUBSCRIBE, (raw: unknown) => {
      const parsed = groupSubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      void socket.leave(`group:${parsed.data.groupId}`);
    });

    // Community member-list live updates. A socket may join `community:{id}`
    // only if it could read the community — PUBLIC, or a member of a PRIVATE
    // one — mirroring the `getByIdOrSlug` access rule so a non-member can never
    // observe a private community's membership churn. `communityEventBus`
    // broadcasts member join/leave/role changes to this room (and evicts a
    // departed member on the way out).
    socket.on(REALTIME_EVENTS.COMMUNITY_SUBSCRIBE, (raw: unknown) => {
      const parsed = communitySubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { userId, errors: parsed.error.flatten() },
          'Invalid community:subscribe payload',
        );
        return;
      }
      const { communityId } = parsed.data;
      void (async () => {
        const community = await communityRepository.findById(communityId);
        if (!community || community.deletedAt) {
          return;
        }
        if (community.visibility === 'PRIVATE') {
          const member = await communityRepository.findMember(communityId, userId);
          if (!member) {
            logger.warn(
              { userId, communityId },
              'Rejected community:subscribe from non-member of a private community',
            );
            return;
          }
        }
        await socket.join(`community:${communityId}`);
        socket.emit(REALTIME_EVENTS.COMMUNITY_SUBSCRIBED, { communityId });
      })();
    });

    socket.on(REALTIME_EVENTS.COMMUNITY_UNSUBSCRIBE, (raw: unknown) => {
      const parsed = communitySubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      void socket.leave(`community:${parsed.data.communityId}`);
    });

    // Channel post/reaction live updates. The room-join gate mirrors the
    // REST access rule (`channelService.getChannel`, S1): PUBLIC channels allow
    // any authenticated user; PRIVATE channels require an approved subscription
    // row, so a non-subscriber can never observe a private channel's content or
    // churn. `channelEventBus` broadcasts post/reaction events to this room and
    // subscriber joined/left/role events to the room plus the user's own room
    // (so a leaving member is told before being evicted), and force-evicts
    // sockets when a user unsubscribes, is removed, or the channel is deleted.
    socket.on(REALTIME_EVENTS.CHANNEL_SUBSCRIBE, (raw: unknown) => {
      const parsed = channelSubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { userId, errors: parsed.error.flatten() },
          'Invalid channel:subscribe payload',
        );
        return;
      }
      const { channelId } = parsed.data;
      void (async () => {
        const channel = await channelRepository.findById(channelId);
        if (!channel || channel.deletedAt) {
          return;
        }
        if (channel.visibility === 'PRIVATE') {
          const subscriber = await channelRepository.findSubscriber(channelId, userId);
          if (!subscriber) {
            logger.warn(
              { userId, channelId },
              'Rejected channel:subscribe from non-subscriber of a private channel',
            );
            return;
          }
        }
        await socket.join(`channel:${channelId}`);
        socket.emit(REALTIME_EVENTS.CHANNEL_SUBSCRIBED, { channelId });
      })().catch((err: unknown) => {
        logger.warn({ err, userId, channelId }, 'Failed to handle channel:subscribe');
      });
    });

    socket.on(REALTIME_EVENTS.CHANNEL_UNSUBSCRIBE, (raw: unknown) => {
      const parsed = channelSubscribeSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      void socket.leave(`channel:${parsed.data.channelId}`);
    });

    socket.on(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_NEW, (raw: unknown) => {
      const parsed = chatGroupMessageNewSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { userId, errors: parsed.error.flatten() },
          'Invalid chat:group:message:new payload',
        );
        return;
      }
      const { groupId, keyId, ciphertext, iv, timestamp } = parsed.data;
      if (!socket.rooms.has(`group:${groupId}`)) {
        logger.warn(
          { userId, groupId },
          'Rejected chat:group:message:new from non-subscribed socket',
        );
        return;
      }
      socket.to(`group:${groupId}`).emit(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_NEW, {
        groupId,
        senderId: userId,
        keyId,
        ciphertext,
        iv,
        timestamp,
      });

      // Persist the ciphertext so members can replay history on any device.
      // Best-effort (mirrors the 1:1 relay): a storage failure must not drop
      // the live broadcast, so the relay happens first and the failure is only
      // logged. `storeMessage` re-checks membership as a defense-in-depth gate.
      void groupMessageService
        .storeMessage({ groupId, senderId: userId, keyId, ciphertext, iv, timestamp })
        .catch((err: unknown) => {
          logger.warn({ err, userId, groupId }, 'Failed to persist group message');
        });
    });

    const relayGroupAck = (event: string) => (raw: unknown) => {
      const parsed = chatGroupAckSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({ userId, event }, 'Invalid group ack payload');
        return;
      }
      const { groupId, timestamp } = parsed.data;
      if (!socket.rooms.has(`group:${groupId}`)) {
        return;
      }
      socket.to(`group:${groupId}`).emit(event, { groupId, userId, timestamp });
    };

    socket.on(
      REALTIME_EVENTS.CHAT_GROUP_MESSAGE_DELIVERED,
      relayGroupAck(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_DELIVERED),
    );
    socket.on(
      REALTIME_EVENTS.CHAT_GROUP_MESSAGE_READ,
      relayGroupAck(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_READ),
    );
  });

  return {
    io,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      // Release the Redis connections (if any) held by the adapter and the
      // presence store so a graceful shutdown doesn't leak sockets.
      await adapter.disconnect?.();
      await store.disconnect?.();
    },
  };
}

function broadcastPresence(
  io: Server,
  userId: string,
  online: boolean,
  connectionCount: number,
): void {
  io.emit(REALTIME_EVENTS.PRESENCE_UPDATE, {
    userId,
    online,
    connectionCount,
    at: new Date().toISOString(),
  });
}
