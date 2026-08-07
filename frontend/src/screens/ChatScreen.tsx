import { useState, useCallback, useRef, useEffect } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { useConversationMessages } from '../hooks/useConversationMessages';
import type { StoredMessage } from '../api/messages';
import { realtimeClient, REALTIME_EVENTS, type EncryptedMessageEvent } from '../realtime/client';
import { decryptMessage, buildSharedSecret } from '../e2ee/crypto';
import { isPeerBundleVerified } from '../e2ee/verify';
import { keyStore } from '../e2ee/keyStore';
import { fetchKeyBundle } from '../e2ee/e2eeApi';
import { sendChatDraft, flushOutbox, outboxStore, subscribeToOutbox } from '../e2ee/outbox';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

interface ChatMessage {
  id: string;
  senderId: string;
  /**
   * The text to render: decrypted plaintext, or `null` when this device could
   * not decrypt the message (e.g. the identity key was rotated/regenerated, so
   * the ciphertext is no longer decryptable here). It is NEVER the raw
   * ciphertext — encrypted bytes must not be rendered as if they were the
   * message. A `null` value drives an explicit "can't decrypt" bubble.
   */
  text: string | null;
  timestamp: number;
  isOwn: boolean;
  delivered: boolean;
  read: boolean;
  verificationFailed?: boolean;
  /** True while the draft is held in the on-device outbox awaiting delivery. */
  queued?: boolean;
}

/**
 * Decrypts a persisted message fetched from the history endpoint. ECDH shared
 * secrets are symmetric, so the same secret derived from our identity private
 * key and the peer's identity public key works whether the message is ours or
 * theirs. On any failure `text` is left `null` (mirrors the live incoming path)
 * so the row renders an explicit undecryptable state — never the raw ciphertext.
 */
async function decryptStoredMessage(
  stored: StoredMessage,
  currentUserId: string,
): Promise<ChatMessage | null> {
  const isOwn = stored.senderId === currentUserId;
  const peerId = isOwn ? stored.recipientId : stored.senderId;
  let text: string | null = null;
  let verificationFailed = false;
  try {
    const ourBundle = await keyStore.getKeyBundle();
    const peerBundle = await fetchKeyBundle(peerId);
    if (ourBundle && peerBundle?.identityKey?.publicKey) {
      if (!(await isPeerBundleVerified(peerBundle))) {
        verificationFailed = true;
      } else {
        const sharedSecret = await buildSharedSecret(
          ourBundle.identityKey.privateKey,
          peerBundle.identityKey.publicKey,
        );
        text = await decryptMessage(sharedSecret, stored.ciphertext, stored.iv);
      }
    }
  } catch {
    // Decryption failed (missing/rotated keys) — leave `text` null so the row
    // renders an explicit "can't decrypt" state. Never fall back to showing the
    // raw ciphertext as if it were the message.
  }
  return {
    id: stored.id,
    senderId: stored.senderId,
    text,
    timestamp: stored.timestamp,
    isOwn,
    delivered: true,
    read: true,
    verificationFailed,
  };
}

function StatusTicks({
  delivered,
  read,
  queued,
}: {
  delivered: boolean;
  read: boolean;
  queued?: boolean;
}) {
  if (queued) {
    return <Text style={styles.statusTicks}>Pending…</Text>;
  }
  if (read) {
    return <Text style={styles.statusTicksRead}>✓✓</Text>;
  }
  if (delivered) {
    return <Text style={styles.statusTicks}>✓✓</Text>;
  }
  return <Text style={styles.statusTicks}>✓</Text>;
}

export function ChatScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const { userId, displayName } = route.params;
  const currentUserId = user?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
  } = useConversationMessages(userId);

  useEffect(() => {
    if (!currentUserId || !history || history.items.length === 0) return;

    let cancelled = false;
    void (async () => {
      // Endpoint returns newest-first; reverse for chronological render order.
      const decrypted = await Promise.all(
        history.items.map((stored) =>
          decryptStoredMessage(stored, currentUserId).catch(() => null),
        ),
      );
      if (cancelled) return;
      const loaded = (
        decrypted.filter((m): m is ChatMessage => m !== null) as ChatMessage[]
      ).reverse();
      if (loaded.length === 0) return;
      setMessages((prev) => {
        // A live message that arrived while history was fetching is already in
        // state (its id is `${senderId}-${timestamp}`) — don't duplicate it.
        const fresh = loaded.filter(
          (m) =>
            !prev.some(
              (existing) => existing.senderId === m.senderId && existing.timestamp === m.timestamp,
            ),
        );
        if (fresh.length === 0) return prev;
        // Merge on every history update (e.g. a fresh refetch after re-entering
        // the screen) — the dedup above keeps re-merges idempotent. Sort so a
        // new history item newer than a live message still renders in order.
        return [...fresh, ...prev].sort((a, b) => a.timestamp - b.timestamp);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [history, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    const socket: Socket = realtimeClient.connect();

    const handleIncoming = (payload: EncryptedMessageEvent) => {
      void (async () => {
        // The recipient's user room receives every incoming message; only
        // append (and ack) the ones belonging to the conversation on screen.
        // `userId` is the peer for this thread, so this also drops self-echoes.
        if (payload.senderId !== userId) return;

        let text: string | null = null;
        let verificationFailed = false;
        try {
          const ourBundle = await keyStore.getKeyBundle();
          const senderBundle = await fetchKeyBundle(payload.senderId);
          if (ourBundle && senderBundle?.identityKey?.publicKey) {
            // B-1: authenticate the sender's bundle before trusting its keys.
            if (!(await isPeerBundleVerified(senderBundle))) {
              verificationFailed = true;
            } else {
              const sharedSecret = await buildSharedSecret(
                ourBundle.identityKey.privateKey,
                senderBundle.identityKey.publicKey,
              );
              text = await decryptMessage(sharedSecret, payload.ciphertext, payload.iv);
            }
          }
        } catch {
          // Decryption failed — leave `text` null so the bubble shows an explicit
          // "can't decrypt" state, never the raw ciphertext.
        }

        const incoming: ChatMessage = {
          id: `${payload.senderId}-${payload.timestamp}`,
          senderId: payload.senderId,
          text,
          timestamp: payload.timestamp,
          isOwn: false,
          delivered: true,
          read: true,
          verificationFailed,
        };

        setMessages((prev) =>
          prev.some(
            (existing) =>
              existing.senderId === incoming.senderId && existing.timestamp === incoming.timestamp,
          )
            ? prev
            : [...prev, incoming],
        );

        socket.emit(REALTIME_EVENTS.CHAT_MESSAGE_DELIVERED, {
          senderId: payload.senderId,
          timestamp: payload.timestamp,
        });
        socket.emit(REALTIME_EVENTS.CHAT_MESSAGE_READ, {
          senderId: payload.senderId,
          timestamp: payload.timestamp,
        });
      })();
    };

    const handleDelivered = (payload: { recipientId: string; timestamp: number }) => {
      if (payload.recipientId !== userId) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.isOwn && msg.timestamp === payload.timestamp ? { ...msg, delivered: true } : msg,
        ),
      );
    };

    const handleRead = (payload: { recipientId: string; timestamp: number }) => {
      if (payload.recipientId !== userId) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.isOwn && msg.timestamp === payload.timestamp
            ? { ...msg, delivered: true, read: true }
            : msg,
        ),
      );
    };

    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_NEW, handleIncoming);
    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_DELIVERED, handleDelivered);
    socket.on(REALTIME_EVENTS.CHAT_MESSAGE_READ, handleRead);

    return () => {
      socket.off(REALTIME_EVENTS.CHAT_MESSAGE_NEW, handleIncoming);
      socket.off(REALTIME_EVENTS.CHAT_MESSAGE_DELIVERED, handleDelivered);
      socket.off(REALTIME_EVENTS.CHAT_MESSAGE_READ, handleRead);
    };
  }, [currentUserId, userId]);

  // Load this conversation's pending drafts from the on-device outbox so a
  // message queued earlier (contact had no keys / we were offline) still shows
  // in the thread, then retry sending them.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    void (async () => {
      const pending = await outboxStore.list();
      if (cancelled) return;
      const mine = pending.filter((m) => m.recipientId === userId && m.senderId === currentUserId);
      if (mine.length === 0) return;
      const queued: ChatMessage[] = mine.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        text: m.text,
        timestamp: m.timestamp,
        isOwn: true,
        delivered: false,
        read: false,
        queued: true,
      }));
      setMessages((prev) => {
        const fresh = queued.filter(
          (q) =>
            !prev.some((existing) => existing.id === q.id || existing.timestamp === q.timestamp),
        );
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort((a, b) => a.timestamp - b.timestamp);
      });
      void flushOutbox(currentUserId);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, currentUserId]);

  // When the socket reconnects, retry any drafts still in the outbox — the
  // recipient's keys may have been published while we were away.
  useEffect(() => {
    if (!connected || !currentUserId) return;
    void flushOutbox(currentUserId);
  }, [connected, currentUserId]);

  // Reflect outbox deliveries in the thread: when a flush finally sends a
  // queued draft, flip its bubble from "Pending…" to sent.
  useEffect(() => {
    if (!currentUserId) return;
    return subscribeToOutbox(({ sentIds }) => {
      if (sentIds.length === 0) return;
      setMessages((prev) =>
        prev.map((m) => (sentIds.includes(m.id) ? { ...m, queued: false } : m)),
      );
    });
  }, [currentUserId]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (!currentUserId) return;

    const timestamp = Date.now();
    const messageId = `${currentUserId}-${timestamp}`;
    const optimistic: ChatMessage = {
      id: messageId,
      senderId: currentUserId,
      // Show the readable text we just typed in our own bubble; the encrypted
      // body is what goes over the wire, never displayed to us. Mirrors the
      // incoming path, which stores decrypted plaintext in `text` too.
      text,
      timestamp,
      isOwn: true,
      delivered: false,
      read: false,
      queued: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInputText('');

    const socket = realtimeClient.connect();
    const result = await sendChatDraft({
      senderId: currentUserId,
      recipientId: userId,
      text,
      timestamp,
      socket,
    });

    if (result.ok) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, queued: false } : m)));
      // A fresh send means we are reachable again — drain anything else pending.
      void flushOutbox(currentUserId);
      return;
    }

    if (result.reason === 'VERIFICATION_FAILED') {
      // Security refusal — never queue plaintext for a recipient whose bundle
      // could not be authenticated (possible MITM / tampered directory entry).
      // Drop the optimistic bubble and restore the draft so the user can retry.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setInputText(text);
      setKeyError("Could not verify this contact's encryption keys. Message not sent.");
      return;
    }

    // KEYS_NOT_READY / NO_KEYS / SEND_FAILED — persist the draft in the
    // on-device outbox (plaintext never leaves this device) and let a later
    // flush deliver it once the keys or connection are back.
    await outboxStore.enqueue({
      id: messageId,
      senderId: currentUserId,
      recipientId: userId,
      text,
      timestamp,
      queuedAt: timestamp,
    });
    setKeyError(
      result.reason === 'SEND_FAILED'
        ? 'Message queued — will send when you are back online.'
        : 'Message queued — will send once this contact sets up encryption.',
    );
    void flushOutbox(currentUserId);
  }, [inputText, currentUserId, userId]);

  const handleKeyPress = useCallback(
    (e: any) => {
      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!currentUserId) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
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
            <Text style={styles.headerTitle}>{displayName}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? colors.kenteGold : colors.terracotta },
                ]}
              />
              <Text style={styles.statusText}>{connected ? 'Online' : 'Connecting…'}</Text>
            </View>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            historyLoading ? (
              <Text style={styles.historyHint}>Loading conversation…</Text>
            ) : historyError ? (
              <Text style={styles.historyErrorHint}>
                Couldn&apos;t load earlier messages. Pull down or reopen the chat to retry.
              </Text>
            ) : (
              <Text style={styles.historyHint}>No messages yet — say hi!</Text>
            )
          }
          renderItem={({ item }) => (
            <View
              style={[styles.messageBubble, item.isOwn ? styles.ownBubble : styles.otherBubble]}
            >
              {item.verificationFailed ? (
                <Text style={styles.messageWarning}>
                  ⚠ Could not verify sender&apos;s keys — message not shown
                </Text>
              ) : item.text === null ? (
                <Text style={styles.messageWarning}>
                  🔒 This message can&apos;t be decrypted on this device
                </Text>
              ) : (
                <Text style={item.isOwn ? styles.messageText : styles.otherMessageText}>
                  {item.text}
                </Text>
              )}
              <View style={styles.messageMeta}>
                <Text style={styles.messageTime}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
                {item.isOwn && (
                  <StatusTicks delivered={item.delivered} read={item.read} queued={item.queued} />
                )}
              </View>
            </View>
          )}
        />

        {keyError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{keyError}</Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={(text) => {
              if (keyError) setKeyError(null);
              setInputText(text);
            }}
            onKeyPress={handleKeyPress}
            placeholder="Type a message…"
            placeholderTextColor={colors.savannaMuted}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
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
  safe: {
    flex: 1,
    backgroundColor: colors.baobab,
  },
  container: {
    flex: 1,
  },
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
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  backArrow: {
    color: colors.kenteGold,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: colors.savanna,
    fontSize: 18,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.savannaMuted,
    fontSize: 12,
  },
  messagesList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  historyHint: {
    color: colors.savannaMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  historyErrorHint: {
    color: colors.terracotta,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.kenteGold,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.inputSurface,
  },
  messageText: {
    color: colors.baobabDeep,
    fontSize: 15,
    lineHeight: 20,
  },
  otherMessageText: {
    color: colors.savanna,
    fontSize: 15,
    lineHeight: 20,
  },
  messageWarning: {
    color: colors.terracotta,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
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
  errorBannerText: {
    color: colors.terracotta,
    fontSize: 13,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  messageTime: {
    color: colors.savannaMuted,
    fontSize: 11,
    textAlign: 'right',
  },
  statusTicks: {
    color: colors.savannaMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  statusTicksRead: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: '700',
  },
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
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: colors.baobabDeep,
    fontWeight: '700',
    fontSize: 14,
  },
});
