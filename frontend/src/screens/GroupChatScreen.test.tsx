import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as groupSession from '../e2ee/groupSession';
import { realtimeClient } from '../realtime/client';
import { useGroupMembers, useGroupMessages } from '../hooks/useGroups';
import { GroupChatScreen } from './GroupChatScreen';

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

jest.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ connected: true }),
}));

jest.mock('../hooks/useGroups', () => {
  const actual = jest.requireActual('../hooks/useGroups');
  return { ...actual, useGroupMembers: jest.fn(), useGroupMessages: jest.fn() };
});

jest.mock('../e2ee/groupSession', () => ({
  ensureOwnSenderKeyDistributed: jest.fn(async () => undefined),
  rotateOwnSenderKey: jest.fn(async () => undefined),
  encryptGroupMessage: jest.fn(),
  decryptGroupMessage: jest.fn(),
}));

jest.mock('../realtime/client', () => {
  const actual = jest.requireActual('../realtime/client');
  return {
    ...actual,
    realtimeClient: { connect: jest.fn(), open: jest.fn(), disconnect: jest.fn() },
  };
});

const mockSession = groupSession as jest.Mocked<typeof groupSession>;
const mockUseMembers = useGroupMembers as jest.Mock;
const mockUseMessages = useGroupMessages as jest.Mock;
const mockConnect = realtimeClient.connect as jest.Mock;

const socket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };

function screenElement(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GroupChatScreen
        navigation={navigation as never}
        route={{ params: { groupId: 'g1', name: 'Squad' } } as never}
      />
    </QueryClientProvider>
  );
}

async function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const view = await render(screenElement(navigation));
  return { navigation, view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockReturnValue(socket);
  mockUseMembers.mockReturnValue({
    data: {
      items: [
        { userId: 'me', displayName: 'Me' },
        { userId: 'u2', displayName: 'Bob' },
      ],
    },
  });
  mockUseMessages.mockReturnValue({ data: undefined, isLoading: true });
});

describe('GroupChatScreen', () => {
  it('subscribes to the group and distributes the sender key on mount', async () => {
    await renderScreen();

    expect(socket.emit).toHaveBeenCalledWith('group:subscribe', { groupId: 'g1' });
    await waitFor(() =>
      expect(mockSession.ensureOwnSenderKeyDistributed).toHaveBeenCalledWith(
        'g1',
        ['me', 'u2'],
        'me',
      ),
    );
  });

  it('encrypts and emits a message on send', async () => {
    mockSession.encryptGroupMessage.mockResolvedValue({ ciphertext: 'ct', iv: 'iv', keyId: 3 });
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello team');
    await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(mockSession.encryptGroupMessage).toHaveBeenCalledWith('g1', 'hello team'),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'chat:group:message:new',
      expect.objectContaining({ groupId: 'g1', ciphertext: 'ct', iv: 'iv', keyId: 3 }),
    );
    expect(await screen.findByText('hello team')).toBeOnTheScreen();
  });

  it('loads and decrypts persisted group history on open', async () => {
    mockSession.decryptGroupMessage.mockImplementation(
      async (_g: string, _s: string, _k: number, ct: string) => `dec:${ct}`,
    );
    mockUseMessages.mockReturnValue({
      data: {
        items: [
          {
            id: 'm1',
            groupId: 'g1',
            senderId: 'u2',
            keyId: 1,
            ciphertext: 'ct-old',
            iv: 'iv-1',
            timestamp: 1000,
          },
        ],
      },
      isLoading: false,
    });
    await renderScreen();

    await waitFor(() => expect(screen.getByText('dec:ct-old')).toBeOnTheScreen());
  });

  it('merges newly fetched history when the conversation is refetched (reload on return)', async () => {
    mockSession.decryptGroupMessage.mockImplementation(
      async (_g: string, _s: string, _k: number, ct: string) => `dec:${ct}`,
    );
    mockUseMessages.mockReturnValue({
      data: {
        items: [
          {
            id: 'm1',
            groupId: 'g1',
            senderId: 'u2',
            keyId: 1,
            ciphertext: 'ct-1',
            iv: 'iv-1',
            timestamp: 1000,
          },
        ],
      },
      isLoading: false,
    });
    const { view, navigation } = await renderScreen();

    await waitFor(() => expect(screen.getByText('dec:ct-1')).toBeOnTheScreen());

    mockUseMessages.mockReturnValue({
      data: {
        items: [
          {
            id: 'm2',
            groupId: 'g1',
            senderId: 'u2',
            keyId: 1,
            ciphertext: 'ct-2',
            iv: 'iv-2',
            timestamp: 2000,
          },
          {
            id: 'm1',
            groupId: 'g1',
            senderId: 'u2',
            keyId: 1,
            ciphertext: 'ct-1',
            iv: 'iv-1',
            timestamp: 1000,
          },
        ],
      },
      isLoading: false,
    });
    await act(async () => {
      view.rerender(screenElement(navigation));
    });

    await waitFor(() => expect(screen.getByText('dec:ct-2')).toBeOnTheScreen());
  });
});
