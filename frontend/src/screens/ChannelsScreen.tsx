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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useChannels, useMyChannels } from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import type { ChannelWithSubscription } from '../api/channels';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Channels'>;

export function ChannelsScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data: mine } = useMyChannels();
  const { data, isLoading, isError, error, refetch } = useChannels({
    q: submitted || undefined,
    page: 1,
    pageSize: 50,
  });

  function handleSubmit() {
    setSubmitted(query.trim());
  }

  function openChannel(channel: ChannelWithSubscription) {
    navigation.navigate('ChannelDetail', { identifier: channel.slug });
  }

  function renderItem({ item }: { item: ChannelWithSubscription }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        onPress={() => openChannel(item)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.description || 'No description'}
          </Text>
          <Text style={styles.cardCount}>
            {item.subscriberCount} {item.subscriberCount === 1 ? 'subscriber' : 'subscribers'} ·{' '}
            {item.visibility === 'PUBLIC' ? 'Public' : 'Private'}
          </Text>
        </View>
      </Pressable>
    );
  }

  const myChannels = mine?.items ?? [];

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
        <Text style={styles.title}>Channels</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            placeholder="Search channels…"
            placeholderTextColor={colors.savannaMuted}
            style={styles.searchInput}
            accessibilityLabel="Search channels"
          />
          <Pressable accessibilityRole="button" onPress={handleSubmit} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('CreateChannel')}
          style={styles.createLink}
        >
          <Text style={styles.createLinkText}>+ Create a channel</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('InviteJoin')}
          style={styles.createLink}
        >
          <Text style={styles.createLinkText}>Have an invite? Join with a token</Text>
        </Pressable>

        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<MyChannelsSection channels={myChannels} onOpen={openChannel} />}
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
                  ? 'No channels match your search.'
                  : 'No public channels yet — create the first one.'}
              </Text>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function MyChannelsSection({
  channels,
  onOpen,
}: {
  channels: ChannelWithSubscription[];
  onOpen: (channel: ChannelWithSubscription) => void;
}) {
  if (channels.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>My channels</Text>
      {channels.map((channel) => (
        <Pressable
          key={channel.id}
          accessibilityRole="button"
          accessibilityLabel={`Open my channel ${channel.name}`}
          onPress={() => onOpen(channel)}
          style={({ pressed }) => [styles.row, pressed && styles.cardPressed]}
        >
          <View style={styles.rowAvatar}>
            <Text style={styles.rowAvatarText}>{channel.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.rowName}>{channel.name}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {channel.subscriberCount}{' '}
              {channel.subscriberCount === 1 ? 'subscriber' : 'subscribers'}
              {channel.role === 'OWNER' || channel.role === 'ADMIN' ? ` · ${channel.role}` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
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
  section: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    color: colors.savanna,
    fontSize: 17,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: {
    color: colors.kenteGold,
    fontWeight: '700',
    fontSize: 16,
  },
  rowName: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '600',
  },
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
