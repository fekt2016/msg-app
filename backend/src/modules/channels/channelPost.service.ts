import { AppError } from '../../errors/AppError.js';
import { channelService } from './channel.service.js';
import { channelRepository } from './channel.repository.js';
import { channelPostRepository } from './channelPost.repository.js';
import { userRepository } from '../auth/user.repository.js';
import {
  isSupportedImage,
  mediaStorage,
  sniffImageMimeType,
  type UploadableFile,
} from '../users/mediaStorage.js';
import type { ChannelPostDoc } from './channelPost.model.js';

export interface SafePost {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  images: { publicId: string; url: string; alt: string; order: number }[];
  reactionCounts: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  author: { displayName: string; avatarUrl: string | null };
}

function toSafePost(
  post: ChannelPostDoc,
  author?: { displayName?: string; avatarUrl?: string | null },
): SafePost {
  return {
    id: post._id.toString(),
    channelId: post.channelId.toString(),
    authorId: post.authorId.toString(),
    body: post.body,
    images: post.images ?? [],
    reactionCounts: post.reactionCounts ? Object.fromEntries(post.reactionCounts) : {},
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: {
      displayName: author?.displayName ?? 'Unknown',
      avatarUrl: author?.avatarUrl ?? null,
    },
  };
}

async function enrichAuthors(posts: ChannelPostDoc[]): Promise<SafePost[]> {
  const authorIds = [...new Set(posts.map((p) => p.authorId.toString()))];
  if (authorIds.length === 0) {
    return [];
  }
  const users = await userRepository.findByIds(authorIds);
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return posts.map((post) => {
    const user = byId.get(post.authorId.toString());
    return toSafePost(post, {
      displayName: user?.displayName,
      avatarUrl: user?.avatar?.url ?? null,
    });
  });
}

export const channelPostService = {
  async createPost(userId: string, identifier: string, body: string): Promise<SafePost> {
    const channel = await channelService.getForAdmin(identifier, userId, 'UPDATE');
    const post = await channelPostRepository.createPost(channel.id, userId, body);
    await channelRepository.incrementPostCount(channel.id, 1);
    const [safePost] = await enrichAuthors([post]);
    return safePost!;
  },

  async listPosts(
    identifier: string,
    viewerId: string | undefined,
    options: { limit: number; cursor?: string | null },
  ) {
    const channel = await channelService.getChannel(identifier, viewerId);
    const result = await channelPostRepository.listPosts(channel.id, options);
    return { items: await enrichAuthors(result.items), nextCursor: result.nextCursor };
  },

  async getPost(
    identifier: string,
    viewerId: string | undefined,
    postId: string,
  ): Promise<SafePost> {
    const channel = await channelService.getChannel(identifier, viewerId);
    const post = await channelPostRepository.findPostById(postId);
    if (!post || post.channelId.toString() !== channel.id) {
      throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
    }
    const [safePost] = await enrichAuthors([post]);
    return safePost!;
  },

  async updatePost(
    userId: string,
    identifier: string,
    postId: string,
    body: string,
  ): Promise<SafePost> {
    const { post } = await this.resolvePostForModification(userId, identifier, postId);
    const updated = await channelPostRepository.updatePostBody(post._id.toString(), body);
    if (!updated) {
      throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
    }
    const [safePost] = await enrichAuthors([updated]);
    return safePost!;
  },

  async softDeletePost(userId: string, identifier: string, postId: string): Promise<void> {
    const { channel, post } = await this.resolvePostForModification(userId, identifier, postId);
    await channelPostRepository.softDeletePost(post._id.toString());
    await channelRepository.incrementPostCount(channel.id, -1);
  },

  async addPostImage(
    userId: string,
    identifier: string,
    postId: string,
    file: UploadableFile,
  ): Promise<SafePost> {
    if (!isSupportedImage(file.mimetype)) {
      throw new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed');
    }
    // Authoritative check: sniff the real file bytes rather than trusting the
    // client-supplied Content-Type (CLAUDE.md §11) before anything reaches Cloudinary.
    if (!sniffImageMimeType(file.buffer)) {
      throw new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed');
    }
    const { post } = await this.resolvePostForModification(userId, identifier, postId);
    const asset = await mediaStorage.uploadPostImage(file);
    const order = (post.images ?? []).length;
    const updated = await channelPostRepository.appendPostImage(post._id.toString(), {
      publicId: asset.publicId,
      url: asset.url,
      alt: '',
      order,
    });
    if (!updated) {
      throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
    }
    const [safePost] = await enrichAuthors([updated]);
    return safePost!;
  },

  /**
   * Resolves a post for modification with the "author or admin" rule: the post
   * author may always edit/delete their own post, and OWNER/ADMIN subscribers
   * may edit/delete any post. `getChannel` enforces the S1 gate, so a
   * non-subscriber never reaches the post.
   */
  async resolvePostForModification(
    userId: string,
    identifier: string,
    postId: string,
  ): Promise<{ channel: { id: string }; post: ChannelPostDoc }> {
    const channel = await channelService.getChannel(identifier, userId);
    const post = await channelPostRepository.findPostById(postId);
    if (!post || post.channelId.toString() !== channel.id) {
      throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
    }
    const isAuthor = post.authorId.toString() === userId;
    const isManager = channel.role === 'OWNER' || channel.role === 'ADMIN';
    if (!isAuthor && !isManager) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this post');
    }
    return { channel: { id: channel.id }, post };
  },
};
