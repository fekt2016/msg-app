import { AppError } from '../../errors/AppError.js';
import { logger } from '../../config/logger.js';
import { storyRepository } from './story.repository.js';
import { mediaStorage, sniffStoryMedia, type UploadableFile } from '../users/mediaStorage.js';
import { userRepository } from '../auth/user.repository.js';
import { storyEventBus } from '../../realtime/storyEvents.js';
import { env } from '../../config/env.js';
import type { StoryDoc, StoryMediaType } from './story.model.js';

const HOUR_MS = 60 * 60 * 1000;

export interface SafeStory {
  id: string;
  authorId: string;
  media: {
    publicId: string;
    url: string;
    width?: number;
    height?: number;
    resourceType: StoryMediaType;
    durationMs?: number;
  };
  caption: string;
  expiresAt: Date;
  createdAt: Date;
  hasViewed: boolean;
  viewCount?: number;
}

export interface StoryFeedItem {
  author: { id: string; displayName: string; avatarUrl: string | null };
  stories: SafeStory[];
  latestAt: Date;
}

export interface AuthorRef {
  displayName: string;
  avatarUrl: string | null;
}

function toSafeStory(story: StoryDoc, viewerId: string, hasViewed: boolean): SafeStory {
  const media = story.media ?? {
    publicId: '',
    url: '',
    width: undefined,
    height: undefined,
    resourceType: 'IMAGE' as const,
    durationMs: undefined,
  };
  const safe: SafeStory = {
    id: story._id.toString(),
    authorId: story.authorId.toString(),
    media: {
      publicId: media.publicId,
      url: media.url,
      width: media.width ?? undefined,
      height: media.height ?? undefined,
      resourceType: media.resourceType,
      durationMs: media.durationMs ?? undefined,
    },
    caption: story.caption ?? '',
    expiresAt: story.expiresAt,
    createdAt: story.createdAt,
    hasViewed,
  };
  // The author sees the view count; everyone else never does (privacy).
  if (story.authorId.toString() === viewerId) {
    safe.viewCount = story.viewCount ?? 0;
  }
  return safe;
}

/**
 * Builds the author-enrichment map for a set of story authors via one batched
 * `findByIds` (the 18e91d0 N+1 lesson — never a per-author lookup).
 */
async function buildAuthorMap(authorIds: string[]): Promise<Map<string, AuthorRef>> {
  const unique = [...new Set(authorIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const users = await userRepository.findByIds(unique);
  const map = new Map<string, AuthorRef>();
  for (const user of users) {
    map.set(user._id.toString(), {
      displayName: user.displayName,
      avatarUrl: user.avatar?.url ?? null,
    });
  }
  return map;
}

async function buildViewLookup(storyIds: string[], viewerId: string): Promise<Set<string>> {
  if (storyIds.length === 0) {
    return new Set();
  }
  const viewed = await storyRepository.listViewedStoryIds(storyIds, viewerId);
  return new Set(viewed);
}

export const storyService = {
  async create(userId: string, file: UploadableFile, caption?: string): Promise<SafeStory> {
    // Authoritative check: sniff the real file bytes rather than trusting the
    // client-supplied Content-Type (CLAUDE.md §11) before anything reaches Cloudinary.
    const sniffed = sniffStoryMedia(file.buffer);
    if (!sniffed) {
      throw new AppError(
        422,
        'INVALID_FILE_TYPE',
        'Only JPEG, PNG, WebP images or MP4/MOV/WebM videos are allowed',
      );
    }

    const asset = await mediaStorage.uploadStoryMedia(file);

    const story = await storyRepository.create({
      authorId: userId,
      media: {
        publicId: asset.publicId,
        url: asset.url,
        width: asset.width,
        height: asset.height,
        resourceType: asset.resourceType,
        durationMs: asset.durationMs,
      },
      caption: caption ?? '',
      expiresAt: new Date(Date.now() + env.STORY_TTL_HOURS * HOUR_MS),
    });

    const safe = toSafeStory(story, userId, false);
    // The global broadcast must not carry the author-only viewCount (privacy):
    // JSON serialization drops the `undefined` key over the socket.
    storyEventBus.emitStoryNew({ ...safe, viewCount: undefined });
    return safe;
  },

  async feed(
    viewerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: StoryFeedItem[]; total: number; page: number; pageSize: number }> {
    const rows = await storyRepository.listFeed(page, pageSize);
    const total = await storyRepository.countActiveAuthors();

    if (rows.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const authorIds = rows.map((r) => r.authorId);
    const authorMap = await buildAuthorMap(authorIds);

    // Build a single view lookup across all story ids for the viewer.
    const storyIds = rows.flatMap((r) => r.stories.map((s) => s._id.toString()));
    const viewed = await buildViewLookup(storyIds, viewerId);

    const items: StoryFeedItem[] = rows.map((row) => {
      const author = authorMap.get(row.authorId) ?? { displayName: 'Unknown', avatarUrl: null };
      return {
        author: {
          id: row.authorId,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
        },
        stories: row.stories.map((s) => toSafeStory(s, viewerId, viewed.has(s._id.toString()))),
        latestAt: row.latestAt,
      };
    });

    return { items, total, page, pageSize };
  },

  async get(storyId: string, viewerId: string): Promise<SafeStory> {
    const story = await storyRepository.findActiveById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found or has expired');
    }
    const hasViewed = await storyRepository.hasViewed(storyId, viewerId);
    return toSafeStory(story, viewerId, hasViewed);
  },

  async delete(userId: string, storyId: string): Promise<void> {
    const story = await storyRepository.findById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
    }
    if (story.authorId.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own stories');
    }
    // Author-initiated delete is a hard cascade: story + its views. Ephemeral
    // content — not audit material (CLAUDE.md §9 exception). Cloudinary cleanup
    // is best-effort (a failed destroy is logged, not fatal).
    await storyRepository.deleteViewsByStoryId(storyId);
    await storyRepository.deleteById(storyId);
    const publicId = story.media?.publicId;
    if (publicId) {
      try {
        await mediaStorage.deleteByPublicId(publicId);
      } catch (err) {
        logger.warn({ storyId, err }, 'Failed to delete story media from Cloudinary');
      }
    }
    storyEventBus.emitStoryDeleted(storyId, story.authorId.toString());
  },

  async markViewed(userId: string, storyId: string): Promise<{ viewed: boolean }> {
    const story = await storyRepository.findActiveById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found or has expired');
    }
    // The author viewing their own story is never counted (they'd inflate their
    // own view count and appear in their own viewer list).
    if (story.authorId.toString() === userId) {
      return { viewed: false };
    }
    // Idempotent: the unique {storyId, viewerId} index is the boundary. A
    // duplicate-key insert is the no-op path (the viewer already saw it), and
    // only a genuinely new view $incs the author-visible count.
    try {
      await storyRepository.addView({
        storyId,
        viewerId: userId,
        expiresAt: story.expiresAt,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { viewed: false };
      }
      throw err;
    }
    await storyRepository.incrementViewCount(storyId);
    storyEventBus.emitStoryViewed(storyId, story.authorId.toString(), userId);
    return { viewed: true };
  },

  async listViewers(
    userId: string,
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: { userId: string; displayName: string; avatarUrl: string | null; viewedAt: Date }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const story = await storyRepository.findActiveById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found or has expired');
    }
    if (story.authorId.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the author can view the viewer list');
    }
    const viewers = await storyRepository.listViewers(storyId, page, pageSize);
    const total = await storyRepository.countViews(storyId);
    const authorMap = await buildAuthorMap(viewers.map((v) => v.viewerId));
    const items = viewers.map((v) => ({
      userId: v.viewerId,
      displayName: authorMap.get(v.viewerId)?.displayName ?? 'Unknown',
      avatarUrl: authorMap.get(v.viewerId)?.avatarUrl ?? null,
      viewedAt: v.viewedAt,
    }));
    return { items, total, page, pageSize };
  },
};

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number | string }).code === 11000
  );
}
