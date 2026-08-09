import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryFeed, useMarkStoryViewed, useStoryViewers, storyKeys } from '../hooks/useStories';
import { realtimeClient, REALTIME_EVENTS, type StoryViewedEvent } from '../realtime/client';
import { useAuth } from '../auth/AuthContext';
import type { Story } from '../api/stories';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'StoryViewer'>;

/** Default display time per image story (ms). */
const IMAGE_STORY_DURATION_MS = 5000;
/** Minimum display time for a video story regardless of its runtime. */
const MIN_VIDEO_STORY_DURATION_MS = 3000;

export function StoryViewerScreen({ route, navigation }: Props) {
  const { authorId, displayName } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: feed } = useStoryFeed();

  const authorRing = useMemo(
    () => feed?.items.find((item) => item.author.id === authorId) ?? null,
    [feed, authorId],
  );
  const stories = authorRing?.stories ?? [];
  const [index, setIndex] = useState(0);

  const story: Story | null = stories[index] ?? null;
  const isOwn = authorId === user?.id;
  const isLast = index >= stories.length - 1;

  const markViewed = useMarkStoryViewed(story?.id ?? '');
  const { data: viewers } = useStoryViewers(story?.id ?? '', { enabled: isOwn });

  // Mark each story as viewed as the viewer reaches it. The backend is
  // idempotent — re-views are a 200 no-op — so calling per open is safe.
  useEffect(() => {
    if (!story || story.hasViewed) return;
    markViewed.mutate();
  }, [story?.id, story?.hasViewed]);

  // Auto-advance: an image shows for a fixed window, a video for its own
  // runtime (floored so a very short clip doesn't flash past).
  const advance = useCallback(() => {
    setIndex((current) => {
      if (current >= stories.length - 1) {
        navigation.goBack();
        return current;
      }
      return current + 1;
    });
  }, [stories.length, navigation]);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!story) return;
    const duration =
      story.media.resourceType === 'VIDEO'
        ? Math.max(MIN_VIDEO_STORY_DURATION_MS, story.media.durationMs ?? IMAGE_STORY_DURATION_MS)
        : IMAGE_STORY_DURATION_MS;
    advanceTimer.current = setTimeout(advance, duration);
    return () => {
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
      }
    };
  }, [story?.id, story?.media.resourceType, story?.media.durationMs, advance]);

  // Live view count for the author's own open viewer — a `story:viewed` event
  // for this story refetches the viewer list (a refetch shows the new count
  // without needing a client-side guess).
  useEffect(() => {
    if (!isOwn || !story) return;
    const socket = realtimeClient.connect();
    const handleViewed = (payload: StoryViewedEvent) => {
      if (payload.storyId === story.id && payload.viewerId !== user?.id) {
        void queryClient.invalidateQueries({ queryKey: storyKeys.viewers(story.id) });
      }
    };
    socket.on(REALTIME_EVENTS.STORY_VIEWED, handleViewed);
    return () => {
      socket.off(REALTIME_EVENTS.STORY_VIEWED, handleViewed);
    };
  }, [isOwn, story?.id, user?.id, queryClient]);

  const goPrevious = useCallback(() => {
    setIndex((current) => (current <= 0 ? current : current - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((current) => {
      if (current >= stories.length - 1) {
        navigation.goBack();
        return current;
      }
      return current + 1;
    });
  }, [stories.length, navigation]);

  if (!story) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.gone}>
          <Text style={styles.goneText}>This story is no longer available.</Text>
          <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
            <Text style={styles.goneBack}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <View style={styles.progressRow}>
        {stories.map((s, i) => (
          <View key={s.id} style={[styles.progressTrack, i === index && styles.progressActive]}>
            <View style={[styles.progressFill, i < index && styles.progressDone]} />
          </View>
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.headerName}>{displayName}</Text>
        {isOwn && <Text style={styles.headerCount}>{viewers?.items.length ?? 0} views</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close story viewer"
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.mediaWrap}>
        {story.media.resourceType === 'VIDEO' ? (
          <StoryVideo url={story.media.url} key={story.id} />
        ) : (
          <Image source={{ uri: story.media.url }} style={styles.media} resizeMode="cover" />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous story"
        onPress={goPrevious}
        style={[styles.tapZone, styles.tapLeft]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Close stories' : 'Next story'}
        onPress={goNext}
        style={[styles.tapZone, styles.tapRight]}
      />

      {story.caption ? (
        <View style={styles.captionOverlay}>
          <Text style={styles.caption}>{story.caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StoryVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={styles.media} contentFit="cover" nativeControls />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobabDeep,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(233, 220, 200, 0.25)',
    overflow: 'hidden',
  },
  progressActive: {
    backgroundColor: colors.kenteGold,
  },
  progressDone: {
    backgroundColor: colors.kenteGold,
    opacity: 0.6,
  },
  progressFill: {
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  headerName: {
    color: colors.savanna,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  headerCount: {
    color: colors.kenteGoldSoft,
    fontSize: 13,
  },
  closeButton: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
  },
  closeText: {
    color: colors.savanna,
    fontSize: 18,
    fontWeight: '700',
  },
  mediaWrap: {
    flex: 1,
    marginTop: spacing.md,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  tapZone: {
    position: 'absolute',
    top: '20%',
    bottom: '20%',
    width: '50%',
  },
  tapLeft: {
    left: 0,
  },
  tapRight: {
    right: 0,
  },
  captionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  caption: {
    color: colors.savanna,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textShadowColor: colors.baobabDeep,
    textShadowRadius: 6,
  },
  gone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  goneText: {
    color: colors.savannaMuted,
    fontSize: 15,
  },
  goneBack: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
  },
});
