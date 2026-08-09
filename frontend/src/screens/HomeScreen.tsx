import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import {
  useStoryFeed,
  useMarkStoryViewedInFeed,
  useLikeStory,
  useUnlikeStory,
  storyKeys,
} from '../hooks/useStories';
import { realtimeClient, REALTIME_EVENTS } from '../realtime/client';
import type { Story } from '../api/stories';
import type { AppStackParamList, MainTabsParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Home'>,
  NativeStackScreenProps<AppStackParamList>
>;

type FeedStory = {
  story: Story;
  author: { id: string; displayName: string; avatarUrl: string | null };
};

/** Fisher–Yates shuffle (returns a new array) so the feed order is random. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export function HomeScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const window = useWindowDimensions();
  const { data: feed, isLoading, isError, refetch } = useStoryFeed();
  const markViewed = useMarkStoryViewedInFeed();

  // Measured height paints exactly to the tab area; the window height is the
  // fallback so the first frame isn't blank before onLayout fires.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const containerHeight = measuredHeight || window.height;
  const [activeId, setActiveId] = useState<string | null>(null);
  // One shared mute toggle for the whole feed (TikTok-style). Muted by default
  // for reliable autoplay; the rail's speaker icon flips it.
  const [muted, setMuted] = useState(true);
  const viewedRef = useRef<Set<string>>(new Set());
  const likeStory = useLikeStory();
  const unlikeStory = useUnlikeStory();

  // Flatten every author's active stories into one cross-author list. `byId`
  // holds the current (post-optimistic-patch) story data.
  const flat = useMemo<FeedStory[]>(
    () =>
      (feed?.items ?? []).flatMap((item) =>
        item.stories.map((story) => ({ story, author: item.author })),
      ),
    [feed],
  );
  const byId = useMemo(() => new Map(flat.map((f) => [f.story.id, f])), [flat]);

  // Stable shuffled order (TikTok-style random): keyed on the SET of story ids,
  // so a like patch (same ids, changed likeCount/hasLiked) never reshuffles the
  // feed — only adding/removing stories does.
  const idSetKey = useMemo(
    () =>
      flat
        .map((f) => f.story.id)
        .sort()
        .join(','),
    [flat],
  );
  const orderedIds = useMemo(() => (idSetKey ? shuffle(idSetKey.split(',')) : []), [idSetKey]);
  const stories = useMemo(
    () => orderedIds.map((id) => byId.get(id)).filter((s): s is FeedStory => Boolean(s)),
    [orderedIds, byId],
  );

  // Keep the feed fresh: a new/deleted story anywhere refetches the feed.
  useEffect(() => {
    const socket = realtimeClient.connect();
    const refresh = () => void queryClient.invalidateQueries({ queryKey: storyKeys.feed() });
    socket.on(REALTIME_EVENTS.STORY_NEW, refresh);
    socket.on(REALTIME_EVENTS.STORY_DELETED, refresh);
    return () => {
      socket.off(REALTIME_EVENTS.STORY_NEW, refresh);
      socket.off(REALTIME_EVENTS.STORY_DELETED, refresh);
    };
  }, [queryClient]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.item as FeedStory | undefined;
    if (!first) return;
    const id = first.story.id;
    setActiveId(id);
    // Mark viewed once per story per session (server is idempotent regardless).
    if (!first.story.hasViewed && !viewedRef.current.has(id)) {
      viewedRef.current.add(id);
      markViewed.mutate(id);
    }
  }).current;

  // The first story is active by default so its video autoplays on mount,
  // without waiting for the initial onViewableItemsChanged to fire.
  const activeStoryId = activeId ?? stories[0]?.story.id ?? null;

  const toggleLike = useCallback(
    (story: Story) => {
      // Optimistic like/unlike — the mutation patches the feed cache
      // (hasLiked + likeCount) so the heart and count update immediately.
      if (story.hasLiked) {
        unlikeStory.mutate(story.id);
      } else {
        likeStory.mutate(story.id);
      }
    },
    [likeStory, unlikeStory],
  );

  const handleShare = useCallback((story: Story) => {
    void Share.share({
      message: story.caption || 'Check out this story on Eaz Community',
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedStory }) => (
      <StoryPage
        item={item}
        height={containerHeight}
        isActive={item.story.id === activeStoryId}
        muted={muted}
        onToggleLike={() => toggleLike(item.story)}
        onToggleMute={() => setMuted((m) => !m)}
        onShare={() => handleShare(item.story)}
      />
    ),
    [containerHeight, activeStoryId, muted, toggleLike, handleShare],
  );

  return (
    <View
      testID="home-feed"
      style={styles.safe}
      onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
    >
      {containerHeight > 0 && stories.length > 0 ? (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.story.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={containerHeight}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: containerHeight,
            offset: containerHeight * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          windowSize={3}
        />
      ) : (
        <View style={[styles.stateWrap, { height: containerHeight || undefined }]}>
          {isLoading ? (
            <ActivityIndicator color={colors.kenteGold} />
          ) : isError ? (
            <Pressable accessibilityRole="button" onPress={() => void refetch()}>
              <Text style={styles.stateText}>Could not load stories. Tap to retry.</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No stories yet</Text>
              <Text style={styles.stateText}>Be the first to share a moment.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create your first story"
                onPress={() => navigation.navigate('CreateStory')}
                style={styles.emptyCta}
              >
                <Text style={styles.emptyCtaText}>＋ Add your story</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Text style={styles.brand}>✦ Eaz</Text>
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add your story"
            onPress={() => navigation.navigate('CreateStory')}
            hitSlop={8}
            style={styles.topButton}
          >
            <Text style={styles.topIcon}>＋</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open channels"
            onPress={() => navigation.navigate('Channels')}
            hitSlop={8}
            style={styles.topButton}
          >
            <Text style={styles.topIcon}>◆</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function StoryPage({
  item,
  height,
  isActive,
  muted,
  onToggleLike,
  onToggleMute,
  onShare,
}: {
  item: FeedStory;
  height: number;
  isActive: boolean;
  muted: boolean;
  onToggleLike: () => void;
  onToggleMute: () => void;
  onShare: () => void;
}) {
  const { story, author } = item;
  return (
    <View style={[styles.page, { height }]}>
      {story.media.resourceType === 'VIDEO' ? (
        <FeedVideo url={story.media.url} isActive={isActive} muted={muted} />
      ) : (
        <Image source={{ uri: story.media.url }} style={styles.media} resizeMode="cover" />
      )}

      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.actionRail}>
        <View style={styles.railItem}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={story.hasLiked ? 'Unlike story' : 'Like story'}
            onPress={onToggleLike}
            hitSlop={8}
            style={styles.railButton}
          >
            <Ionicons
              name={story.hasLiked ? 'heart' : 'heart-outline'}
              size={32}
              color={story.hasLiked ? colors.terracotta : colors.savanna}
            />
          </Pressable>
          {story.likeCount > 0 ? <Text style={styles.railCount}>{story.likeCount}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share story"
          onPress={onShare}
          hitSlop={8}
          style={styles.railButton}
        >
          <Ionicons name="paper-plane-outline" size={28} color={colors.savanna} />
        </Pressable>
        {story.media.resourceType === 'VIDEO' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
            onPress={onToggleMute}
            hitSlop={8}
            style={styles.railButton}
          >
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={28}
              color={colors.savanna}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.metaOverlay} pointerEvents="none">
        <View style={styles.authorRow}>
          <View style={styles.authorAvatar}>
            {author.avatarUrl ? (
              <Image source={{ uri: author.avatarUrl }} style={styles.authorAvatarImg} />
            ) : (
              <Text style={styles.authorInitial}>
                {(author.displayName ?? '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={styles.authorName}>{author.displayName}</Text>
          <Text style={styles.authorTime}>· {timeAgo(story.createdAt)}</Text>
        </View>
        {story.caption ? <Text style={styles.caption}>{story.caption}</Text> : null}
      </View>
    </View>
  );
}

function FeedVideo({ url, isActive, muted }: { url: string; isActive: boolean; muted: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    // Muted autoplay is the reliable pattern for a feed (unmuted autoplay is
    // often blocked, especially on emulators without an audio device).
    p.muted = true;
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobabDeep,
  },
  page: {
    width: '100%',
    backgroundColor: colors.baobabDeep,
  },
  media: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '20%',
    backgroundColor: 'rgba(15, 27, 22, 0.5)',
  },
  metaOverlay: {
    position: 'absolute',
    left: 0,
    // Leave room on the right for the action rail so the caption never overlaps.
    right: 76,
    bottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  actionRail: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  railItem: {
    alignItems: 'center',
    gap: 4,
  },
  railButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15, 27, 22, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railCount: {
    color: colors.savanna,
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: colors.baobabDeep,
    textShadowRadius: 4,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  authorAvatarImg: {
    width: '100%',
    height: '100%',
  },
  authorInitial: {
    color: colors.baobabDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  authorName: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '700',
  },
  authorTime: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
  caption: {
    color: colors.savanna,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textShadowColor: colors.baobabDeep,
    textShadowRadius: 6,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  brand: {
    color: colors.kenteGold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: colors.baobabDeep,
    textShadowRadius: 6,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15, 27, 22, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIcon: {
    color: colors.kenteGold,
    fontSize: 18,
    fontWeight: '800',
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    color: colors.savanna,
    fontSize: 20,
    fontWeight: '800',
  },
  stateText: {
    color: colors.savannaMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.md,
    backgroundColor: colors.kenteGold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyCtaText: {
    color: colors.baobabDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
