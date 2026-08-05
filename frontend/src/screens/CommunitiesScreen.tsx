import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCommunities } from '../hooks/useCommunities';
import { useGroups } from '../hooks/useGroups';
import { apiErrorMessage } from '../api/client';
import type { Community } from '../api/communities';
import type { Group } from '../api/groups';
import type { AppStackParamList, MainTabsParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Communities'>,
  NativeStackScreenProps<AppStackParamList>
>;

export function CommunitiesScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading, isError, error, refetch } = useCommunities({
    q: submitted || undefined,
    page: 1,
    pageSize: 50,
  });

  function handleSubmit() {
    setSubmitted(query.trim());
  }

  function openCommunity(community: Community) {
    navigation.navigate('CommunityDetail', { identifier: community.slug });
  }

  function renderItem({ item }: { item: Community }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        onPress={() => openCommunity(item)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.avatar}>
          {item.avatar ? null : (
            <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.description || 'No description'}
          </Text>
          <Text style={styles.cardCount}>
            {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Communities</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            placeholder="Search communities…"
            placeholderTextColor={colors.savannaMuted}
            style={styles.searchInput}
            accessibilityLabel="Search communities"
          />
          <Pressable accessibilityRole="button" onPress={handleSubmit} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('CreateCommunity')}
          style={styles.createLink}
        >
          <Text style={styles.createLinkText}>+ Create a community</Text>
        </Pressable>

        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<GroupsSection navigation={navigation} />}
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
              <Text style={styles.empty}>
                {submitted
                  ? 'No communities match your search.'
                  : 'No communities yet — create the first one.'}
              </Text>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function GroupsSection({ navigation }: { navigation: Props['navigation'] }) {
  const { data: groups, isLoading, isError, refetch } = useGroups();

  return (
    <View style={styles.groupsSection}>
      <View style={styles.groupsHeaderRow}>
        <Text style={styles.groupsTitle}>Group chats</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a group"
          onPress={() => navigation.navigate('CreateGroup')}
        >
          <Text style={styles.groupsCreate}>+ New group</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={styles.muted}>Loading groups…</Text>
      ) : isError ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text style={styles.muted}>Could not load groups. Tap to retry.</Text>
        </Pressable>
      ) : groups && groups.length > 0 ? (
        groups.map((group: Group) => (
          <Pressable
            key={group.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${group.name}`}
            onPress={() =>
              navigation.navigate('GroupChat', { groupId: group.id, name: group.name })
            }
            style={styles.groupRow}
          >
            <View style={styles.groupAvatar}>
              <Text style={styles.groupAvatarText}>{initials(group.name)}</Text>
            </View>
            <View style={styles.groupInfo}>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.groupSub}>
                {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                {group.role === 'OWNER' ? ' · Owner' : ''}
              </Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text style={styles.muted}>No groups yet. Create one to start chatting.</Text>
      )}
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobab,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
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
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.savanna,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: colors.kenteGold,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.baobab,
    fontSize: 15,
    fontWeight: '700',
  },
  createLink: {
    alignSelf: 'flex-start',
  },
  createLinkText: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
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
  groupsSection: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  groupsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupsTitle: {
    color: colors.savanna,
    fontSize: 17,
    fontWeight: '700',
  },
  groupsCreate: {
    color: colors.kenteGold,
    fontSize: 14,
    fontWeight: '600',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarText: {
    color: colors.kenteGold,
    fontWeight: '700',
    fontSize: 16,
  },
  groupInfo: { flex: 1 },
  groupName: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '600',
  },
  groupSub: {
    color: colors.savannaMuted,
    fontSize: 13,
    marginTop: 2,
  },
  muted: { color: colors.savannaMuted, fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    borderWidth: 1,
    borderColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.kenteGold,
    fontSize: 20,
    fontWeight: '800',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  cardName: {
    color: colors.savanna,
    fontSize: 17,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  cardCount: {
    color: colors.kenteGoldSoft,
    fontSize: 12,
  },
});
