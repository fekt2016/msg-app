import * as SecureStore from 'expo-secure-store';
import type { Socket } from 'socket.io-client';
import { buildSharedSecret, encryptMessage } from './crypto';
import { isPeerBundleVerified } from './verify';
import { keyStore } from './keyStore';
import { fetchKeyBundle, sendEncryptedMessage } from './e2eeApi';
import { REALTIME_EVENTS, realtimeClient } from '../realtime/client';

// ---------------------------------------------------------------------------
// On-device outbound queue ("outbox").
//
// When a message cannot be sent right now — the recipient has no published
// E2EE keys yet, our own keys aren't ready, or the network drops — the plaintext
// draft is persisted HERE (never to the server, which must never see plaintext)
// and retried later by flushOutbox().
//
// The queue is E2EE-safe by construction: the server stores and relays
// ciphertext only, and this module holds plaintext exclusively in
// expo-secure-store on the sending device. Entries expire after
// OUTBOX_MAX_AGE_MS so a draft is never retained indefinitely at rest.
// ---------------------------------------------------------------------------

const OUTBOX_KEY = 'e2ee_outbox';
const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Bound the queue so a stream of drafts to a keyless contact can't grow the
// single SecureStore blob without limit (Android SecureStore values over ~2KB
// may fail to write). Newest entries win. A larger/size-aware store is tracked
// as a follow-up.
const OUTBOX_MAX_ENTRIES = 200;

export interface QueuedMessage {
  id: string;
  senderId: string;
  recipientId: string;
  /** Plaintext draft — NEVER leaves the device; only ciphertext is transmitted. */
  text: string;
  timestamp: number;
  queuedAt: number;
}

export type SendFailureReason =
  'KEYS_NOT_READY' | 'NO_KEYS' | 'VERIFICATION_FAILED' | 'SEND_FAILED';

export type SendDraftResult = { ok: true } | { ok: false; reason: SendFailureReason };

export interface SendDraftInput {
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: number;
  socket?: Socket | null;
}

export interface FlushOutboxResult {
  sentIds: string[];
  failedIds: string[];
}

// Serializes outbox read-modify-write cycles so a concurrent enqueue (from a
// send attempt) and remove (from a flush) can never lose an entry.
let mutex: Promise<unknown> = Promise.resolve();

function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.catch(() => undefined);
  return run;
}

export const outboxStore = {
  async list(): Promise<QueuedMessage[]> {
    const raw = await SecureStore.getItemAsync(OUTBOX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Corrupt payload — discard rather than crash, but surface it (§15: no
      // silently-swallowed errors) since it means queued drafts were lost.
      console.warn('[outbox] discarding corrupt queue payload:', err);
      return [];
    }
  },

  async enqueue(message: QueuedMessage): Promise<void> {
    await withOutboxLock(async () => {
      const current = await outboxStore.list();
      if (current.some((m) => m.id === message.id)) return;
      const next = [...current, message];
      const capped =
        next.length > OUTBOX_MAX_ENTRIES ? next.slice(next.length - OUTBOX_MAX_ENTRIES) : next;
      await SecureStore.setItemAsync(OUTBOX_KEY, JSON.stringify(capped));
    });
  },

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await withOutboxLock(async () => {
      const current = await outboxStore.list();
      const remaining = current.filter((m) => !ids.includes(m.id));
      await SecureStore.setItemAsync(OUTBOX_KEY, JSON.stringify(remaining));
    });
  },

  async clear(): Promise<void> {
    await withOutboxLock(async () => {
      await SecureStore.deleteItemAsync(OUTBOX_KEY);
    });
  },
};

type FlushListener = (result: FlushOutboxResult) => void;
const flushListeners = new Set<FlushListener>();

/** Registers a listener notified whenever a flush successfully sends entries. */
export function subscribeToOutbox(listener: FlushListener): () => void {
  flushListeners.add(listener);
  return () => {
    flushListeners.delete(listener);
  };
}

/**
 * Attempts to encrypt and send a single plaintext draft to `recipientId`. Key
 * agreement and encryption happen entirely on-device; only the resulting
 * ciphertext is emitted (live) and persisted server-side.
 *
 * Never throws — every failure is returned as a typed reason so callers can
 * decide whether to queue the draft for a later retry.
 */
export async function sendChatDraft(input: SendDraftInput): Promise<SendDraftResult> {
  try {
    const ourBundle = await keyStore.getKeyBundle();
    if (!ourBundle) return { ok: false, reason: 'KEYS_NOT_READY' };

    const recipientBundle = await fetchKeyBundle(input.recipientId).catch(() => null);
    if (!recipientBundle?.identityKey?.publicKey) return { ok: false, reason: 'NO_KEYS' };

    if (!(await isPeerBundleVerified(recipientBundle))) {
      return { ok: false, reason: 'VERIFICATION_FAILED' };
    }

    const sharedSecret = await buildSharedSecret(
      ourBundle.identityKey.privateKey,
      recipientBundle.identityKey.publicKey,
    );
    const { ciphertext, iv } = await encryptMessage(sharedSecret, input.text);

    input.socket?.emit(REALTIME_EVENTS.CHAT_MESSAGE_NEW, {
      recipientId: input.recipientId,
      ciphertext,
      iv,
      timestamp: input.timestamp,
    });

    await sendEncryptedMessage({
      senderId: input.senderId,
      recipientId: input.recipientId,
      ciphertext,
      timestamp: input.timestamp,
    });
    return { ok: true };
  } catch (err) {
    // Transient send failure (network/server) — log the cause once; the caller
    // keeps the draft queued for the next flush. Never throws, so an un-awaited
    // trigger site can't raise an unhandled rejection.
    console.warn('[outbox] send failed, will retry:', err);
    return { ok: false, reason: 'SEND_FAILED' };
  }
}

// Coalesces overlapping flushes. There are many fire-and-forget trigger sites
// (session restore, the 30s interval, chat mount/reconnect/post-send) that can
// call flushOutbox concurrently. Without coalescing, two overlapping runs both
// read the same queue and both send every draft — a duplicate live emit AND a
// duplicate server persist. A single in-flight run is shared by all callers.
let flushInFlight: Promise<FlushOutboxResult> | null = null;

/**
 * Drains the on-device outbox for `userId`, re-attempting every queued draft
 * with sendChatDraft. A draft goes out and is removed the moment the recipient
 * has keys (or our connection is back); anything still unsendable stays queued
 * for the next flush. Entries older than OUTBOX_MAX_AGE_MS are dropped so
 * plaintext is never retained indefinitely at rest.
 *
 * Concurrent calls are coalesced into one run, and the function never throws (a
 * SecureStore failure resolves to an empty result) so the un-awaited trigger
 * sites can't raise an unhandled rejection.
 */
export function flushOutbox(userId: string): Promise<FlushOutboxResult> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = runFlush(userId).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function runFlush(userId: string): Promise<FlushOutboxResult> {
  try {
    return await drainOutbox(userId);
  } catch (err) {
    console.warn('[outbox] flush failed:', err);
    return { sentIds: [], failedIds: [] };
  }
}

async function drainOutbox(userId: string): Promise<FlushOutboxResult> {
  const queue = await outboxStore.list();
  const mine = queue.filter((m) => m.senderId === userId);
  if (mine.length === 0) return { sentIds: [], failedIds: [] };

  const now = Date.now();
  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const expiredIds: string[] = [];

  let socket: Socket | null = null;
  for (const message of mine) {
    if (now - message.queuedAt > OUTBOX_MAX_AGE_MS) {
      expiredIds.push(message.id);
      continue;
    }
    if (!socket) {
      try {
        socket = realtimeClient.connect();
      } catch {
        socket = null;
      }
    }
    const result = await sendChatDraft({
      senderId: message.senderId,
      recipientId: message.recipientId,
      text: message.text,
      timestamp: message.timestamp,
      socket,
    });
    if (result.ok) {
      sentIds.push(message.id);
    } else {
      failedIds.push(message.id);
    }
  }

  const removed = [...sentIds, ...expiredIds];
  if (removed.length > 0) {
    await outboxStore.remove(removed);
  }

  const result: FlushOutboxResult = { sentIds, failedIds };
  if (sentIds.length > 0 || expiredIds.length > 0) {
    flushListeners.forEach((listener) => listener(result));
  }
  return result;
}
