import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Button, Text } from 'react-native';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { RealtimeProvider, useRealtime } from './RealtimeProvider';
import * as client from './client';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
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

jest.mock('../auth/deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

jest.mock('../api/users', () => ({
  getMyProfile: jest.fn(),
}));

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
    auth: {},
    connected: false,
  };
  const emit = (event: string, payload?: unknown) => {
    (listeners[event] ?? []).forEach((cb) => cb(payload));
  };
  return { socket, emit };
}

jest.mock('./client', () => {
  const actual = jest.requireActual('./client');
  return {
    ...actual,
    realtimeClient: {
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

const mockClient = client.realtimeClient as unknown as {
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

function Probe() {
  const { connected, onlineUserIds, isOnline } = useRealtime();
  return (
    <Text testID="probe">
      {`${connected ? 'connected' : 'idle'}|${onlineUserIds.join(',')}|${isOnline('u2') ? 'online' : 'offline'}`}
    </Text>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <Button title="logout" onPress={() => void logout()} testID="logout" />;
}

function renderProvider() {
  return render(
    <AuthProvider>
      <RealtimeProvider>
        <Probe />
        <LogoutButton />
      </RealtimeProvider>
    </AuthProvider>,
  );
}

describe('RealtimeProvider', () => {
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
  });

  it('connects and reflects the presence list for an authenticated user', async () => {
    const { socket, emit } = makeSocket();
    mockClient.open.mockResolvedValue(socket);

    await renderProvider();

    await new Promise((r) => setTimeout(r, 300));
    console.log(
      'on calls:',
      socket.on.mock.calls.length,
      'open:',
      mockClient.open.mock.calls.length,
    );
    await waitFor(() => {
      expect(socket.on).toHaveBeenCalled();
    });

    await act(async () => {
      emit('connect');
      emit('presence:list', { onlineUserIds: ['u1', 'u2'] });
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toBe('connected|u1,u2|online');
    });
  });

  it('tracks presence updates as users go offline', async () => {
    const { socket, emit } = makeSocket();
    mockClient.open.mockResolvedValue(socket);

    await renderProvider();

    await waitFor(() => expect(socket.on).toHaveBeenCalled());

    await act(async () => {
      emit('connect');
      emit('presence:list', { onlineUserIds: ['u1', 'u2'] });
      emit('presence:update', { userId: 'u2', online: false, connectionCount: 0, at: '' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toBe('connected|u1|offline');
    });
  });

  it('disconnects and clears presence when the user logs out', async () => {
    const { socket, emit } = makeSocket();
    mockClient.open.mockResolvedValue(socket);
    (client.realtimeClient.disconnect as jest.Mock) = jest.fn();

    await renderProvider();
    await waitFor(() => expect(socket.on).toHaveBeenCalled());

    await act(async () => {
      emit('connect');
      emit('presence:list', { onlineUserIds: ['u1', 'u2'] });
    });

    await fireEvent.press(screen.getByTestId('logout'));

    await waitFor(() => {
      expect(client.realtimeClient.disconnect).toHaveBeenCalled();
    });
  });
});
