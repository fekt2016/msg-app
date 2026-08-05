import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from '../auth/AuthContext';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import * as e2eeApi from '../e2ee/e2eeApi';
import * as crypto from '../e2ee/crypto';
import * as keyStore from '../e2ee/keyStore';
import * as client from '../realtime/client';

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
) {
  mockRealtimeClient.connect.mockReturnValue(socket);
  mockRealtimeClient.open.mockResolvedValue(socket);
  return render(
    <AuthProvider>
      <RealtimeProvider>
        <ChatScreen
          route={{ params: { userId: 'u2', displayName: 'Kofi' } } as never}
          navigation={(navigation ?? { goBack: jest.fn() }) as never}
        />
      </RealtimeProvider>
    </AuthProvider>,
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
