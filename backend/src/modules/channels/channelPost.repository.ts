import { ChannelPostModel, type ChannelPostDoc } from './channelPost.model.js';
import { decodePostCursor, encodePostCursor } from './postCursor.js';

export interface PostImageInput {
  publicId: string;
  url: string;
  alt: string;
  order: number;
}

export interface PaginatedPosts {
  items: ChannelPostDoc[];
  nextCursor: string | null;
}

function toPage(posts: ChannelPostDoc[], limit: number): PaginatedPosts {
  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    if (last) {
      nextCursor = encodePostCursor({ createdAt: last.createdAt, postId: last._id.toString() });
    }
  }
  return { items, nextCursor };
}

export const channelPostRepository = {
  async createPost(channelId: string, authorId: string, body: string): Promise<ChannelPostDoc> {
    return ChannelPostModel.create({ channelId, authorId, body });
  },

  async findPostById(postId: string): Promise<ChannelPostDoc | null> {
    return ChannelPostModel.findOne({ _id: postId, deletedAt: null });
  },

  async listPosts(
    channelId: string,
    options: { limit: number; cursor?: string | null },
  ): Promise<PaginatedPosts> {
    const filter = { channelId, deletedAt: null } as const;
    if (options.cursor) {
      const { createdAt, postId } = decodePostCursor(options.cursor);
      return ChannelPostModel.find({
        channelId,
        deletedAt: null,
        $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: postId } }],
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(options.limit + 1)
        .then((posts) => toPage(posts, options.limit));
    }
    return ChannelPostModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit + 1)
      .then((posts) => toPage(posts, options.limit));
  },

  async updatePostBody(postId: string, body: string): Promise<ChannelPostDoc | null> {
    return ChannelPostModel.findByIdAndUpdate(
      postId,
      { $set: { body } },
      { new: true, runValidators: true },
    );
  },

  async softDeletePost(postId: string): Promise<ChannelPostDoc | null> {
    return ChannelPostModel.findByIdAndUpdate(
      postId,
      { $set: { deletedAt: new Date() } },
      { new: true },
    );
  },

  async appendPostImage(postId: string, image: PostImageInput): Promise<ChannelPostDoc | null> {
    return ChannelPostModel.findByIdAndUpdate(
      postId,
      { $push: { images: image } },
      { new: true, runValidators: true },
    );
  },
};
