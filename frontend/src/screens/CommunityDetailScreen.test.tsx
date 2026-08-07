import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as communitiesApi from '../api/communities';
import * as client from '../realtime/client';
import { CommunityDetailScreen } from './CommunityDetailScreen';

jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  isApiError: () => false,
  apiErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.'),
}));

jest.mock('../api/communities', () => ({
  createCommunity: jest.fn(),
  listCommunities: jest.fn(),
  getCommunity: jest.fn(),
  updateCommunity: jest.fn(),
  deleteCommunity: jest.fn(),
  joinCommunity: jest.fn(),
  leaveCommunity: jest.fn(),
  listCommunityMembers: jest.fn(),
  updateMemberRole: jest.fn(),
}));

jest.mock('../realtime/client', () => {
  const actual = jest.requireActual('../realtime/client');
  return {
    ...actual,
    realtimeClient: { connect: jest.fn(), open: jest.fn(), disconnect: jest.fn() },
  };
});

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

const mockApi = communitiesApi as jest.Mocked<typeof communitiesApi>;
const mockClient = client.realtimeClient as unknown as { connect: jest.Mock };

function makeSocket() {
  const listeners: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket = {
    on: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    off: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  };
  const emit = (event: string, payload?: unknown) =>
    (listeners[event] ?? []).forEach((cb) => cb(payload));
  return { socket, emit };
}

const community = {
  id: 'c1',
  name: 'Accra Tech',
  slug: 'accra-tech',
  description: 'Builders in Accra',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  memberCount: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  isMember: false,
  role: null,
};

const members = {
  items: [
    {
      communityId: 'c1',
      userId: 'u1',
      role: 'OWNER' as const,
      joinedAt: '2026-08-01T00:00:00.000Z',
      displayName: 'Ama',
      avatarUrl: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <CommunityDetailScreen
        navigation={navigation as never}
        route={{ params: { identifier: 'accra-tech' } } as never}
      />
    </QueryClientProvider>,
  );
}

function nav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

describe('CommunityDetailScreen', () => {
  let emit: (event: string, payload?: unknown) => void;
  let socket: ReturnType<typeof makeSocket>['socket'];

  beforeEach(() => {
    jest.clearAllMocks();
    const s = makeSocket();
    emit = s.emit;
    socket = s.socket;
    mockClient.connect.mockReturnValue(s.socket);
    mockApi.getCommunity.mockResolvedValue(community);
    mockApi.listCommunityMembers.mockResolvedValue(members);
  });

  it('renders the community and its members', async () => {
    await renderScreen(nav());

    expect(await screen.findByText('Accra Tech')).toBeOnTheScreen();
    expect(screen.getByText('Ama')).toBeOnTheScreen();
    expect(screen.getByText(/2 members/)).toBeOnTheScreen();
  });

  it('joins the community', async () => {
    mockApi.joinCommunity.mockResolvedValue({ ...community, isMember: true, role: 'MEMBER' });
    await renderScreen(nav());

    await fireEvent.press(await screen.findByRole('button', { name: 'Join community' }));
    await waitFor(() => expect(mockApi.joinCommunity).toHaveBeenCalledWith('accra-tech'));
  });

  it('subscribes to the community broadcast room on open', async () => {
    await renderScreen(nav());
    await screen.findByText('Accra Tech');
    // Joining the room is what makes the member list live-update for OTHER
    // users' join/leave/role changes, not just the current user's own.
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('community:subscribe', { communityId: 'c1' }),
    );
  });

  it('refetches detail + members on a matching community membership event', async () => {
    await renderScreen(nav());
    expect(await screen.findByText('Accra Tech')).toBeOnTheScreen();
    expect(mockApi.getCommunity).toHaveBeenCalledTimes(1);
    expect(mockApi.listCommunityMembers).toHaveBeenCalledTimes(1);

    // An event for a different community must be ignored...
    emit('community:member:joined', {
      communityId: 'other',
      userId: 'u9',
      role: 'MEMBER',
      at: '2026-08-04T00:00:00.000Z',
    });
    // ...while a matching one triggers a refetch of both queries.
    emit('community:member:joined', {
      communityId: 'c1',
      userId: 'u9',
      role: 'MEMBER',
      at: '2026-08-04T00:00:00.000Z',
    });

    await waitFor(() => expect(mockApi.getCommunity).toHaveBeenCalledTimes(2));
    expect(mockApi.listCommunityMembers).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes from community events on unmount', async () => {
    const view = await renderScreen(nav());
    expect(await screen.findByText('Accra Tech')).toBeOnTheScreen();
    expect(socket.on).toHaveBeenCalledWith('community:member:joined', expect.any(Function));

    view.unmount();
    await waitFor(() =>
      expect(socket.off).toHaveBeenCalledWith('community:member:joined', expect.any(Function)),
    );
    expect(socket.off).toHaveBeenCalledWith('community:member:left', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('community:member:role', expect.any(Function));
  });

  describe('role management', () => {
    const managedMembers = {
      items: [
        { ...members.items[0] }, // Ama, OWNER
        {
          communityId: 'c1',
          userId: 'u2',
          role: 'MEMBER' as const,
          joinedAt: '2026-08-02T00:00:00.000Z',
          displayName: 'Kofi',
          avatarUrl: null,
        },
        {
          communityId: 'c1',
          userId: 'u3',
          role: 'MODERATOR' as const,
          joinedAt: '2026-08-02T00:00:00.000Z',
          displayName: 'Yaa',
          avatarUrl: null,
        },
      ],
      total: 3,
      page: 1,
      pageSize: 20,
    };

    beforeEach(() => {
      mockApi.getCommunity.mockResolvedValue({ ...community, isMember: true, role: 'OWNER' });
      mockApi.listCommunityMembers.mockResolvedValue(managedMembers);
    });

    it('promotes a member to moderator', async () => {
      mockApi.updateMemberRole.mockResolvedValue(undefined);
      await renderScreen(nav());

      await fireEvent.press(await screen.findByRole('button', { name: 'Make moderator: Kofi' }));
      await waitFor(() =>
        expect(mockApi.updateMemberRole).toHaveBeenCalledWith('accra-tech', 'u2', 'MODERATOR'),
      );
    });

    it('demotes a moderator to member', async () => {
      mockApi.updateMemberRole.mockResolvedValue(undefined);
      await renderScreen(nav());

      await fireEvent.press(await screen.findByRole('button', { name: 'Remove moderator: Yaa' }));
      await waitFor(() =>
        expect(mockApi.updateMemberRole).toHaveBeenCalledWith('accra-tech', 'u3', 'MEMBER'),
      );
    });

    it('never offers a role control for the owner', async () => {
      await renderScreen(nav());

      expect(await screen.findByText('Kofi')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /moderator: Ama/ })).toBeNull();
    });

    it('hides role controls from non-managers', async () => {
      mockApi.getCommunity.mockResolvedValue({ ...community, isMember: true, role: 'MEMBER' });
      await renderScreen(nav());

      expect(await screen.findByText('Kofi')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /moderator:/ })).toBeNull();
    });
  });
});
