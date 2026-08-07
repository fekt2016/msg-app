import * as SecureStore from 'expo-secure-store';
import type { Socket } from 'socket.io-client';
import { outboxStore, sendChatDraft, flushOutbox, subscribeToOutbox } from './outbox';
import * as crypto from './crypto';
import * as e2eeApi from './e2eeApi';
import * as keyStore from './keyStore';
import * as realtimeClientModule from '../realtime/client';

jest.mock('./crypto', () => ({
  buildSharedSecret: jest.fn(),
  encryptMessage: jest.fn(),
  verifyPreKeySignature: jest.fn(),
}));

jest.mock('./e2eeApi', () => ({
  fetchKeyBundle: jest.fn(),
  sendEncryptedMessage: jest.fn(),
}));

jest.mock('./keyStore', () => ({
  keyStore: { getKeyBundle: jest.fn() },
}));

jest.mock('../realtime/client', () => ({
  REALTIME_EVENTS: { CHAT_MESSAGE_NEW: 'chat:message:new' },
  realtimeClient: { connect: jest.fn() },
}));

const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockE2eeApi = e2eeApi as jest.Mocked<typeof e2eeApi>;
const mockKeyStore = keyStore.keyStore as unknown as { getKeyBundle: jest.Mock };
const mockConnect = (realtimeClientModule.realtimeClient as unknown as { connect: jest.Mock })
  .connect;

const OUTBOX_KEY = 'e2ee_outbox';

const ourBundle = {
  identityKey: {
    publicKey: 'pub-own',
    privateKey: 'priv-own',
    signingPublicKey: 'sign-pub-own',
    signingPrivateKey: 'sign-priv-own',
  },
  signedPreKey: {
    keyId: 1,
    publicKey: 'signed-own',
    privateKey: 'signed-priv-own',
    signature: 'sig',
  },
  preKeys: [],
  oneTimePreKeys: [],
};

const theirBundle = {
  identityKey: { publicKey: 'pub-them', signingPublicKey: 'sign-pub-them' },
  signedPreKey: { keyId: 1, publicKey: 'signed-them', signature: 'sig' },
  preKeys: [],
  oneTimePreKeys: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSocket(): Socket {
  return { emit: jest.fn() } as unknown as Socket;
}

describe('outboxStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecure.getItemAsync.mockResolvedValue(null);
    mockSecure.setItemAsync.mockResolvedValue(undefined);
    mockSecure.deleteItemAsync.mockResolvedValue(undefined);
  });

  it('enqueues, lists, removes and clears entries', async () => {
    let storedValue: string | null = null;
    mockSecure.getItemAsync.mockImplementation((key: string) =>
      key === OUTBOX_KEY ? storedValue : null,
    );
    mockSecure.setItemAsync.mockImplementation((key: string, value: string) => {
      if (key === OUTBOX_KEY) storedValue = value;
    });
    mockSecure.deleteItemAsync.mockImplementation((key: string) => {
      if (key === OUTBOX_KEY) storedValue = null;
    });

    const message = {
      id: 'u1-1000',
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
      queuedAt: 1000,
    };
    await outboxStore.enqueue(message);
    expect(await outboxStore.list()).toEqual([message]);

    await outboxStore.remove([message.id]);
    expect(await outboxStore.list()).toEqual([]);

    await outboxStore.enqueue(message);
    await outboxStore.clear();
    expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith(OUTBOX_KEY);
    expect(await outboxStore.list()).toEqual([]);
  });

  it('dedupes entries with the same id', async () => {
    const message = {
      id: 'u1-1000',
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
      queuedAt: 1000,
    };
    mockSecure.getItemAsync.mockResolvedValue(JSON.stringify([message]));
    await outboxStore.enqueue({ ...message, text: 'duplicate' });
    // Dedup must not rewrite the store — the existing entry is kept untouched.
    expect(mockSecure.setItemAsync).not.toHaveBeenCalledWith(OUTBOX_KEY, expect.anything());
  });

  it('returns an empty list for a missing or corrupt payload', async () => {
    mockSecure.getItemAsync.mockResolvedValue(null);
    expect(await outboxStore.list()).toEqual([]);
    mockSecure.getItemAsync.mockResolvedValue('not-json');
    expect(await outboxStore.list()).toEqual([]);
  });
});

describe('sendChatDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyStore.getKeyBundle.mockResolvedValue(ourBundle);
    mockE2eeApi.fetchKeyBundle.mockResolvedValue(theirBundle);
    mockCrypto.verifyPreKeySignature.mockResolvedValue(true);
    mockCrypto.buildSharedSecret.mockResolvedValue(new Uint8Array(32));
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    mockE2eeApi.sendEncryptedMessage.mockResolvedValue(undefined);
  });

  it('encrypts and sends a draft, emitting ciphertext only', async () => {
    const socket = makeSocket();
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
      socket,
    });

    expect(result).toEqual({ ok: true });
    expect(mockCrypto.buildSharedSecret).toHaveBeenCalledWith('priv-own', 'pub-them');
    expect(mockCrypto.encryptMessage).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('chat:message:new', {
      recipientId: 'u2',
      ciphertext: 'ct-1',
      iv: 'iv-1',
      timestamp: 1000,
    });
    expect(mockE2eeApi.sendEncryptedMessage).toHaveBeenCalledWith({
      senderId: 'u1',
      recipientId: 'u2',
      ciphertext: 'ct-1',
      timestamp: 1000,
    });
  });

  it('reports KEYS_NOT_READY when our own bundle is missing', async () => {
    mockKeyStore.getKeyBundle.mockResolvedValue(null);
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'KEYS_NOT_READY' });
    expect(mockE2eeApi.fetchKeyBundle).not.toHaveBeenCalled();
  });

  it('reports NO_KEYS when the recipient has no published bundle', async () => {
    mockE2eeApi.fetchKeyBundle.mockResolvedValue(null as never);
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'NO_KEYS' });
  });

  it('reports NO_KEYS when the recipient bundle has no identity key', async () => {
    mockE2eeApi.fetchKeyBundle.mockResolvedValue({ ...theirBundle, identityKey: null as never });
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'NO_KEYS' });
  });

  it('reports VERIFICATION_FAILED when the recipient bundle fails signature check', async () => {
    mockCrypto.verifyPreKeySignature.mockResolvedValue(false);
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'VERIFICATION_FAILED' });
    expect(mockCrypto.buildSharedSecret).not.toHaveBeenCalled();
    expect(mockCrypto.encryptMessage).not.toHaveBeenCalled();
  });

  it('reports SEND_FAILED when the server rejects the encrypted message', async () => {
    mockE2eeApi.sendEncryptedMessage.mockRejectedValue(new Error('network down'));
    const result = await sendChatDraft({
      senderId: 'u1',
      recipientId: 'u2',
      text: 'hello',
      timestamp: 1000,
    });
    expect(result).toMatchObject({ ok: false, reason: 'SEND_FAILED' });
  });
});

describe('flushOutbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyStore.getKeyBundle.mockResolvedValue(ourBundle);
    mockE2eeApi.fetchKeyBundle.mockResolvedValue(theirBundle);
    mockCrypto.verifyPreKeySignature.mockResolvedValue(true);
    mockCrypto.buildSharedSecret.mockResolvedValue(new Uint8Array(32));
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    mockE2eeApi.sendEncryptedMessage.mockResolvedValue(undefined);
    mockConnect.mockReturnValue(makeSocket());
  });

  it('is a no-op when nothing is queued', async () => {
    mockSecure.getItemAsync.mockResolvedValue(null);
    const result = await flushOutbox('u1');
    expect(result).toEqual({ sentIds: [], failedIds: [] });
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockE2eeApi.sendEncryptedMessage).not.toHaveBeenCalled();
  });

  it('sends queued drafts for the user, removes them, and notifies listeners', async () => {
    const queuedAt = Date.now();
    const stored = [
      {
        id: 'u1-1000',
        senderId: 'u1',
        recipientId: 'u2',
        text: 'hello',
        timestamp: 1000,
        queuedAt,
      },
      {
        id: 'u1-1001',
        senderId: 'u1',
        recipientId: 'u2',
        text: 'second',
        timestamp: 1001,
        queuedAt,
      },
    ];
    mockSecure.getItemAsync.mockImplementation((key: string) =>
      key === OUTBOX_KEY ? JSON.stringify(stored) : null,
    );

    const listener = jest.fn();
    const unsubscribe = subscribeToOutbox(listener);
    const result = await flushOutbox('u1');

    expect(result.sentIds).toEqual(['u1-1000', 'u1-1001']);
    expect(mockE2eeApi.sendEncryptedMessage).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ sentIds: ['u1-1000', 'u1-1001'], failedIds: [] });
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(OUTBOX_KEY, JSON.stringify([]));
    unsubscribe();
  });

  it('keeps drafts that still cannot be sent', async () => {
    const queuedAt = Date.now();
    const stored = [
      {
        id: 'u1-1000',
        senderId: 'u1',
        recipientId: 'u2',
        text: 'hello',
        timestamp: 1000,
        queuedAt,
      },
      {
        id: 'u1-1001',
        senderId: 'u1',
        recipientId: 'u2',
        text: 'second',
        timestamp: 1001,
        queuedAt,
      },
    ];
    mockSecure.getItemAsync.mockImplementation((key: string) =>
      key === OUTBOX_KEY ? JSON.stringify(stored) : null,
    );
    // The first draft can now be sent, the second still has no recipient keys.
    mockE2eeApi.fetchKeyBundle.mockResolvedValue(theirBundle);
    mockE2eeApi.fetchKeyBundle.mockResolvedValueOnce(theirBundle);
    mockE2eeApi.fetchKeyBundle.mockResolvedValueOnce(null as never);

    const result = await flushOutbox('u1');

    expect(result.sentIds).toEqual(['u1-1000']);
    expect(result.failedIds).toEqual(['u1-1001']);
    const remaining = JSON.parse(
      mockSecure.setItemAsync.mock.calls.find(([key]) => key === OUTBOX_KEY)?.[1] as string,
    );
    expect(remaining).toEqual([stored[1]]);
  });

  it('drops drafts older than the retention window', async () => {
    const stored = [
      {
        id: 'u1-1000',
        senderId: 'u1',
        recipientId: 'u2',
        text: 'ancient',
        timestamp: 1000,
        queuedAt: Date.now() - 8 * DAY_MS,
      },
    ];
    mockSecure.getItemAsync.mockImplementation((key: string) =>
      key === OUTBOX_KEY ? JSON.stringify(stored) : null,
    );

    const result = await flushOutbox('u1');

    expect(result.sentIds).toEqual([]);
    expect(result.failedIds).toEqual([]);
    expect(mockE2eeApi.sendEncryptedMessage).not.toHaveBeenCalled();
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(OUTBOX_KEY, JSON.stringify([]));
  });

  it('ignores drafts belonging to a different user', async () => {
    const stored = [
      {
        id: 'u9-1000',
        senderId: 'u9',
        recipientId: 'u2',
        text: 'someone elses',
        timestamp: 1000,
        queuedAt: Date.now(),
      },
    ];
    mockSecure.getItemAsync.mockImplementation((key: string) =>
      key === OUTBOX_KEY ? JSON.stringify(stored) : null,
    );

    const result = await flushOutbox('u1');

    expect(result.sentIds).toEqual([]);
    expect(mockE2eeApi.sendEncryptedMessage).not.toHaveBeenCalled();
  });
});
