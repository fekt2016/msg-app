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
import {
  encryptMessage,
  decryptMessage,
  buildSharedSecret,
  verifyPreKeySignature,
} from '../e2ee/crypto';
import type { E2eePublicKeyBundle } from '../e2ee/types';
import { keyStore } from '../e2ee/keyStore';
import { sendEncryptedMessage, fetchKeyBundle } from '../e2ee/e2eeApi';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

interface ChatMessage {
  id: string;
  senderId: string;
  ciphertext: string;
  timestamp: number;
  isOwn: boolean;
  delivered: boolean;
  read: boolean;
  verificationFailed?: boolean;
}

/**
 * Authenticates a fetched peer bundle before any of its public keys are used for
 * key agreement (B-1). Verifies the signed-pre-key's ECDSA signature against the
 * peer's identity signing key; a tampered/forged bundle from a malicious relay
 * fails here and the caller refuses to encrypt/decrypt with it. This does not by
 * itself pin the identity key (there is no TOFU yet — that is the X3DH follow-up
 * in TASKS.md), but it defeats a relay that cannot also forge the signing key.
 */
async function isPeerBundleVerified(bundle: E2eePublicKeyBundle): Promise<boolean> {
  const signingKey = bundle.identityKey?.signingPublicKey;
  const preKey = bundle.signedPreKey?.publicKey;
  const signature = bundle.signedPreKey?.signature;
  if (!signingKey || !preKey || !signature) return false;
  try {
    return await verifyPreKeySignature(signingKey, preKey, signature);
  } catch {
    return false;
  }
}

/**
 * Decrypts a persisted message fetched from the history endpoint. ECDH shared
 * secrets are symmetric, so the same secret derived from our identity private
 * key and the peer's identity public key works whether the message is ours or
 * theirs. On any failure the raw ciphertext preview is kept (mirrors the live
 * incoming path).
 */
async function decryptStoredMessage(
  stored: StoredMessage,
  currentUserId: string,
): Promise<ChatMessage | null> {
  const isOwn = stored.senderId === currentUserId;
  const peerId = isOwn ? stored.recipientId : stored.senderId;
  let ciphertext = stored.ciphertext;
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
        ciphertext = await decryptMessage(sharedSecret, stored.ciphertext, stored.iv);
      }
    }
  } catch {
    // Keep the raw ciphertext preview if decryption fails.
  }
  return {
    id: stored.id,
    senderId: stored.senderId,
    ciphertext,
    timestamp: stored.timestamp,
    isOwn,
    delivered: true,
    read: true,
    verificationFailed,
  };
}

function StatusTicks({ delivered, read }: { delivered: boolean; read: boolean }) {
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
  const historyMergedRef = useRef(false);
  const { data: history, isLoading: historyLoading } = useConversationMessages(userId);

  useEffect(() => {
    if (!currentUserId || historyMergedRef.current) return;
    if (!history || history.items.length === 0) {
      if (history) historyMergedRef.current = true;
      return;
    }
    historyMergedRef.current = true;

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
      if (loaded.length > 0) {
        setMessages((prev) => {
          // A live message that arrived while history was fetching is already in
          // state (its id is `${senderId}-${timestamp}`) — don't duplicate it.
          const fresh = loaded.filter(
            (m) =>
              !prev.some(
                (existing) =>
                  existing.senderId === m.senderId && existing.timestamp === m.timestamp,
              ),
          );
          return [...fresh, ...prev];
        });
      }
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
        if (payload.senderId === currentUserId) return;

        let ciphertext = payload.ciphertext;
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
              const plaintext = await decryptMessage(sharedSecret, payload.ciphertext, payload.iv);
              ciphertext = plaintext;
            }
          }
        } catch {
          // Keep the raw ciphertext preview if decryption fails.
        }

        const incoming: ChatMessage = {
          id: `${payload.senderId}-${payload.timestamp}`,
          senderId: payload.senderId,
          ciphertext,
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (!currentUserId) return;

    const keyBundle = await keyStore.getKeyBundle();
    if (!keyBundle) {
      setKeyError('Your encryption keys are still being set up. Try again in a moment.');
      return;
    }

    const recipientBundle = await fetchKeyBundle(userId).catch(() => null);
    if (!recipientBundle?.identityKey?.publicKey) {
      setKeyError('This contact has not set up encryption yet, so messages can’t be sent.');
      return;
    }

    // B-1: refuse to encrypt to a recipient whose bundle fails signature
    // verification (possible MITM / tampered directory entry).
    if (!(await isPeerBundleVerified(recipientBundle))) {
      setKeyError("Could not verify this contact's encryption keys. Message not sent.");
      return;
    }
    setKeyError(null);

    const sharedSecret = await buildSharedSecret(
      keyBundle.identityKey.privateKey,
      recipientBundle.identityKey.publicKey,
    );

    const { ciphertext, iv } = await encryptMessage(sharedSecret, text);
    const timestamp = Date.now();

    const newMessage: ChatMessage = {
      id: `${currentUserId}-${timestamp}`,
      senderId: currentUserId,
      // Show the readable text we just typed in our own bubble; the encrypted
      // `ciphertext` is what goes over the wire (below), never displayed to us.
      // Mirrors the incoming path, which stores decrypted plaintext here too.
      ciphertext: text,
      timestamp,
      isOwn: true,
      delivered: false,
      read: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText('');

    const socket = realtimeClient.connect();
    socket.emit(REALTIME_EVENTS.CHAT_MESSAGE_NEW, {
      recipientId: userId,
      ciphertext,
      iv,
      timestamp,
    });

    await sendEncryptedMessage({
      senderId: currentUserId,
      recipientId: userId,
      ciphertext,
      timestamp,
    });
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
              ) : (
                <Text style={styles.messageText}>{item.ciphertext.slice(0, 40)}…</Text>
              )}
              <View style={styles.messageMeta}>
                <Text style={styles.messageTime}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
                {item.isOwn && <StatusTicks delivered={item.delivered} read={item.read} />}
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
