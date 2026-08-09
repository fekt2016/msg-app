import type { QueryFilter } from 'mongoose';
import { StoryModel, type StoryDoc } from './story.model.js';
import { StoryViewModel, type StoryViewDoc } from './storyView.model.js';

export interface CreateStoryInput {
  authorId: string;
  media: {
    publicId: string;
    url: string;
    width?: number;
    height?: number;
    resourceType: 'IMAGE' | 'VIDEO';
    durationMs?: number;
  };
  caption: string;
  expiresAt: Date;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTIVE_FILTER: QueryFilter<StoryDoc> = { expiresAt: { $gt: new Date() } };

export const storyRepository = {
  async create(input: CreateStoryInput): Promise<StoryDoc> {
    return StoryModel.create(input);
  },

  async findById(id: string): Promise<StoryDoc | null> {
    return StoryModel.findById(id).lean();
  },

  async findActiveById(id: string): Promise<StoryDoc | null> {
    return StoryModel.findOne({ _id: id, ...ACTIVE_FILTER }).lean();
  },

  async deleteById(id: string): Promise<void> {
    await StoryModel.deleteOne({ _id: id });
  },

  async deleteViewsByStoryId(storyId: string): Promise<void> {
    await StoryViewModel.deleteMany({ storyId });
  },

  /**
   * Feed: every author with at least one active story, most-recent story first.
   * Aggregates the distinct authors, then fetches each author's active stories
   * for the ring. Returns a `Map<authorId, StoryDoc[]>` plus the matching page.
   */
  async listFeed(
    page: number,
    pageSize: number,
  ): Promise<{ authorId: string; stories: StoryDoc[]; latestAt: Date }[]> {
    const authors = await StoryModel.aggregate<{ _id: string; latestAt: Date }>([
      { $match: { expiresAt: { $gt: new Date() } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$authorId', latestAt: { $first: '$createdAt' } } },
      { $sort: { latestAt: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ]);

    if (authors.length === 0) {
      return [];
    }

    const authorIds = authors.map((a) => a._id);
    const stories = await StoryModel.find({
      authorId: { $in: authorIds },
      ...ACTIVE_FILTER,
    })
      .sort({ createdAt: -1 })
      .lean();

    const byAuthor = new Map<string, StoryDoc[]>();
    for (const story of stories) {
      const key = story.authorId.toString();
      const list = byAuthor.get(key);
      if (list) {
        list.push(story);
      } else {
        byAuthor.set(key, [story]);
      }
    }

    const latestByAuthor = new Map(authors.map((a) => [a._id, a.latestAt]));
    return authors
      .map((a) => ({
        authorId: a._id,
        stories: byAuthor.get(a._id) ?? [],
        latestAt: latestByAuthor.get(a._id) ?? new Date(0),
      }))
      .filter((a) => a.stories.length > 0);
  },

  async countActiveAuthors(): Promise<number> {
    // The feed paginates by author (one ring per author), so the total is the
    // count of DISTINCT active authors — group by authorId first, then count the
    // groups (counting stories would over-report totalPages).
    const result = await StoryModel.aggregate<{ count: number }>([
      { $match: { expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$authorId' } },
      { $count: 'count' },
    ]);
    return result[0]?.count ?? 0;
  },

  async incrementViewCount(storyId: string): Promise<StoryDoc | null> {
    return StoryModel.findByIdAndUpdate(storyId, { $inc: { viewCount: 1 } }, { new: true }).lean();
  },

  async addView(input: {
    storyId: string;
    viewerId: string;
    expiresAt: Date;
  }): Promise<StoryViewDoc> {
    return StoryViewModel.create(input);
  },

  async listViewers(
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<{ viewerId: string; viewedAt: Date }[]> {
    return StoryViewModel.find({ storyId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .then((views) =>
        views.map((v) => ({
          viewerId: v.viewerId.toString(),
          viewedAt: v.createdAt,
        })),
      );
  },

  async countViews(storyId: string): Promise<number> {
    return StoryViewModel.countDocuments({ storyId });
  },

  async hasViewed(storyId: string, viewerId: string): Promise<boolean> {
    return StoryViewModel.exists({ storyId, viewerId }).then((v) => v !== null);
  },

  async listViewedStoryIds(storyIds: string[], viewerId: string): Promise<string[]> {
    const views = await StoryViewModel.find({ storyId: { $in: storyIds }, viewerId }).lean();
    return views.map((v) => v.storyId.toString());
  },
};
