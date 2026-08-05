import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCommunity,
  useJoinCommunity,
  useLeaveCommunity,
  useCommunityMembers,
  useUpdateMemberRole,
  communityKeys,
} from '../hooks/useCommunities';
import { apiErrorMessage } from '../api/client';
import { realtimeClient, REALTIME_EVENTS, type CommunityMemberEvent } from '../realtime/client';
import { Button } from '../components/Button';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'CommunityDetail'>;

export function CommunityDetailScreen({ route, navigation }: Props) {
  const { identifier } = route.params;
  const queryClient = useQueryClient();
  const { data: community, isLoading, isError, error } = useCommunity(identifier);
  const { data: members } = useCommunityMembers(identifier, { page: 1, pageSize: 20 });
  const join = useJoinCommunity(identifier);
  const leave = useLeaveCommunity(identifier);
  const updateRole = useUpdateMemberRole(identifier);

  const communityId = community?.id;

  // Keep this community's detail + member list fresh when its membership
  // changes. The backend delivers these events to the affected user's own
  // room, so this reflects the current user's join/leave/role changes (incl.
  // ones made on another device or by a moderator) without a manual refresh.
  useEffect(() => {
    if (!communityId) return;
    const socket = realtimeClient.connect();

    const handleMembershipChange = (payload: CommunityMemberEvent) => {
      if (payload.communityId !== communityId) return;
      // Only this screen's queries — invalidating communityKeys.all would also
      // match these two by prefix and double-refetch them. The browse list
      // isn't mounted here and refetches on its own when reopened.
      void queryClient.invalidateQueries({ queryKey: communityKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.members(identifier) });
    };

    socket.on(REALTIME_EVENTS.COMMUNITY_MEMBER_JOINED, handleMembershipChange);
    socket.on(REALTIME_EVENTS.COMMUNITY_MEMBER_LEFT, handleMembershipChange);
    socket.on(REALTIME_EVENTS.COMMUNITY_MEMBER_ROLE, handleMembershipChange);

    return () => {
      socket.off(REALTIME_EVENTS.COMMUNITY_MEMBER_JOINED, handleMembershipChange);
      socket.off(REALTIME_EVENTS.COMMUNITY_MEMBER_LEFT, handleMembershipChange);
      socket.off(REALTIME_EVENTS.COMMUNITY_MEMBER_ROLE, handleMembershipChange);
    };
  }, [communityId, identifier, queryClient]);

  const isOwner = community?.role === 'OWNER';
  const canManage = community?.role === 'OWNER' || community?.role === 'MODERATOR';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.kenteGold} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (isError || !community) {
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

  const mutationError = join.error ?? leave.error ?? updateRole.error;

  async function handleToggleMembership() {
    if (!community) return;
    if (community.isMember) {
      await leave.mutateAsync();
    } else {
      await join.mutateAsync();
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
            <Text style={styles.avatarInitial}>{community.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerBody}>
            <Text style={styles.title}>{community.name}</Text>
            <Text style={styles.meta}>
              {community.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {community.memberCount}{' '}
              {community.memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>

        {community.description ? (
          <Text style={styles.description}>{community.description}</Text>
        ) : null}

        {mutationError ? <Text style={styles.error}>{apiErrorMessage(mutationError)}</Text> : null}

        <Button
          onPress={() => void handleToggleMembership()}
          loading={join.isPending || leave.isPending}
          variant={community.isMember ? 'secondary' : 'primary'}
        >
          {community.isMember ? 'Leave community' : 'Join community'}
        </Button>

        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('CreateCommunity', { identifier: community.slug })}
            style={styles.link}
          >
            <Text style={styles.linkText}>Edit community</Text>
          </Pressable>
        ) : null}
        {canManage ? (
          <Text style={styles.roleBadge}>
            You are {community.role === 'OWNER' ? 'the owner' : 'a moderator'}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Members</Text>
        {members?.items.length ? (
          members.items.map((member) => {
            const canManageMember = canManage && member.role !== 'OWNER';
            const promote = member.role === 'MEMBER';
            return (
              <View key={member.userId} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.memberName}>{member.displayName}</Text>
                <Text style={styles.memberRole}>{member.role.toLowerCase()}</Text>
                {canManageMember ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${promote ? 'Make' : 'Remove'} moderator: ${member.displayName}`}
                    disabled={updateRole.isPending}
                    onPress={() =>
                      updateRole.mutate({
                        userId: member.userId,
                        role: promote ? 'MODERATOR' : 'MEMBER',
                      })
                    }
                    style={({ pressed }) => [
                      styles.roleAction,
                      pressed && styles.roleActionPressed,
                    ]}
                  >
                    <Text style={styles.roleActionText}>{promote ? 'Make mod' : 'Remove mod'}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.empty}>No members yet.</Text>
        )}
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
  loader: {
    marginTop: spacing.xxl,
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
  link: {
    alignSelf: 'flex-start',
  },
  linkText: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
  },
  roleBadge: {
    color: colors.kenteGoldSoft,
    fontSize: 13,
    fontStyle: 'italic',
  },
  sectionTitle: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inputBorder,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    color: colors.kenteGold,
    fontSize: 14,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    color: colors.savanna,
    fontSize: 15,
  },
  memberRole: {
    color: colors.savannaMuted,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  roleAction: {
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  roleActionPressed: {
    opacity: 0.6,
  },
  roleActionText: {
    color: colors.kenteGold,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
