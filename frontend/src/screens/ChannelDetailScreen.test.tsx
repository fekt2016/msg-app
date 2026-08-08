import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as channelsApi from '../api/channels';
import * as client from '../realtime/client';
import { ChannelDetailScreen } from './ChannelDetailScreen';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  isApiError: () => false,
  apiErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.'),
}));

jest.mock('../api/channels', () => {
  const actual = jest.requireActual('../api/channels');
  return {
    ...actual,
    createChannel: jest.fn(),
    listChannels: jest.fn(),
    listMyChannels: jest.fn(),
    getChannel: jest.fn(),
    updateChannel: jest.fn(),
    deleteChannel: jest.fn(),
    subscribeToChannel: jest.fn(),
    unsubscribeFromChannel: jest.fn(),
    listChannelSubscribers: jest.fn(),
    updateSubscriberRole: jest.fn(),
    createInvite: jest.fn(),
    listInvites: jest.fn(),
    revokeInvite: jest.fn(),
    previewInvite: jest.fn(),
    joinViaInvite: jest.fn(),
    requestToJoin: jest.fn(),
    listJoinRequests: jest.fn(),
    decideJoinRequest: jest.fn(),
    createPost: jest.fn(),
    listPosts: jest.fn(),
    getPost: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    addPostImage: jest.fn(),
    setReaction: jest.fn(),
    removeReaction: jest.fn(),
  };
});

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, signIn: jest.fn(), signOut: jest.fn() }),
}));

jest.mock('../realtime/client', () => {
  const actual = jest.requireActual('../realtime/client');
  return {
    ...actual,
    realtimeClient: { connect: jest.fn(), open: jest.fn(), disconnect: jest.fn() },
  };
});

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

const mockApi = channelsApi as jest.Mocked<typeof channelsApi>;
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

const channel = {
  id: 'ch1',
  name: 'Accra Announcements',
  slug: 'accra-announcements',
  description: 'Official city updates',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  subscriberCount: 2,
  postCount: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  isSubscribed: true,
  role: 'SUBSCRIBER' as const,
};

const post = {
  id: 'p1',
  channelId: 'ch1',
  authorId: 'u1',
  body: 'Hello Accra',
  images: [],
  reactionCounts: {},
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  author: { displayName: 'Ama', avatarUrl: null },
};

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <ChannelDetailScreen
        navigation={navigation as never}
        route={{ params: { identifier: 'accra-announcements' } } as never}
      />
    </QueryClientProvider>,
  );
}

function nav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

describe('ChannelDetailScreen', () => {
  let emit: (event: string, payload?: unknown) => void;
  let socket: ReturnType<typeof makeSocket>['socket'];

  beforeEach(() => {
    jest.clearAllMocks();
    const s = makeSocket();
    emit = s.emit;
    socket = s.socket;
    mockClient.connect.mockReturnValue(s.socket);
    mockApi.getChannel.mockResolvedValue(channel);
    mockApi.listPosts.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('renders the channel header and posts', async () => {
    mockApi.listPosts.mockResolvedValue({ items: [post], nextCursor: null });
    await renderScreen(nav());

    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();
    expect(screen.getByText('Hello Accra')).toBeOnTheScreen();
    expect(screen.getByText(/2 subscribers/)).toBeOnTheScreen();
  });

  it('joins the channel broadcast room on open', async () => {
    await renderScreen(nav());
    await screen.findByText('Accra Announcements');

    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('channel:subscribe', { channelId: 'ch1' }),
    );
  });

  it('subscribes to a public channel', async () => {
    mockApi.getChannel.mockResolvedValue({ ...channel, isSubscribed: false, role: null });
    await renderScreen(nav());

    await fireEvent.press(await screen.findByRole('button', { name: 'Subscribe' }));
    await waitFor(() =>
      expect(mockApi.subscribeToChannel).toHaveBeenCalledWith('accra-announcements'),
    );
  });

  it('unsubscribes from a channel', async () => {
    await renderScreen(nav());

    await fireEvent.press(await screen.findByRole('button', { name: 'Unsubscribe' }));
    await waitFor(() =>
      expect(mockApi.unsubscribeFromChannel).toHaveBeenCalledWith('accra-announcements'),
    );
  });

  it('refetches the feed on a matching channel post event', async () => {
    await renderScreen(nav());
    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();
    expect(mockApi.listPosts).toHaveBeenCalledTimes(1);

    emit('channel:post:new', { channelId: 'other', postId: 'p9' });
    emit('channel:post:new', { channelId: 'ch1', postId: 'p2' });

    await waitFor(() => expect(mockApi.listPosts).toHaveBeenCalledTimes(2));
  });

  it('unsubscribes from channel events on unmount', async () => {
    const view = await renderScreen(nav());
    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();
    expect(socket.on).toHaveBeenCalledWith('channel:post:new', expect.any(Function));

    view.unmount();
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('channel:unsubscribe', { channelId: 'ch1' }),
    );
    expect(socket.off).toHaveBeenCalledWith('channel:post:new', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('channel:post:reaction', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('channel:subscriber:joined', expect.any(Function));
  });

  it('navigates away when the channel is soft-deleted', async () => {
    const navigation = nav();
    await renderScreen(navigation);
    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();

    emit('channel:deleted', { channelId: 'ch1' });
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('lets a manager open the composer and join-request queue', async () => {
    mockApi.getChannel.mockResolvedValue({ ...channel, role: 'OWNER' });
    const navigation = nav();
    await renderScreen(navigation);

    await fireEvent.press(await screen.findByRole('button', { name: '+ New post' }));
    expect(navigation.navigate).toHaveBeenCalledWith('ChannelPostComposer', {
      identifier: 'accra-announcements',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Join requests' }));
    expect(navigation.navigate).toHaveBeenCalledWith('JoinRequests', {
      identifier: 'accra-announcements',
    });
  });

  it('hides manager controls from subscribers', async () => {
    await renderScreen(nav());

    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '+ New post' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Join requests' })).toBeNull();
  });

  it('deletes a post the current user authored', async () => {
    mockApi.listPosts.mockResolvedValue({ items: [post], nextCursor: null });
    await renderScreen(nav());

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete post' }));
    await waitFor(() =>
      expect(mockApi.deletePost).toHaveBeenCalledWith('accra-announcements', 'p1'),
    );
  });
});
