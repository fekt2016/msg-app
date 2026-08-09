import { AppError } from '../../errors/AppError.js';
import { logger } from '../../config/logger.js';
import { storyRepository } from './story.repository.js';
import { storyLikeRepository } from './storyLike.repository.js';
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
  /** Author-only — absent for any other viewer (privacy). */
  viewCount?: number;
  hasLiked: boolean;
  likeCount: number;
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

function toSafeStory(
  story: StoryDoc,
  viewerId: string,
  hasViewed: boolean,
  hasLiked: boolean,
): SafeStory {
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
    hasLiked,
    likeCount: story.likeCount ?? 0,
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

async function buildLikeLookup(storyIds: string[], userId: string): Promise<Set<string>> {
  if (storyIds.length === 0) {
    return new Set();
  }
  const liked = await storyLikeRepository.listLikedStoryIds(storyIds, userId);
  return new Set(liked);
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

    const safe = toSafeStory(story, userId, false, false);
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

    // Build a single view + like lookup across all story ids for the viewer.
    const storyIds = rows.flatMap((r) => r.stories.map((s) => s._id.toString()));
    const [viewed, liked] = await Promise.all([
      buildViewLookup(storyIds, viewerId),
      buildLikeLookup(storyIds, viewerId),
    ]);

    const items: StoryFeedItem[] = rows.map((row) => {
      const author = authorMap.get(row.authorId) ?? { displayName: 'Unknown', avatarUrl: null };
      return {
        author: {
          id: row.authorId,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
        },
        stories: row.stories.map((s) =>
          toSafeStory(s, viewerId, viewed.has(s._id.toString()), liked.has(s._id.toString())),
        ),
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
    const [hasViewed, hasLiked] = await Promise.all([
      storyRepository.hasViewed(storyId, viewerId),
      storyLikeRepository.hasLiked(storyId, viewerId),
    ]);
    return toSafeStory(story, viewerId, hasViewed, hasLiked);
  },

  async delete(userId: string, storyId: string): Promise<void> {
    const story = await storyRepository.findById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
    }
    if (story.authorId.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own stories');
    }
    // Author-initiated delete is a hard cascade: story + its views + its likes.
    // Ephemeral content — not audit material (CLAUDE.md §9 exception). Cloudinary
    // cleanup is best-effort (a failed destroy is logged, not fatal).
    await Promise.all([
      storyRepository.deleteViewsByStoryId(storyId),
      storyLikeRepository.deleteLikesByStoryId(storyId),
    ]);
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

  /**
   * Likes a story. Idempotent: liking an already-liked story is a no-op that
   * returns the current state. Only a genuinely new like bumps the count.
   * Emits `story:liked` to the author's room so their open story updates live.
   */
  async like(userId: string, storyId: string): Promise<{ liked: boolean; likeCount: number }> {
    const story = await storyRepository.findActiveById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found or has expired');
    }
    try {
      await storyLikeRepository.addLike({
        storyId,
        userId,
        expiresAt: story.expiresAt,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { liked: true, likeCount: story.likeCount ?? 0 };
      }
      throw err;
    }
    const updated = await storyRepository.adjustLikeCount(storyId, 1);
    const likeCount = updated?.likeCount ?? (story.likeCount ?? 0) + 1;
    storyEventBus.emitStoryLiked(storyId, story.authorId.toString(), userId, likeCount);
    return { liked: true, likeCount };
  },

  /**
   * Unlikes a story. Idempotent: unliking a story the user never liked is a
   * no-op. Only a genuine removal decrements the (never-negative) count.
   */
  async unlike(userId: string, storyId: string): Promise<{ liked: boolean; likeCount: number }> {
    const story = await storyRepository.findActiveById(storyId);
    if (!story) {
      throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found or has expired');
    }
    const removed = await storyLikeRepository.removeLike(storyId, userId);
    if (removed === 0) {
      return { liked: false, likeCount: story.likeCount ?? 0 };
    }
    const updated = await storyRepository.adjustLikeCount(storyId, -1);
    const likeCount = updated?.likeCount ?? Math.max((story.likeCount ?? 0) - 1, 0);
    storyEventBus.emitStoryUnliked(storyId, story.authorId.toString(), userId, likeCount);
    return { liked: false, likeCount };
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
