import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import {
  realtimeClient,
  REALTIME_EVENTS,
  type GroupMessageEvent,
  type GroupMemberEvent,
} from '../realtime/client';
import { useGroupMembers, groupKeys } from '../hooks/useGroups';
import {
  ensureOwnSenderKeyDistributed,
  rotateOwnSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from '../e2ee/groupSession';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupChat'>;

interface GroupChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isOwn: boolean;
  decryptFailed?: boolean;
}

export function GroupChatScreen({ route, navigation }: Props) {
  const { groupId, name } = route.params;
  const { user } = useAuth();
  const { connected } = useRealtime();
  const currentUserId = user?.id;
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { data: membersData } = useGroupMembers(groupId);
  const memberIds = useMemo(() => membersData?.items.map((m) => m.userId) ?? [], [membersData]);
  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersData?.items ?? []) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [membersData]);

  // Distribute the caller's sender key to the current roster once it is known,
  // and re-distribute whenever the roster changes (idempotent for existing
  // members, delivering the key to anyone newly added).
  const distributedSigRef = useRef<string>('');
  useEffect(() => {
    if (!currentUserId || memberIds.length === 0) return;
    const sig = [...memberIds].sort().join(',');
    if (sig === distributedSigRef.current) return;
    distributedSigRef.current = sig;
    void ensureOwnSenderKeyDistributed(groupId, memberIds, currentUserId).catch(() => {
      // Most often this is the caller's own key bundle not being ready yet (see
      // ensureE2eeKeysRegistered) — allow a retry on the next roster change
      // rather than latching a permanent failure.
      distributedSigRef.current = '';
      setSessionError('Your group encryption keys are still being set up. Try again in a moment.');
    });
  }, [groupId, memberIds, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    const socket: Socket = realtimeClient.connect();
    socket.emit(REALTIME_EVENTS.GROUP_SUBSCRIBE, { groupId });

    const handleIncoming = (payload: GroupMessageEvent) => {
      if (payload.groupId !== groupId || payload.senderId === currentUserId) return;
      void (async () => {
        let text = '';
        let decryptFailed = false;
        try {
          text = await decryptGroupMessage(
            groupId,
            payload.senderId,
            payload.keyId,
            payload.ciphertext,
            payload.iv,
          );
        } catch {
          decryptFailed = true;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `${payload.senderId}-${payload.timestamp}`,
            senderId: payload.senderId,
            senderName: nameByUser.get(payload.senderId) ?? 'Member',
            text,
            timestamp: payload.timestamp,
            isOwn: false,
            decryptFailed,
          },
        ]);
        socket.emit(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_DELIVERED, {
          groupId,
          timestamp: payload.timestamp,
        });
      })();
    };

    const handleMemberJoined = () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
    };

    const handleMemberLeft = (payload: GroupMemberEvent) => {
      if (payload.groupId !== groupId) return;
      // Rotate our sender key so the departed member cannot read future
      // messages (forward secrecy of the sender-key scheme).
      const remaining = memberIds.filter((id) => id !== payload.userId);
      void rotateOwnSenderKey(groupId, remaining, currentUserId).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
    };

    const handleDeleted = () => {
      navigation.goBack();
    };

    socket.on(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_NEW, handleIncoming);
    socket.on(REALTIME_EVENTS.GROUP_MEMBER_JOINED, handleMemberJoined);
    socket.on(REALTIME_EVENTS.GROUP_MEMBER_LEFT, handleMemberLeft);
    socket.on(REALTIME_EVENTS.GROUP_DELETED, handleDeleted);

    return () => {
      socket.emit(REALTIME_EVENTS.GROUP_UNSUBSCRIBE, { groupId });
      socket.off(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_NEW, handleIncoming);
      socket.off(REALTIME_EVENTS.GROUP_MEMBER_JOINED, handleMemberJoined);
      socket.off(REALTIME_EVENTS.GROUP_MEMBER_LEFT, handleMemberLeft);
      socket.off(REALTIME_EVENTS.GROUP_DELETED, handleDeleted);
    };
  }, [groupId, currentUserId, memberIds, nameByUser, queryClient, navigation]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !currentUserId) return;

    let ciphertext: string;
    let iv: string;
    let keyId: number;
    try {
      ({ ciphertext, iv, keyId } = await encryptGroupMessage(groupId, trimmed));
    } catch {
      setSessionError('Your group encryption keys are still being set up. Try again in a moment.');
      return;
    }
    setSessionError(null);
    const timestamp = Date.now();

    setMessages((prev) => [
      ...prev,
      {
        id: `${currentUserId}-${timestamp}`,
        senderId: currentUserId,
        senderName: 'You',
        text: trimmed,
        timestamp,
        isOwn: true,
      },
    ]);
    setInputText('');

    const socket = realtimeClient.connect();
    socket.emit(REALTIME_EVENTS.CHAT_GROUP_MESSAGE_NEW, {
      groupId,
      keyId,
      ciphertext,
      iv,
      timestamp,
    });
  }, [inputText, currentUserId, groupId]);

  if (!currentUserId) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{name}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? colors.kenteGold : colors.terracotta },
                ]}
              />
              <Text style={styles.statusText}>
                {connected ? `${memberIds.length} members` : 'Connecting…'}
              </Text>
            </View>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => (
            <View
              style={[styles.messageBubble, item.isOwn ? styles.ownBubble : styles.otherBubble]}
            >
              {!item.isOwn && <Text style={styles.senderName}>{item.senderName}</Text>}
              {item.decryptFailed ? (
                <Text style={styles.messageWarning}>⚠ Could not decrypt this message</Text>
              ) : (
                <Text style={styles.messageText}>{item.text}</Text>
              )}
              <Text style={styles.messageTime}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello 👋</Text>}
        />

        {sessionError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{sessionError}</Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={(text) => {
              if (sessionError) setSessionError(null);
              setInputText(text);
            }}
            placeholder="Type a message…"
            placeholderTextColor={colors.savannaMuted}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={() => void handleSend()}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.baobab },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  backButton: { paddingVertical: spacing.xs, paddingRight: spacing.xs },
  backArrow: { color: colors.kenteGold, fontSize: 30, lineHeight: 32, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerTitle: { color: colors.savanna, fontSize: 18, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.savannaMuted, fontSize: 12 },
  messagesList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: colors.kenteGold },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: colors.inputSurface },
  senderName: { color: colors.kenteGold, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  messageText: { color: colors.baobabDeep, fontSize: 15, lineHeight: 20 },
  messageWarning: { color: colors.terracotta, fontSize: 13, fontStyle: 'italic' },
  messageTime: {
    color: colors.savannaMuted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  empty: { color: colors.savannaMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.xl },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.terracotta,
  },
  errorBannerText: { color: colors.terracotta, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.savanna,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.kenteGold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: colors.baobabDeep, fontWeight: '700', fontSize: 14 },
});
