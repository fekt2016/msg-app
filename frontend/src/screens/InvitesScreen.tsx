import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { copyToClipboard } from '../utils/clipboard';
import { buildInviteUrl } from '../utils/inviteLink';
import { useChannelInvites, useCreateInvite, useRevokeInvite } from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import type { ChannelInvite } from '../api/channels';
import type { AppStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Invites'>;

export function InvitesScreen({ route, navigation }: Props) {
  const { identifier } = route.params;
  const { data, isLoading, isError, refetch } = useChannelInvites(identifier);
  const createInvite = useCreateInvite(identifier);
  const revoke = useRevokeInvite(identifier);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    const result = await createInvite.mutateAsync({ role: 'SUBSCRIBER' });
    setCreatedToken(result.token);
    setCopied(false);
    setCopied(await copyToClipboard(buildInviteUrl(result.token)));
  }

  async function handleCopy() {
    if (!createdToken) return;
    setCopied(await copyToClipboard(buildInviteUrl(createdToken)));
  }

  function renderItem({ item }: { item: ChannelInvite }) {
    return (
      <View style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.role}>{item.role}</Text>
          <Text style={styles.meta}>
            {item.maxUses === 1 ? 'Single use' : `Up to ${item.maxUses} uses`} · expires{' '}
            {new Date(item.expiresAt).toLocaleDateString()}
          </Text>
          {item.usedCount > 0 ? (
            <Text style={styles.meta}>
              Used {item.usedCount} {item.usedCount === 1 ? 'time' : 'times'}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Revoke invite for ${item.role}`}
          disabled={revoke.isPending}
          onPress={() => revoke.mutate(item.id)}
          style={({ pressed }) => [styles.action, styles.revoke, pressed && styles.pressed]}
        >
          <Text style={styles.revokeText}>Revoke</Text>
        </Pressable>
      </View>
    );
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

        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Invites</Text>
        <Text style={styles.subtitle}>
          Create an invite link and share it with someone to let them join this private channel.
        </Text>

        <Button onPress={() => void handleCreate()} loading={createInvite.isPending}>
          Create invite link
        </Button>

        {createdToken ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy invite link"
            onPress={() => void handleCopy()}
            style={({ pressed }) => [styles.tokenBox, pressed && styles.pressed]}
          >
            <Text style={styles.tokenLabel}>Share this invite link</Text>
            <Text style={styles.tokenText} numberOfLines={2}>
              {buildInviteUrl(createdToken)}
            </Text>
            <Text style={styles.copiedText}>{copied ? 'Copied to clipboard' : 'Tap to copy'}</Text>
          </Pressable>
        ) : null}

        {createInvite.error ? (
          <Text style={styles.error}>{apiErrorMessage(createInvite.error)}</Text>
        ) : null}

        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
            ) : isError ? (
              <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                <Text style={styles.empty}>Could not load invites. Tap to retry.</Text>
              </Pressable>
            ) : (
              <Text style={styles.empty}>
                No active invites. Create one above to invite members.
              </Text>
            )
          }
        />
      </View>
    </SafeAreaView>
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
  subtitle: {
    color: colors.savannaMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  loader: {
    marginTop: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inputBorder,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  role: {
    color: colors.savanna,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.savannaMuted,
    fontSize: 12,
  },
  action: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    color: colors.kenteGold,
    fontSize: 13,
    fontWeight: '600',
  },
  revoke: {
    borderColor: colors.terracotta,
  },
  revokeText: {
    color: colors.terracotta,
    fontSize: 13,
    fontWeight: '600',
  },
  tokenBox: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tokenLabel: {
    color: colors.savannaMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tokenText: {
    color: colors.savanna,
    fontSize: 14,
    fontWeight: '600',
  },
  copiedText: {
    color: colors.kenteGold,
    fontSize: 13,
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
