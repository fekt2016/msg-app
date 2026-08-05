import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';

export const GROUP_EVENTS = {
  MEMBER_JOINED: 'group:member:joined',
  MEMBER_LEFT: 'group:member:left',
  DELETED: 'group:deleted',
} as const;

interface GroupEventBus {
  emitMemberJoined(groupId: string, userId: string): void;
  emitMemberLeft(groupId: string, userId: string): void;
  emitDeleted(groupId: string, memberIds: string[]): void;
  attach(io: Server): void;
}

/**
 * Thin event bus that forwards group membership changes to the realtime layer.
 * Holds no business logic — it only translates service events into Socket.IO
 * broadcasts (ENGINEERING_RULES §5).
 *
 * Membership changes are broadcast to the `group:{groupId}` room so existing
 * members learn they must (re)distribute or rotate their sender key — the
 * server relays ciphertext only and never performs the rotation itself — and to
 * the affected user's own `user:{userId}` room so their other devices stay
 * consistent even when they are not currently subscribed to the group room.
 */
class GroupEventBusImpl implements GroupEventBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
    logger.info('Group event bus attached to realtime server');
  }

  private emit(event: string, groupId: string, userId: string): void {
    if (!this.io) {
      return;
    }
    const payload = { groupId, userId, at: new Date().toISOString() };
    this.io.to(`group:${groupId}`).emit(event, payload);
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  emitMemberJoined(groupId: string, userId: string): void {
    this.emit(GROUP_EVENTS.MEMBER_JOINED, groupId, userId);
  }

  emitMemberLeft(groupId: string, userId: string): void {
    this.emit(GROUP_EVENTS.MEMBER_LEFT, groupId, userId);
  }

  emitDeleted(groupId: string, memberIds: string[]): void {
    if (!this.io) {
      return;
    }
    const payload = { groupId, at: new Date().toISOString() };
    this.io.to(`group:${groupId}`).emit(GROUP_EVENTS.DELETED, payload);
    for (const userId of memberIds) {
      this.io.to(`user:${userId}`).emit(GROUP_EVENTS.DELETED, payload);
    }
  }
}

export const groupEventBus: GroupEventBus = new GroupEventBusImpl();
