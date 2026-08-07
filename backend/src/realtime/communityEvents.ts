import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';

export const COMMUNITY_EVENTS = {
  MEMBER_JOINED: 'community:member:joined',
  MEMBER_LEFT: 'community:member:left',
  ROLE_UPDATED: 'community:member:role',
} as const;

interface CommunityEventBus {
  emitMemberJoined(communityId: string, userId: string, role: string): void;
  emitMemberLeft(communityId: string, userId: string): void;
  emitRoleUpdated(communityId: string, userId: string, role: string): void;
  attach(io: Server): void;
}

/**
 * Thin event bus that forwards community membership changes to the realtime
 * layer. Holds no business logic — it only translates service events into
 * Socket.IO broadcasts (ENGINEERING_RULES §5).
 *
 * Each change is broadcast to the `community:{communityId}` room so every viewer
 * currently on the community's detail screen sees the member list update live
 * (not just the acting user), and to the affected user's own `user:{userId}`
 * room so their other devices stay consistent even when not subscribed to the
 * community room. Room membership is server-authoritative — a socket only joins
 * `community:{communityId}` after the subscribe gate confirms read access.
 */
class CommunityEventBusImpl implements CommunityEventBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
    logger.info('Community event bus attached to realtime server');
  }

  private emit(
    event: string,
    communityId: string,
    userId: string,
    extra: Record<string, unknown>,
  ): void {
    if (!this.io) {
      return;
    }
    const payload = {
      communityId,
      userId,
      ...extra,
      at: new Date().toISOString(),
    };
    this.io.to(`community:${communityId}`).emit(event, payload);
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  emitMemberJoined(communityId: string, userId: string, role: string): void {
    this.emit(COMMUNITY_EVENTS.MEMBER_JOINED, communityId, userId, { role });
  }

  emitMemberLeft(communityId: string, userId: string): void {
    this.emit(COMMUNITY_EVENTS.MEMBER_LEFT, communityId, userId, {});
    // A departed member is no longer entitled to a PRIVATE community's updates —
    // evict their sockets from the room after the broadcast above (so they still
    // receive their own `member:left` on their `user:{id}` room).
    this.evictFromCommunity(communityId, userId);
  }

  emitRoleUpdated(communityId: string, userId: string, role: string): void {
    this.emit(COMMUNITY_EVENTS.ROLE_UPDATED, communityId, userId, { role });
  }

  private evictFromCommunity(communityId: string, userId: string): void {
    if (!this.io) {
      return;
    }
    this.io.in(`user:${userId}`).socketsLeave(`community:${communityId}`);
  }
}

export const communityEventBus: CommunityEventBus = new CommunityEventBusImpl();
