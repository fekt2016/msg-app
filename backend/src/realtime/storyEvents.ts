import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';
import type { SafeStory } from '../modules/stories/story.service.js';

export const STORY_EVENTS = {
  STORY_NEW: 'story:new',
  STORY_DELETED: 'story:deleted',
  STORY_VIEWED: 'story:viewed',
} as const;

interface StoryEventBus {
  emitStoryNew(story: SafeStory): void;
  emitStoryDeleted(storyId: string, authorId: string): void;
  emitStoryViewed(storyId: string, authorId: string, viewerId: string): void;
  attach(io: Server): void;
}

/**
 * Thin event bus that forwards story events to the realtime layer. Holds no
 * business logic — it only translates service events into Socket.IO broadcasts
 * (ENGINEERING_RULES §5).
 *
 * The story feed is global (all verified users), so `story:new` and
 * `story:deleted` broadcast to every connected socket via `io.emit` — mirroring
 * the presence-broadcast pattern (global, not room-scoped). `story:viewed` is
 * targeted to the author's own `user:{id}` room so their open viewer updates
 * the count live without spamming everyone.
 */
class StoryEventBusImpl implements StoryEventBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
    logger.info('Story event bus attached to realtime server');
  }

  emitStoryNew(story: SafeStory): void {
    if (!this.io) {
      return;
    }
    this.io.emit(STORY_EVENTS.STORY_NEW, { story, at: new Date().toISOString() });
  }

  emitStoryDeleted(storyId: string, authorId: string): void {
    if (!this.io) {
      return;
    }
    this.io.emit(STORY_EVENTS.STORY_DELETED, {
      storyId,
      authorId,
      at: new Date().toISOString(),
    });
  }

  emitStoryViewed(storyId: string, authorId: string, viewerId: string): void {
    if (!this.io) {
      return;
    }
    this.io.to(`user:${authorId}`).emit(STORY_EVENTS.STORY_VIEWED, {
      storyId,
      viewerId,
      at: new Date().toISOString(),
    });
  }
}

export const storyEventBus: StoryEventBus = new StoryEventBusImpl();
