import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useLikeStory, useStoryFeed, useUnlikeStory, storyKeys } from './useStories';
import * as storiesApi from '../api/stories';
import type { Story, StoryFeedItem, Paginated } from '../api/stories';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

jest.mock('../api/stories', () => ({
  createStory: jest.fn(),
  listStoryFeed: jest.fn(),
  getStory: jest.fn(),
  deleteStory: jest.fn(),
  markStoryViewed: jest.fn(),
  listStoryViewers: jest.fn(),
  likeStory: jest.fn(),
  unlikeStory: jest.fn(),
}));

const mockApi = storiesApi as jest.Mocked<typeof storiesApi>;

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 's1',
    authorId: 'u2',
    media: { publicId: 'story-1', url: 'https://cdn.test/s1.png', resourceType: 'IMAGE' },
    caption: 'Sunset over Accra',
    expiresAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    hasViewed: false,
    hasLiked: false,
    likeCount: 2,
    ...overrides,
  };
}

function feedData(stories: Story[]): Paginated<StoryFeedItem> {
  return {
    items: [
      {
        author: { id: 'u2', displayName: 'Kofi', avatarUrl: null },
        stories,
        latestAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useLikeStory / useUnlikeStory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('optimistically bumps the count in the feed cache and reconciles on success', async () => {
    const { queryClient, wrapper } = renderWithClient();
    queryClient.setQueryData(storyKeys.feed(), feedData([makeStory()]));
    mockApi.likeStory.mockResolvedValue({ liked: true, likeCount: 3 });

    const like = await renderHook(() => useLikeStory(), { wrapper });
    await act(async () => {
      like.result.current.mutate('s1');
    });

    // Optimistic write: hasLiked flips and the count is bumped before the server responds.
    await waitFor(() => {
      const feed = queryClient.getQueryData<Paginated<StoryFeedItem>>(storyKeys.feed());
      expect(feed?.items[0].stories[0].hasLiked).toBe(true);
      expect(feed?.items[0].stories[0].likeCount).toBe(3);
    });

    // Server reconciliation keeps the authoritative count.
    await waitFor(() => {
      const feed = queryClient.getQueryData<Paginated<StoryFeedItem>>(storyKeys.feed());
      expect(feed?.items[0].stories[0].likeCount).toBe(3);
      expect(mockApi.likeStory).toHaveBeenCalledWith('s1');
    });
  });

  it('optimistically decrements the count and reconciles on unlike success', async () => {
    const { queryClient, wrapper } = renderWithClient();
    queryClient.setQueryData(
      storyKeys.feed(),
      feedData([makeStory({ hasLiked: true, likeCount: 5 })]),
    );
    mockApi.unlikeStory.mockResolvedValue({ liked: false, likeCount: 4 });

    const unlike = await renderHook(() => useUnlikeStory(), { wrapper });
    await act(async () => {
      unlike.result.current.mutate('s1');
    });

    await waitFor(() => {
      const feed = queryClient.getQueryData<Paginated<StoryFeedItem>>(storyKeys.feed());
      expect(feed?.items[0].stories[0].hasLiked).toBe(false);
      expect(feed?.items[0].stories[0].likeCount).toBe(4);
    });

    await waitFor(() => {
      expect(mockApi.unlikeStory).toHaveBeenCalledWith('s1');
    });
  });

  it('restores the cache by refetching on mutation error', async () => {
    const { queryClient, wrapper } = renderWithClient();
    queryClient.setQueryData(storyKeys.feed(), feedData([makeStory()]));
    mockApi.likeStory.mockRejectedValue(new Error('network'));
    mockApi.listStoryFeed.mockResolvedValue(feedData([makeStory()]));

    // Mount the feed hook so the feed query has an active observer for the
    // invalidation to refetch (invalidateQueries only refetches active queries).
    const feed = await renderHook(() => useStoryFeed(), { wrapper });
    const like = await renderHook(() => useLikeStory(), { wrapper });
    await waitFor(() => expect(feed.result.current.isSuccess).toBe(true));

    await act(async () => {
      like.result.current.mutate('s1');
    });

    await waitFor(() => {
      expect(mockApi.listStoryFeed).toHaveBeenCalled();
    });
  });
});

describe('useStoryFeed', () => {
  it('loads the first feed page', async () => {
    const { wrapper } = renderWithClient();
    mockApi.listStoryFeed.mockResolvedValue(feedData([makeStory()]));

    const feed = await renderHook(() => useStoryFeed(), { wrapper });

    await waitFor(() => {
      expect(feed.result.current.data?.items[0].stories[0].id).toBe('s1');
    });
    expect(mockApi.listStoryFeed).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });
});
