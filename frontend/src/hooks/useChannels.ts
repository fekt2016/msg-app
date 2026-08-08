import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  createChannel,
  createInvite,
  createPost,
  decideJoinRequest,
  deleteChannel,
  deletePost,
  getChannel,
  joinViaInvite,
  listChannels,
  listInvites,
  listJoinRequests,
  listMyChannels,
  listPosts,
  listChannelSubscribers,
  previewInvite,
  removeReaction,
  requestToJoin,
  revokeInvite,
  setReaction,
  subscribeToChannel,
  unsubscribeFromChannel,
  updateChannel,
  updatePost,
  updateSubscriberRole,
  type ChannelVisibility,
  type ChannelRole,
  type ChannelPost,
  type CursorPage,
  type CreateChannelInput,
  type ReactionEmoji,
} from '../api/channels';

type PostFeed = InfiniteData<CursorPage<ChannelPost>, string | null>;

/**
 * Writes the server-authoritative reaction counts straight into the cached feed
 * so the tapped post's counts update the instant the mutation resolves — no
 * refetch round-trip, no guessing (the reaction endpoints return the fresh
 * counts).
 */
function patchPostReactionCounts(
  data: PostFeed | undefined,
  postId: string,
  reactionCounts: Record<string, number>,
): PostFeed | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => (post.id === postId ? { ...post, reactionCounts } : post)),
    })),
  };
}

export const channelKeys = {
  all: ['channels'] as const,
  browse: (filters: { q?: string; page?: number; pageSize?: number }) =>
    [...channelKeys.all, 'browse', filters] as const,
  mine: () => [...channelKeys.all, 'mine'] as const,
  detail: (identifier: string) => [...channelKeys.all, 'detail', identifier] as const,
  posts: (identifier: string) => [...channelKeys.all, 'posts', identifier] as const,
  subscribers: (identifier: string) => [...channelKeys.all, 'subscribers', identifier] as const,
  invites: (identifier: string) => [...channelKeys.all, 'invites', identifier] as const,
  requests: (identifier: string) => [...channelKeys.all, 'requests', identifier] as const,
};

const POST_FEED_PAGE_SIZE = 20;

export function useChannels(params: { q?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: channelKeys.browse(params),
    queryFn: () => listChannels(params),
  });
}

export function useMyChannels() {
  return useQuery({ queryKey: channelKeys.mine(), queryFn: () => listMyChannels() });
}

export function useChannel(identifier: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: channelKeys.detail(identifier),
    queryFn: () => getChannel(identifier),
    enabled: options.enabled ?? true,
  });
}

/** Cursor-paginated post feed — `fetchNextPage` loads the next `meta.nextCursor` page. */
export function useChannelPosts(identifier: string) {
  return useInfiniteQuery({
    queryKey: channelKeys.posts(identifier),
    queryFn: ({ pageParam }) =>
      listPosts(identifier, { limit: POST_FEED_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useChannelSubscribers(
  identifier: string,
  params: { page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: channelKeys.subscribers(identifier),
    queryFn: () => listChannelSubscribers(identifier, params),
  });
}

export function useChannelInvites(identifier: string) {
  return useQuery({
    queryKey: channelKeys.invites(identifier),
    queryFn: () => listInvites(identifier),
  });
}

export function useJoinRequests(identifier: string) {
  return useQuery({
    queryKey: channelKeys.requests(identifier),
    queryFn: () => listJoinRequests(identifier),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) => createChannel(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
}

export function useUpdateChannel(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateChannelInput>) => updateChannel(identifier, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
}

export function useDeleteChannel(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteChannel(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    },
  });
}

export function useSubscribeToChannel(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => subscribeToChannel(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    },
  });
}

export function useUnsubscribeFromChannel(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unsubscribeFromChannel(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    },
  });
}

export function useUpdateSubscriberRole(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<ChannelRole, 'OWNER'> }) =>
      updateSubscriberRole(identifier, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.subscribers(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    },
  });
}

export function useCreateInvite(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      role?: Exclude<ChannelRole, 'OWNER'>;
      expiresInDays?: number;
      maxUses?: number;
    }) => createInvite(identifier, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.invites(identifier) });
    },
  });
}

export function useRevokeInvite(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(identifier, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.invites(identifier) });
    },
  });
}

export function usePreviewInvite(token: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...channelKeys.all, 'invite-preview', token] as const,
    queryFn: () => previewInvite(token),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useJoinViaInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => joinViaInvite(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    },
  });
}

export function useRequestToJoin(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestToJoin(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    },
  });
}

export function useDecideJoinRequest(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'APPROVE' | 'DENY' }) =>
      decideJoinRequest(identifier, userId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.requests(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    },
  });
}

export function useCreatePost(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => createPost(identifier, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    },
  });
}

export function useUpdatePost(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      updatePost(identifier, postId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
    },
  });
}

export function useDeletePost(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deletePost(identifier, postId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    },
  });
}

export function useSetReaction(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, emoji }: { postId: string; emoji: ReactionEmoji }) =>
      setReaction(identifier, postId, emoji),
    // Trust the server response so the reacting user's own counts update
    // immediately even if the socket is disconnected; the realtime
    // `channel:post:reaction` broadcast keeps everyone else in the room in sync.
    onSuccess: (counts, { postId }) => {
      queryClient.setQueryData<PostFeed>(channelKeys.posts(identifier), (old) =>
        patchPostReactionCounts(old, postId, counts),
      );
    },
  });
}

export function useRemoveReaction(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => removeReaction(identifier, postId),
    onSuccess: (counts, postId) => {
      queryClient.setQueryData<PostFeed>(channelKeys.posts(identifier), (old) =>
        patchPostReactionCounts(old, postId, counts),
      );
    },
  });
}

export type { ChannelVisibility, ChannelRole };
