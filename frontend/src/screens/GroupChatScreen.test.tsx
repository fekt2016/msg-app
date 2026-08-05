import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as groupSession from '../e2ee/groupSession';
import { realtimeClient } from '../realtime/client';
import { useGroupMembers } from '../hooks/useGroups';
import { GroupChatScreen } from './GroupChatScreen';

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

jest.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ connected: true }),
}));

jest.mock('../hooks/useGroups', () => {
  const actual = jest.requireActual('../hooks/useGroups');
  return { ...actual, useGroupMembers: jest.fn() };
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
const mockConnect = realtimeClient.connect as jest.Mock;

const socket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  await render(
    <QueryClientProvider client={queryClient}>
      <GroupChatScreen
        navigation={navigation as never}
        route={{ params: { groupId: 'g1', name: 'Squad' } } as never}
      />
    </QueryClientProvider>,
  );
  return navigation;
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
});
