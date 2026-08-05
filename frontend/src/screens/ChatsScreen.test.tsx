import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from '../auth/AuthContext';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import * as client from '../realtime/client';
import * as usersApi from '../api/users';

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

jest.mock('../api/users', () => ({
  listUsers: jest.fn(),
  getMyProfile: jest.fn(),
  matchContacts: jest.fn(),
}));

jest.mock('../auth/deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
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

const mockClient = client.realtimeClient as unknown as {
  open: jest.Mock;
  disconnect: jest.Mock;
};

const mockUsers = usersApi as jest.Mocked<typeof usersApi>;

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

import { ChatsScreen } from './ChatsScreen';

async function renderChats(navigation: { navigate: jest.Mock }) {
  const { socket, emit } = makeSocket();
  mockClient.open.mockResolvedValue(socket);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <ChatsScreen navigation={navigation as never} route={{} as never} />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { socket, emit };
}

describe('ChatsScreen', () => {
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

  it('lists chat users and navigates to a chat on press', async () => {
    mockUsers.listUsers.mockResolvedValue([
      {
        id: 'u2',
        displayName: 'Kofi',
        email: 'kofi@example.com',
        phone: null,
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        bio: '',
        avatar: null,
      },
      {
        id: 'u3',
        displayName: 'Yaa',
        email: 'yaa@example.com',
        phone: null,
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        bio: '',
        avatar: null,
      },
    ] as never);

    const navigation = { navigate: jest.fn() };
    const { socket, emit } = await renderChats(navigation);
    await waitFor(() => {
      expect(socket.on).toHaveBeenCalled();
    });
    emit('connect');
    emit('presence:list', { onlineUserIds: ['u2'] });

    expect(await screen.findByText('Kofi')).toBeOnTheScreen();
    expect(screen.getByText('Yaa')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /Kofi/ }));

    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      userId: 'u2',
      displayName: 'Kofi',
    });
  });

  it('does not list the current user as a chat peer', async () => {
    mockUsers.listUsers.mockResolvedValue([
      {
        id: 'u1',
        displayName: 'Ama',
        email: 'ama@example.com',
        phone: null,
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        bio: '',
        avatar: null,
      },
    ] as never);

    const navigation = { navigate: jest.fn() };
    await renderChats(navigation);

    await waitFor(() => {
      expect(screen.queryByText('Ama')).not.toBeOnTheScreen();
    });
    expect(await screen.findByText(/No chats yet/)).toBeOnTheScreen();
  });

  it('shows an empty state when there are no other users', async () => {
    mockUsers.listUsers.mockResolvedValue([] as never);
    const navigation = { navigate: jest.fn() };
    await renderChats(navigation);

    expect(await screen.findByText(/No chats yet/)).toBeOnTheScreen();
  });

  it('recovers from a failed users load by tapping to retry', async () => {
    mockUsers.listUsers.mockRejectedValueOnce(new Error('Network request failed'));
    mockUsers.listUsers.mockResolvedValueOnce([
      {
        id: 'u2',
        displayName: 'Kofi',
        email: 'kofi@example.com',
        phone: null,
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        bio: '',
        avatar: null,
      },
    ] as never);
    const navigation = { navigate: jest.fn() };
    await renderChats(navigation);

    expect(await screen.findByText(/Could not load chats/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /Could not load chats/ }));

    expect(await screen.findByText('Kofi')).toBeOnTheScreen();
  });
});
