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
    this.io.to(`user:${userId}`).emit(event, {
      communityId,
      userId,
      ...extra,
      at: new Date().toISOString(),
    });
  }

  emitMemberJoined(communityId: string, userId: string, role: string): void {
    this.emit(COMMUNITY_EVENTS.MEMBER_JOINED, communityId, userId, { role });
  }

  emitMemberLeft(communityId: string, userId: string): void {
    this.emit(COMMUNITY_EVENTS.MEMBER_LEFT, communityId, userId, {});
  }

  emitRoleUpdated(communityId: string, userId: string, role: string): void {
    this.emit(COMMUNITY_EVENTS.ROLE_UPDATED, communityId, userId, { role });
  }
}

export const communityEventBus: CommunityEventBus = new CommunityEventBusImpl();
