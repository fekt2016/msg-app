import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from '../auth/AuthContext';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import * as e2eeApi from '../e2ee/e2eeApi';
import * as crypto from '../e2ee/crypto';
import * as keyStore from '../e2ee/keyStore';
import * as client from '../realtime/client';
import * as apiClientModule from '../api/client';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: (err: unknown) => Boolean((err as { response?: unknown })?.response),
  apiErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong. Please try again.',
}));

const mockApiClient = apiClientModule.apiClient as unknown as { get: jest.Mock };

jest.mock('../api/auth', () => ({
  register: jest.fn(),
  resendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('../api/users', () => ({
  getMyProfile: jest.fn(),
}));

jest.mock('../auth/deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

jest.mock('../e2ee/e2eeApi', () => ({
  sendEncryptedMessage: jest.fn(),
  fetchKeyBundle: jest.fn(),
}));

jest.mock('../e2ee/crypto', () => ({
  encryptMessage: jest.fn(),
  decryptMessage: jest.fn(),
  buildSharedSecret: jest.fn(),
  verifyPreKeySignature: jest.fn(),
}));

jest.mock('../e2ee/keyStore', () => ({
  keyStore: {
    getKeyBundle: jest.fn(),
  },
}));

jest.mock('../realtime/client', () => {
  const actual = jest.requireActual('../realtime/client');
  return {
    ...actual,
    realtimeClient: {
      connect: jest.fn(),
      open: jest.fn(),
      disconnect: jest.fn(),
    },
  };
});

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const mockE2eeApi = e2eeApi as jest.Mocked<typeof e2eeApi>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockKeyStore = keyStore.keyStore as unknown as { getKeyBundle: jest.Mock };

const mockRealtimeClient = client.realtimeClient as unknown as {
  connect: jest.Mock;
  open: jest.Mock;
  disconnect: jest.Mock;
};

const storedUser = {
  id: 'u1',
  displayName: 'Ama',
  email: 'ama@example.com',
  phone: null,
  role: 'USER',
  bio: 'Hello Ghana',
  avatar: null,
};

function makeSocket() {
  const listeners: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket = {
    on: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    once: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    auth: {},
    connected: false,
  };
  const emit = (event: string, payload?: unknown) => {
    (listeners[event] ?? []).forEach((cb) => cb(payload));
  };
  return { socket, emit };
}

// Local bundle (from secure storage) — carries private halves; stays on-device.
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

// Fetched peer bundle — PUBLIC only, no private key material.
const theirBundle = {
  identityKey: { publicKey: 'pub-them', signingPublicKey: 'sign-pub-them' },
  signedPreKey: { keyId: 1, publicKey: 'signed-them', signature: 'sig' },
  preKeys: [],
  oneTimePreKeys: [],
};

function renderChat(
  socket: ReturnType<typeof makeSocket>['socket'],
  navigation?: { goBack: jest.Mock },
  queryClient?: QueryClient,
) {
  mockRealtimeClient.connect.mockReturnValue(socket);
  mockRealtimeClient.open.mockResolvedValue(socket);
  return render(
    <QueryClientProvider
      client={
        queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
      }
    >
      <AuthProvider>
        <RealtimeProvider>
          <ChatScreen
            route={{ params: { userId: 'u2', displayName: 'Kofi' } } as never}
            navigation={(navigation ?? { goBack: jest.fn() }) as never}
          />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

import { ChatScreen } from './ChatScreen';

describe('ChatScreen delivery and read status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecure.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'eaz_access_token') return 'at';
      if (key === 'eaz_refresh_token') return 'rt';
      if (key === 'eaz_user') return JSON.stringify(storedUser);
      return null;
    });
    mockSecure.setItemAsync.mockResolvedValue(undefined);
    mockSecure.deleteItemAsync.mockResolvedValue(undefined);
    mockKeyStore.getKeyBundle.mockResolvedValue(ourBundle);
    mockE2eeApi.fetchKeyBundle.mockResolvedValue(theirBundle);
    mockCrypto.buildSharedSecret.mockResolvedValue(new Uint8Array(32));
    mockCrypto.verifyPreKeySignature.mockResolvedValue(true);
    mockApiClient.get.mockResolvedValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    });
  });

  it('loads and decrypts persisted conversation history on open', async () => {
    mockCrypto.decryptMessage.mockResolvedValue('history message');
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'm1',
            senderId: 'u2',
            recipientId: 'u1',
            ciphertext: 'ct-hist',
            iv: 'iv-hist',
            timestamp: 1000,
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
    const { socket } = makeSocket();
    await renderChat(socket);

    await waitFor(() => {
      expect(screen.getByText(/history message/)).toBeOnTheScreen();
    });
  });

  it('shows an error hint (not the empty state) when history fails to load', async () => {
    mockApiClient.get.mockRejectedValue(new Error('network down'));
    const { socket } = makeSocket();
    await renderChat(socket);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load earlier messages/)).toBeOnTheScreen();
    });
    // The misleading "no messages" empty state must not be shown on a fetch error.
    expect(screen.queryByText(/No messages yet/)).toBeNull();
  });

  it('does not duplicate a live message that is also in history', async () => {
    mockCrypto.decryptMessage.mockResolvedValue('overlap message');
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'm1',
            senderId: 'u2',
            recipientId: 'u1',
            ciphertext: 'ct-overlap',
            iv: 'iv-overlap',
            timestamp: 12345,
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await act(async () => {
      emit('chat:message:new', {
        senderId: 'u2',
        ciphertext: 'ct-overlap',
        iv: 'iv-overlap',
        timestamp: 12345,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText(/overlap message/)).toHaveLength(1);
    });
  });

  it('merges newly fetched history when the conversation is refetched (reload on return)', async () => {
    mockCrypto.decryptMessage.mockImplementation(
      async (_secret: unknown, ct: string) => `dec:${ct}`,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'm1',
            senderId: 'u2',
            recipientId: 'u1',
            ciphertext: 'ct-1',
            iv: 'iv-1',
            timestamp: 1000,
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
    const { socket } = makeSocket();
    await renderChat(socket, undefined, queryClient);

    await waitFor(() => {
      expect(screen.getByText(/dec:ct-1/)).toBeOnTheScreen();
    });

    mockApiClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'm2',
            senderId: 'u2',
            recipientId: 'u1',
            ciphertext: 'ct-2',
            iv: 'iv-2',
            timestamp: 2000,
          },
          {
            id: 'm1',
            senderId: 'u2',
            recipientId: 'u1',
            ciphertext: 'ct-1',
            iv: 'iv-1',
            timestamp: 1000,
          },
        ],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    });

    await act(async () => {
      await queryClient.invalidateQueries();
    });

    await waitFor(() => {
      expect(screen.getByText(/dec:ct-2/)).toBeOnTheScreen();
    });
  });

  it('sends an encrypted message with a ciphertext and iv', async () => {
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    const { socket } = makeSocket();
    await renderChat(socket);

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith('chat:message:new', {
        recipientId: 'u2',
        ciphertext: 'ct-1',
        iv: 'iv-1',
        timestamp: expect.any(Number),
      });
    });
    await waitFor(() => {
      expect(mockE2eeApi.sendEncryptedMessage).toHaveBeenCalled();
    });
  });

  it('marks a sent message as delivered when the recipient acks', async () => {
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    const sentTimestamp = (socket.emit as jest.Mock).mock.calls[0][1].timestamp;

    await act(async () => {
      emit('chat:message:delivered', { recipientId: 'u2', timestamp: sentTimestamp });
    });

    await waitFor(() => {
      expect(screen.getAllByText('✓✓')).toHaveLength(1);
    });
  });

  it('marks a sent message as read when the recipient acks', async () => {
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    const sentTimestamp = (socket.emit as jest.Mock).mock.calls[0][1].timestamp;

    await act(async () => {
      emit('chat:message:read', { recipientId: 'u2', timestamp: sentTimestamp });
    });

    await waitFor(() => {
      expect(screen.getAllByText('✓✓')).toHaveLength(1);
    });
  });

  it('decrypts incoming messages and acks delivery and read', async () => {
    mockCrypto.decryptMessage.mockResolvedValue('decrypted hello');
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await act(async () => {
      emit('chat:message:new', {
        senderId: 'u2',
        ciphertext: 'ct-in',
        iv: 'iv-in',
        timestamp: 12345,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/decrypted hello/)).toBeOnTheScreen();
    });
    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith('chat:message:delivered', {
        senderId: 'u2',
        timestamp: 12345,
      });
      expect(socket.emit).toHaveBeenCalledWith('chat:message:read', {
        senderId: 'u2',
        timestamp: 12345,
      });
    });
  });

  it('ignores an incoming message from a different conversation', async () => {
    mockCrypto.decryptMessage.mockResolvedValue('decrypted hello');
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await act(async () => {
      // The recipient's user room receives messages from every sender; a
      // message from u3 belongs to another thread and must not surface here.
      emit('chat:message:new', {
        senderId: 'u3',
        ciphertext: 'ct-other',
        iv: 'iv-other',
        timestamp: 999,
      });
    });

    expect(mockCrypto.decryptMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/decrypted hello/)).toBeNull();
    // No delivery/read ack is emitted for a message we did not accept.
    expect(socket.emit).not.toHaveBeenCalledWith('chat:message:delivered', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('chat:message:read', expect.anything());
  });

  it('refuses to send when the recipient bundle fails signature verification', async () => {
    mockCrypto.verifyPreKeySignature.mockResolvedValue(false);
    mockCrypto.encryptMessage.mockResolvedValue({ ciphertext: 'ct-1', iv: 'iv-1' });
    const { socket } = makeSocket();
    await renderChat(socket);

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText(/Could not verify this contact's encryption keys/)).toBeOnTheScreen();
    });

    // The peer key was never used to derive a secret and nothing was relayed.
    expect(mockCrypto.buildSharedSecret).not.toHaveBeenCalled();
    expect(mockCrypto.encryptMessage).not.toHaveBeenCalled();
    expect(mockE2eeApi.sendEncryptedMessage).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalledWith('chat:message:new', expect.anything());
  });

  it('does not decrypt an incoming message when the sender bundle fails verification', async () => {
    mockCrypto.verifyPreKeySignature.mockResolvedValue(false);
    mockCrypto.decryptMessage.mockResolvedValue('decrypted hello');
    const { socket, emit } = makeSocket();
    await renderChat(socket);

    await act(async () => {
      emit('chat:message:new', {
        senderId: 'u2',
        ciphertext: 'ct-in',
        iv: 'iv-in',
        timestamp: 12345,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Could not verify sender/)).toBeOnTheScreen();
    });

    // A forged/tampered bundle must never reach the decrypt path.
    expect(mockCrypto.buildSharedSecret).not.toHaveBeenCalled();
    expect(mockCrypto.decryptMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/decrypted hello/)).toBeNull();
  });

  it('navigates back when the back arrow is pressed', async () => {
    const { socket } = makeSocket();
    const navigation = { goBack: jest.fn() };
    await renderChat(socket, navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));

    expect(navigation.goBack).toHaveBeenCalled();
  });
});
