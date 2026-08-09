import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as storyModelModule from './story.model.js';
import * as storyViewModelModule from './storyView.model.js';
import { storyRepository } from './story.repository.js';

vi.mock('./story.model.js', () => ({
  StoryModel: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock('./storyView.model.js', () => ({
  StoryViewModel: {
    create: vi.fn(),
    find: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
    exists: vi.fn(),
  },
}));

const storyModel = vi.mocked(storyModelModule.StoryModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const viewModel = vi.mocked(storyViewModelModule.StoryViewModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storyRepository.countActiveAuthors', () => {
  it('counts DISTINCT active authors, not stories', async () => {
    storyModel.aggregate.mockResolvedValue([{ count: 3 }]);

    const total = await storyRepository.countActiveAuthors();

    expect(total).toBe(3);
    // The pipeline must group by author before counting — counting raw stories
    // would over-report the feed total.
    const pipeline = storyModel.aggregate.mock.calls[0][0];
    expect(pipeline).toEqual(
      expect.arrayContaining([{ $group: { _id: '$authorId' } }, { $count: 'count' }]),
    );
  });

  it('returns 0 when there are no active authors', async () => {
    storyModel.aggregate.mockResolvedValue([]);
    expect(await storyRepository.countActiveAuthors()).toBe(0);
  });
});

describe('storyRepository.listFeed', () => {
  it('groups active stories by author when aggregate _id is an ObjectId (string-key match)', async () => {
    // `$group _id: '$authorId'` yields a BSON ObjectId, but `byAuthor` is keyed
    // by `authorId.toString()` — the id must be normalized to a string or every
    // author is dropped and the feed comes back empty.
    const authorOid = { toString: () => 'author-1' };
    storyModel.aggregate.mockResolvedValue([{ _id: authorOid, latestAt: new Date('2026-01-02') }]);
    storyModel.find.mockReturnValue({
      sort: () => ({
        lean: () =>
          Promise.resolve([
            { _id: { toString: () => 's1' }, authorId: { toString: () => 'author-1' } },
          ]),
      }),
    });

    const rows = await storyRepository.listFeed(1, 20);

    expect(rows).toHaveLength(1);
    expect(rows[0].authorId).toBe('author-1');
    expect(rows[0].stories).toHaveLength(1);
  });

  it('returns [] when there are no active authors', async () => {
    storyModel.aggregate.mockResolvedValue([]);
    expect(await storyRepository.listFeed(1, 20)).toEqual([]);
  });
});

describe('storyRepository views', () => {
  it('adds a view row', async () => {
    viewModel.create.mockResolvedValue({ _id: 'view-1' });
    const input = { storyId: 's1', viewerId: 'u2', expiresAt: new Date() };

    const result = await storyRepository.addView(input);

    expect(viewModel.create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ _id: 'view-1' });
  });

  it('reports whether a viewer has seen a story', async () => {
    viewModel.exists.mockResolvedValue({ _id: 'view-1' });
    expect(await storyRepository.hasViewed('s1', 'u2')).toBe(true);

    viewModel.exists.mockResolvedValue(null);
    expect(await storyRepository.hasViewed('s1', 'u2')).toBe(false);
  });
});
