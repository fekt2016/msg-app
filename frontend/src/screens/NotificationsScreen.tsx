import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsFeed,
  useUnreadNotificationCount,
} from '../hooks/useNotifications';
import type { AppNotification, NotificationType } from '../api/notifications';
import type { AppStackParamList, MainTabsParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Notifications'>,
  NativeStackScreenProps<AppStackParamList>
>;

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_ICONS: Record<NotificationType, IconName> = {
  'chat:message': 'chatbubble-ellipses',
  'community:role': 'shield-checkmark',
  'group:member:joined': 'person-add',
  'group:member:left': 'person-remove',
  'channel:post:new': 'megaphone',
  'channel:request:approved': 'checkmark-circle',
  'story:liked': 'heart',
};

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useNotificationsFeed();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.pages.flatMap((page) => page.items) ?? [];

  function openTarget(notification: AppNotification) {
    const d = notification.data;
    switch (notification.type) {
      case 'chat:message':
        if (d.senderId) {
          navigation.navigate('Chat', {
            userId: d.senderId,
            displayName: d.senderName ?? '',
          });
        }
        return;
      case 'community:role':
        if (d.identifier) {
          navigation.navigate('CommunityDetail', { identifier: d.identifier });
        }
        return;
      case 'channel:post:new':
      case 'channel:request:approved':
        if (d.identifier) {
          navigation.navigate('ChannelDetail', { identifier: d.identifier });
        }
        return;
      case 'group:member:joined':
        if (d.groupId) {
          navigation.navigate('GroupChat', { groupId: d.groupId, name: d.groupName ?? '' });
        }
        return;
      case 'story:liked':
        if (d.authorId) {
          navigation.navigate('StoryViewer', {
            authorId: d.authorId,
            displayName: d.authorDisplayName ?? '',
          });
        }
        return;
      case 'group:member:left':
        return;
    }
  }

  function handlePress(notification: AppNotification) {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    openTarget(notification);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {(unreadCount ?? 0) > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <Text style={styles.muted}>Loading notifications…</Text>
      ) : isError ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text style={styles.muted}>Could not load notifications. Tap to retry.</Text>
        </Pressable>
      ) : notifications.length > 0 ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationRow notification={item} onPress={() => handlePress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              void fetchNextPage();
            }
          }}
          ListFooterComponent={
            isFetchingNextPage ? <Text style={styles.muted}>Loading more…</Text> : null
          }
        />
      ) : (
        <Text style={styles.muted}>
          No notifications yet. Activity from your chats, communities, groups, channels and stories
          shows up here.
        </Text>
      )}
    </SafeAreaView>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  const unread = !notification.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={TYPE_ICONS[notification.type]} size={20} color={colors.kenteGold} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(notification.createdAt)}</Text>
        </View>
        <Text style={styles.rowText} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
      {unread && <View style={styles.unreadDot} accessibilityLabel="Unread" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.baobab },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: { color: colors.savanna, fontSize: 18, fontWeight: '700' },
  markAll: { color: colors.kenteGold, fontSize: 14, fontWeight: '700' },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { flex: 1, color: colors.savanna, fontSize: 15, fontWeight: '600' },
  rowTitleUnread: { fontWeight: '800' },
  rowTime: { color: colors.savannaMuted, fontSize: 12 },
  rowText: { color: colors.savannaMuted, fontSize: 14, marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.kenteGold,
  },
  separator: { height: 1, backgroundColor: colors.inputBorder },
  muted: {
    color: colors.savannaMuted,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
