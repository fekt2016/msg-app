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
  BottomTabScreenProps<MainTabsParamList, 'Chats'>,
  NativeStackScreenProps<AppStackParamList>
>;

type ContactsState =
  | { status: 'idle' }
  | { status: 'denied' }
  | { status: 'loading' }
  | { status: 'matched'; matches: SafeUser[] }
  | { status: 'error'; message: string };

export function ChatsScreen({ navigation }: Props) {
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
  const allPeers = (chatUsers ?? []).filter((item) => item.id !== user?.id);
  const peers = contactMatches.length > 0 ? contactMatches : allPeers;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>

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

      {isLoading ? (
        <Text style={styles.muted}>Loading chats…</Text>
      ) : isError ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text style={styles.muted}>Could not load chats. Tap to retry.</Text>
        </Pressable>
      ) : peers.length > 0 ? (
        <FlatList
          data={peers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatRow
              user={item}
              online={onlineUserIds.includes(item.id)}
              onPress={() =>
                navigation.navigate('Chat', {
                  userId: item.id,
                  displayName: item.displayName,
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <Text style={styles.muted}>
          No people to chat with yet. Tap “Find friends from contacts” above.
        </Text>
      )}
    </SafeAreaView>
  );
}

function ChatRow({
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
  safe: { flex: 1, backgroundColor: colors.baobab },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: { color: colors.savanna, fontSize: 18, fontWeight: '700' },
  realtimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  realtimeText: { color: colors.savannaMuted, fontSize: 14 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
    borderRadius: radius.full,
    backgroundColor: colors.kenteGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.baobabDeep, fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { color: colors.savanna, fontSize: 16, fontWeight: '600' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  separator: { height: 1, backgroundColor: colors.inputBorder },
  muted: {
    color: colors.savannaMuted,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  contactsButton: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
