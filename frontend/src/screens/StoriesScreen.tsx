import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useStoryFeed, storyKeys } from '../hooks/useStories';
import { apiErrorMessage } from '../api/client';
import { realtimeClient, REALTIME_EVENTS } from '../realtime/client';
import { useAuth } from '../auth/AuthContext';
import type { StoryFeedItem } from '../api/stories';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Stories'>;

export function StoriesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useStoryFeed();

  // The feed is global, so a new or deleted story refreshes every client's
  // tray. No room join is needed (the backend broadcasts to all sockets).
  useEffect(() => {
    const socket = realtimeClient.connect();
    const handleRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.feed() });
    };
    socket.on(REALTIME_EVENTS.STORY_NEW, handleRefresh);
    socket.on(REALTIME_EVENTS.STORY_DELETED, handleRefresh);
    return () => {
      socket.off(REALTIME_EVENTS.STORY_NEW, handleRefresh);
      socket.off(REALTIME_EVENTS.STORY_DELETED, handleRefresh);
    };
  }, [queryClient]);

  function openRing(item: StoryFeedItem) {
    if (item.author.id === user?.id) {
      navigation.navigate('CreateStory');
      return;
    }
    navigation.navigate('StoryViewer', {
      authorId: item.author.id,
      displayName: item.author.displayName,
    });
  }

  const items = data?.items ?? [];

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

        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Stories</Text>

        <FlatList
          data={items}
          keyExtractor={(item) => item.author.id}
          renderItem={({ item }) => (
            <StoryRing
              item={item}
              isOwn={item.author.id === user?.id}
              onPress={() => openRing(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a story"
              onPress={() => navigation.navigate('CreateStory')}
              style={styles.createCard}
            >
              <View style={styles.createPlus}>
                <Text style={styles.createPlusText}>+</Text>
              </View>
              <Text style={styles.createLabel}>Share a moment</Text>
            </Pressable>
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
            ) : isError ? (
              <View style={styles.stateBox}>
                <Text style={styles.error}>{apiErrorMessage(error)}</Text>
                <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.empty}>No stories yet — share the first one.</Text>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function StoryRing({
  item,
  isOwn,
  onPress,
}: {
  item: StoryFeedItem;
  isOwn: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${item.author.displayName}'s stories`}
      onPress={onPress}
      style={({ pressed }) => [styles.ring, pressed && styles.ringPressed]}
    >
      <View style={styles.ringAvatarWrap}>
        {item.author.avatarUrl ? (
          <Image source={{ uri: item.author.avatarUrl }} style={styles.ringAvatar} />
        ) : (
          <View style={styles.ringAvatarFallback}>
            <Text style={styles.ringAvatarInitial}>
              {item.author.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.ringBody}>
        <Text style={styles.ringName}>
          {item.author.displayName}
          {isOwn ? ' (you)' : ''}
        </Text>
        <Text style={styles.ringCount}>
          {item.stories.length} {item.stories.length === 1 ? 'story' : 'stories'}
        </Text>
      </View>
      <Text style={styles.ringArrow}>›</Text>
    </Pressable>
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
  eyebrow: {
    color: colors.kenteGold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
  },
  title: {
    color: colors.savanna,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  createPlus: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlusText: {
    color: colors.kenteGold,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
  createLabel: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '700',
  },
  ring: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ringPressed: {
    opacity: 0.7,
  },
  ringAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
  },
  ringAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAvatarInitial: {
    color: colors.kenteGold,
    fontSize: 20,
    fontWeight: '800',
  },
  ringBody: {
    flex: 1,
    gap: spacing.xs,
  },
  ringName: {
    color: colors.savanna,
    fontSize: 17,
    fontWeight: '700',
  },
  ringCount: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  ringArrow: {
    color: colors.kenteGold,
    fontSize: 22,
    fontWeight: '700',
  },
  loader: {
    marginTop: spacing.xxl,
  },
  stateBox: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
  retryText: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    color: colors.savannaMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: 0,
  },
});
