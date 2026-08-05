import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { useChatUsers } from '../hooks/useChatUsers';
import { useMatchContacts } from '../hooks/useMatchContacts';
import {
  requestContactsPermission,
  readContactPhones,
  extractPhoneNumbers,
} from '../contacts/contacts';
import type { SafeUser } from '../api/auth';
import type { AppStackParamList, MainTabsParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, 'Home'>,
  NativeStackScreenProps<AppStackParamList>
>;

type ContactsState =
  | { status: 'idle' }
  | { status: 'denied' }
  | { status: 'loading' }
  | { status: 'matched'; matches: SafeUser[] }
  | { status: 'error'; message: string };

export function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { connected, onlineUserIds } = useRealtime();
  const { data: chatUsers, isLoading, isError, refetch } = useChatUsers();
  const matchContacts = useMatchContacts();
  const [contactsState, setContactsState] = useState<ContactsState>({ status: 'idle' });

  async function handleFindFromContacts() {
    if (matchContacts.isPending) return;

    const granted = await requestContactsPermission();
    if (!granted) {
      setContactsState({ status: 'denied' });
      return;
    }

    setContactsState({ status: 'loading' });
    try {
      const contacts = await readContactPhones();
      const matches = await matchContacts.mutateAsync(extractPhoneNumbers(contacts));
      setContactsState({ status: 'matched', matches });
    } catch (err) {
      setContactsState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not match your contacts.',
      });
    }
  }

  const contactMatches = contactsState.status === 'matched' ? contactsState.matches : [];

  const listUsers = contactMatches.length > 0 ? contactMatches : chatUsers;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Hello, {user?.displayName ?? 'friend'}.</Text>
        <Text style={styles.subtitle}>Start a chat with someone in your community.</Text>

        <View style={styles.realtimeRow} accessibilityLabel="Realtime status">
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? colors.kenteGold : colors.terracotta },
            ]}
          />
          <Text style={styles.realtimeText}>
            {connected ? `Connected · ${onlineUserIds.length} online` : 'Connecting…'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleFindFromContacts()}
          style={styles.contactsButton}
          disabled={matchContacts.isPending}
        >
          <Text style={styles.contactsButtonText}>
            {matchContacts.isPending ? 'Matching your contacts…' : 'Find friends from contacts'}
          </Text>
        </Pressable>

        {contactsState.status === 'denied' && (
          <Text style={styles.contactsHint}>
            Contacts access was denied. Allow it in your device settings to find friends.
          </Text>
        )}
        {contactsState.status === 'error' && (
          <Text style={styles.contactsHint}>{contactsState.message}</Text>
        )}
        {contactsState.status === 'matched' && contactMatches.length === 0 && (
          <Text style={styles.contactsHint}>
            No friends from your contacts are on Eaz Community yet.
          </Text>
        )}

        <Text style={styles.sectionLabel}>People to chat with</Text>

        {isLoading ? (
          <Text style={styles.muted}>Loading users…</Text>
        ) : isError ? (
          <Pressable accessibilityRole="button" onPress={() => void refetch()}>
            <Text style={styles.muted}>Could not load users. Tap to retry.</Text>
          </Pressable>
        ) : listUsers && listUsers.length > 0 ? (
          <FlatList
            data={listUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatUserRow
                user={item}
                online={onlineUserIds.includes(item.id)}
                onPress={() =>
                  navigation.navigate('Chat', { userId: item.id, displayName: item.displayName })
                }
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <Text style={styles.muted}>No other users yet. Invite a friend to join.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function ChatUserRow({
  user,
  online,
  onPress,
}: {
  user: SafeUser;
  online: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.userRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.displayName}</Text>
      </View>
      <View
        style={[
          styles.onlineDot,
          { backgroundColor: online ? colors.kenteGold : colors.savannaMuted },
        ]}
      />
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
    paddingTop: spacing.xxl,
  },
  eyebrow: {
    color: colors.kenteGold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
  },
  title: {
    color: colors.savanna,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.savannaMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.xs,
  },
  realtimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  realtimeText: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
  sectionLabel: {
    color: colors.savanna,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  contactsButton: {
    marginTop: spacing.md,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  contactsButtonText: {
    color: colors.kenteGold,
    fontSize: 14,
    fontWeight: '700',
  },
  contactsHint: {
    color: colors.savannaMuted,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  listContent: {
    gap: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.baobabDeep,
    fontSize: 18,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.savanna,
    fontSize: 16,
    fontWeight: '600',
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  separator: {
    height: 1,
    backgroundColor: colors.inputBorder,
  },
  muted: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
});
