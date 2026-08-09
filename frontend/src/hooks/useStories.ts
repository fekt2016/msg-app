import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStory,
  deleteStory,
  getStory,
  likeStory,
  listStoryFeed,
  listStoryViewers,
  markStoryViewed,
  type PickedMedia,
  type Story,
  type StoryFeedItem,
  unlikeStory,
} from '../api/stories';

export const storyKeys = {
  all: ['stories'] as const,
  feed: () => [...storyKeys.all, 'feed'] as const,
  detail: (storyId: string) => [...storyKeys.all, 'detail', storyId] as const,
  viewers: (storyId: string) => [...storyKeys.all, 'viewers', storyId] as const,
};

const FEED_PAGE_SIZE = 20;

export function useStoryFeed() {
  return useQuery({
    queryKey: storyKeys.feed(),
    queryFn: () => listStoryFeed({ page: 1, pageSize: FEED_PAGE_SIZE }),
  });
}

export function useStory(storyId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: storyKeys.detail(storyId),
    queryFn: () => getStory(storyId),
    enabled: options.enabled ?? true,
  });
}

export function useStoryViewers(storyId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: storyKeys.viewers(storyId),
    queryFn: () => listStoryViewers(storyId, { page: 1, pageSize: FEED_PAGE_SIZE }),
    enabled: options.enabled ?? true,
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ media, caption }: { media: PickedMedia; caption?: string }) =>
      createStory(media, caption),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.feed() });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => deleteStory(storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.feed() });
    },
  });
}

export function useMarkStoryViewed(storyId: string) {
  return useMutation({
    mutationFn: () => markStoryViewed(storyId),
  });
}

/**
 * Mark-viewed for the cross-author feed, where the story id isn't known until
 * the viewer swipes to it. Idempotent server-side (a re-view is a 200 no-op).
 */
export function useMarkStoryViewedInFeed() {
  return useMutation({
    mutationFn: (storyId: string) => markStoryViewed(storyId),
  });
}

/**
 * Optimistically writes a target like state onto every cached copy of a story
 * (feed ring + open detail). The server responds with the authoritative count,
 * which is applied on success to reconcile any drift.
 */
function setStoryLikeInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  target: { hasLiked: boolean; likeCount: number },
): void {
  const patch = (story: Story): Story => ({
    ...story,
    hasLiked: target.hasLiked,
    likeCount: target.likeCount,
  });
  queryClient.setQueriesData<{
    items: StoryFeedItem[];
    total: number;
    page: number;
    pageSize: number;
  }>({ queryKey: storyKeys.feed() }, (feed) => {
    if (!feed) {
      return feed;
    }
    return {
      ...feed,
      items: feed.items.map((group) => ({
        ...group,
        stories: group.stories.map((story) => (story.id === storyId ? patch(story) : story)),
      })),
    };
  });
  queryClient.setQueryData<Story>(storyKeys.detail(storyId), (story) =>
    story ? patch(story) : story,
  );
}

function useStoryLikeMutation(
  mutationFn: (storyId: string) => Promise<{ liked: boolean; likeCount: number }>,
  target: (story: Story) => { hasLiked: boolean; likeCount: number },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => mutationFn(storyId),
    onMutate: (storyId: string) => {
      // The viewer mostly renders from the feed cache, so read the current
      // story from wherever it's cached before applying the optimistic patch.
      const current = findCachedStory(queryClient, storyId);
      if (!current) {
        return;
      }
      setStoryLikeInCache(queryClient, storyId, target(current));
    },
    onSuccess: (result, storyId) => {
      setStoryLikeInCache(queryClient, storyId, {
        hasLiked: result.liked,
        likeCount: result.likeCount,
      });
    },
    onError: (_err, storyId) => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
      void queryClient.invalidateQueries({ queryKey: storyKeys.feed() });
    },
  });
}

/** Returns the cached story matching `storyId` (detail query first, then feed). */
function findCachedStory(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
): Story | null {
  const detail = queryClient.getQueryData<Story>(storyKeys.detail(storyId));
  if (detail) {
    return detail;
  }
  const feed = queryClient.getQueryData<{
    items: StoryFeedItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(storyKeys.feed());
  for (const group of feed?.items ?? []) {
    const match = group.stories.find((story) => story.id === storyId);
    if (match) {
      return match;
    }
  }
  return null;
}

export function useLikeStory() {
  return useStoryLikeMutation(likeStory, (story) => ({
    hasLiked: true,
    likeCount: story.likeCount + 1,
  }));
}

export function useUnlikeStory() {
  return useStoryLikeMutation(unlikeStory, (story) => ({
    hasLiked: false,
    likeCount: Math.max(story.likeCount - 1, 0),
  }));
}
