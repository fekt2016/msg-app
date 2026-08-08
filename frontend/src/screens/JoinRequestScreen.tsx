import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useJoinRequests, useDecideJoinRequest } from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import type { JoinRequest } from '../api/channels';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'JoinRequests'>;

export function JoinRequestScreen({ route, navigation }: Props) {
  const { identifier } = route.params;
  const { data, isLoading, isError, refetch } = useJoinRequests(identifier);
  const decide = useDecideJoinRequest(identifier);

  function renderItem({ item }: { item: JoinRequest }) {
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.meta}>Requested to join</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Approve ${item.displayName}`}
          disabled={decide.isPending}
          onPress={() => decide.mutate({ userId: item.userId, action: 'APPROVE' })}
          style={({ pressed }) => [styles.action, styles.approve, pressed && styles.pressed]}
        >
          <Text style={styles.approveText}>Approve</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Deny ${item.displayName}`}
          disabled={decide.isPending}
          onPress={() => decide.mutate({ userId: item.userId, action: 'DENY' })}
          style={({ pressed }) => [styles.action, styles.deny, pressed && styles.pressed]}
        >
          <Text style={styles.denyText}>Deny</Text>
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
        <Text style={styles.title}>Join requests</Text>

        {decide.error ? <Text style={styles.error}>{apiErrorMessage(decide.error)}</Text> : null}

        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
            ) : isError ? (
              <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                <Text style={styles.empty}>Could not load requests. Tap to retry.</Text>
              </Pressable>
            ) : (
              <Text style={styles.empty}>No pending join requests.</Text>
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
  list: {
    gap: spacing.sm,
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.kenteGold,
    fontSize: 16,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  approve: {
    borderColor: colors.kenteGold,
  },
  approveText: {
    color: colors.kenteGold,
    fontSize: 13,
    fontWeight: '600',
  },
  deny: {
    borderColor: colors.terracotta,
  },
  denyText: {
    color: colors.terracotta,
    fontSize: 13,
    fontWeight: '600',
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
