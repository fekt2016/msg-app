import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChannel,
  useChannelPosts,
  useSubscribeToChannel,
  useUnsubscribeFromChannel,
  useSetReaction,
  useRemoveReaction,
  useDeletePost,
  channelKeys,
} from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import { REACTION_EMOJIS, type ChannelPost, type ReactionEmoji } from '../api/channels';
import {
  realtimeClient,
  REALTIME_EVENTS,
  type ChannelPostEvent,
  type ChannelPostDeletedEvent,
  type ChannelPostReactionEvent,
  type ChannelDeletedEvent,
} from '../realtime/client';
import { Button } from '../components/Button';
import { useAuth } from '../auth/AuthContext';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'ChannelDetail'>;

export function ChannelDetailScreen({ route, navigation }: Props) {
  const { identifier } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: channel, isLoading, isError, error } = useChannel(identifier);
  const {
    data: feed,
    isLoading: feedLoading,
    isError: feedError,
    refetch: refetchFeed,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChannelPosts(identifier);
  const subscribe = useSubscribeToChannel(identifier);
  const unsubscribe = useUnsubscribeFromChannel(identifier);
  const setReaction = useSetReaction(identifier);
  const removeReaction = useRemoveReaction(identifier);
  const deletePost = useDeletePost(identifier);
  // Tracks the current user's own reaction per post (not included in the post
  // shape). Cleared when the post's counts change from elsewhere.
  const [myReactions, setMyReactions] = useState<Record<string, ReactionEmoji | null>>({});

  const channelId = channel?.id;

  // Join the channel room on open and keep the feed + detail fresh. Post
  // events invalidate only the feed; subscriber events also refresh the detail
  // (counts/role) and the browse/mine caches; a soft-deleted channel navigates
  // away. The server gates the room join on read access (S1) — a non-subscriber
  // simply never lands on this screen.
  useEffect(() => {
    if (!channelId) return;
    const socket = realtimeClient.connect();
    socket.emit(REALTIME_EVENTS.CHANNEL_SUBSCRIBE, { channelId });

    const handlePostNew = (payload: ChannelPostEvent) => {
      if (payload.channelId !== channelId) return;
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    };
    const handlePostUpdated = handlePostNew;
    const handlePostDeleted = (payload: ChannelPostDeletedEvent) => {
      if (payload.channelId !== channelId) return;
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
    };
    const handlePostReaction = (payload: ChannelPostReactionEvent) => {
      if (payload.channelId !== channelId) return;
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(identifier) });
    };
    const handleSubscriberChange = () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
      void queryClient.invalidateQueries({ queryKey: channelKeys.mine() });
    };
    const handleChannelDeleted = (payload: ChannelDeletedEvent) => {
      if (payload.channelId !== channelId) return;
      navigation.goBack();
    };

    socket.on(REALTIME_EVENTS.CHANNEL_POST_NEW, handlePostNew);
    socket.on(REALTIME_EVENTS.CHANNEL_POST_UPDATED, handlePostUpdated);
    socket.on(REALTIME_EVENTS.CHANNEL_POST_DELETED, handlePostDeleted);
    socket.on(REALTIME_EVENTS.CHANNEL_POST_REACTION, handlePostReaction);
    socket.on(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_JOINED, handleSubscriberChange);
    socket.on(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_LEFT, handleSubscriberChange);
    socket.on(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_ROLE, handleSubscriberChange);
    socket.on(REALTIME_EVENTS.CHANNEL_DELETED, handleChannelDeleted);

    return () => {
      socket.emit(REALTIME_EVENTS.CHANNEL_UNSUBSCRIBE, { channelId });
      socket.off(REALTIME_EVENTS.CHANNEL_POST_NEW, handlePostNew);
      socket.off(REALTIME_EVENTS.CHANNEL_POST_UPDATED, handlePostUpdated);
      socket.off(REALTIME_EVENTS.CHANNEL_POST_DELETED, handlePostDeleted);
      socket.off(REALTIME_EVENTS.CHANNEL_POST_REACTION, handlePostReaction);
      socket.off(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_JOINED, handleSubscriberChange);
      socket.off(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_LEFT, handleSubscriberChange);
      socket.off(REALTIME_EVENTS.CHANNEL_SUBSCRIBER_ROLE, handleSubscriberChange);
      socket.off(REALTIME_EVENTS.CHANNEL_DELETED, handleChannelDeleted);
    };
  }, [channelId, identifier, queryClient, navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (isError || !channel) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <Text style={styles.error}>{apiErrorMessage(error)}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isManager = channel.role === 'OWNER' || channel.role === 'ADMIN';
  const mutationError = subscribe.error ?? unsubscribe.error;
  const posts = feed?.pages.flatMap((page) => page.items) ?? [];
  const isSubscribed = channel.isSubscribed;

  async function handleToggleSubscription() {
    if (isSubscribed) {
      await unsubscribe.mutateAsync();
    } else {
      await subscribe.mutateAsync();
    }
  }

  function handleReact(post: ChannelPost, emoji: ReactionEmoji) {
    const current = myReactions[post.id] ?? null;
    if (current === emoji) {
      setMyReactions((prev) => ({ ...prev, [post.id]: null }));
      void removeReaction.mutate(post.id);
    } else {
      setMyReactions((prev) => ({ ...prev, [post.id]: emoji }));
      void setReaction.mutate({ postId: post.id, emoji });
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{channel.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerBody}>
            <Text style={styles.title}>{channel.name}</Text>
            <Text style={styles.meta}>
              {channel.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {channel.subscriberCount}{' '}
              {channel.subscriberCount === 1 ? 'subscriber' : 'subscribers'}
            </Text>
          </View>
        </View>

        {channel.description ? <Text style={styles.description}>{channel.description}</Text> : null}

        {mutationError ? <Text style={styles.error}>{apiErrorMessage(mutationError)}</Text> : null}

        {channel.isSubscribed && !channel.role ? null : channel.isSubscribed ? (
          <Button
            onPress={() => void handleToggleSubscription()}
            loading={unsubscribe.isPending}
            variant="secondary"
          >
            Unsubscribe
          </Button>
        ) : (
          <Button
            onPress={() => void handleToggleSubscription()}
            loading={subscribe.isPending}
            variant="primary"
          >
            Subscribe
          </Button>
        )}

        {isManager ? (
          <View style={styles.managerRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('ChannelPostComposer', { identifier })}
              style={styles.link}
            >
              <Text style={styles.linkText}>+ New post</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('JoinRequests', { identifier })}
              style={styles.link}
            >
              <Text style={styles.linkText}>Join requests</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Invites', { identifier })}
              style={styles.link}
            >
              <Text style={styles.linkText}>Invites</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              myReaction={myReactions[item.id] ?? null}
              canDelete={isManager || item.authorId === user?.id}
              onReact={(emoji) => handleReact(item, emoji)}
              onDelete={() => void deletePost.mutate(item.id)}
            />
          )}
          contentContainerStyle={styles.feed}
          onEndReached={() => {
            if (hasNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            feedLoading ? (
              <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
            ) : feedError ? (
              <Pressable accessibilityRole="button" onPress={() => void refetchFeed()}>
                <Text style={styles.empty}>Could not load posts. Tap to retry.</Text>
              </Pressable>
            ) : (
              <Text style={styles.empty}>No posts yet.</Text>
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={colors.kenteGold} style={styles.footerLoader} />
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

function PostCard({
  post,
  myReaction,
  canDelete,
  onReact,
  onDelete,
}: {
  post: ChannelPost;
  myReaction: ReactionEmoji | null;
  canDelete: boolean;
  onReact: (emoji: ReactionEmoji) => void;
  onDelete: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Only surface reactions people have actually used (Slack/Telegram style),
  // plus the viewer's own in-flight reaction so its pill appears instantly.
  const shownReactions = REACTION_EMOJIS.filter(
    (emoji) => (post.reactionCounts[emoji] ?? 0) > 0 || myReaction === emoji,
  );

  function handlePick(emoji: ReactionEmoji) {
    setPickerOpen(false);
    onReact(emoji);
  }

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postAvatar}>
          <Text style={styles.postAvatarText}>
            {(post.author.displayName ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.postAuthor}>{post.author.displayName}</Text>
        {canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete post"
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.terracotta} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.postBody}>{post.body}</Text>

      <View style={styles.reactionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a reaction"
          onPress={() => setPickerOpen((open) => !open)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.reactTrigger,
            pickerOpen && styles.reactTriggerActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={pickerOpen ? 'happy' : 'happy-outline'}
            size={18}
            color={pickerOpen ? colors.baobab : colors.kenteGold}
          />
        </Pressable>

        {shownReactions.map((emoji) => {
          const count = post.reactionCounts[emoji] ?? 0;
          const active = myReaction === emoji;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`${emoji} reaction, ${count}${active ? ', selected' : ''}`}
              onPress={() => onReact(emoji)}
              style={[styles.reactionPill, active && styles.reactionPillActive]}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {count > 0 ? (
                <Text style={[styles.reactionCount, active && styles.reactionCountActive]}>
                  {count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {shownReactions.length === 0 ? (
          <Text style={styles.reactHint}>Be the first to react</Text>
        ) : null}
      </View>

      {pickerOpen ? (
        <View style={styles.picker}>
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              onPress={() => handlePick(emoji)}
              style={({ pressed }) => [
                styles.pickerItem,
                myReaction === emoji && styles.pickerItemActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobab,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  loader: {
    marginTop: spacing.xxl,
  },
  footerLoader: {
    marginVertical: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  backArrow: {
    color: colors.kenteGold,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    borderWidth: 2,
    borderColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.kenteGold,
    fontSize: 28,
    fontWeight: '800',
  },
  headerBody: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.savanna,
    fontSize: 24,
    fontWeight: '800',
  },
  meta: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
  description: {
    color: colors.savanna,
    fontSize: 15,
    lineHeight: 22,
  },
  managerRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  link: {
    alignSelf: 'flex-start',
  },
  linkText: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
  },
  feed: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  postCard: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarText: {
    color: colors.kenteGold,
    fontSize: 13,
    fontWeight: '700',
  },
  postAuthor: {
    color: colors.savannaMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  postBody: {
    color: colors.savanna,
    fontSize: 15,
    lineHeight: 21,
  },
  iconButton: {
    marginLeft: 'auto',
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  reactTrigger: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactTriggerActive: {
    borderColor: colors.kenteGold,
    backgroundColor: colors.kenteGold,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    minHeight: 34,
  },
  reactionPillActive: {
    borderColor: colors.kenteGold,
    backgroundColor: colors.baobabDeep,
  },
  reactionEmoji: {
    fontSize: 15,
  },
  reactionCount: {
    color: colors.savannaMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  reactionCountActive: {
    color: colors.kenteGold,
  },
  reactHint: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    backgroundColor: colors.baobabDeep,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  pickerItem: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemActive: {
    backgroundColor: colors.inputSurface,
  },
  pickerEmoji: {
    fontSize: 22,
  },
  pressed: {
    opacity: 0.6,
  },
  empty: {
    color: colors.savannaMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
