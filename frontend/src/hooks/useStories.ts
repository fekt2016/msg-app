import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStory,
  deleteStory,
  getStory,
  listStoryFeed,
  listStoryViewers,
  markStoryViewed,
  type PickedMedia,
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
