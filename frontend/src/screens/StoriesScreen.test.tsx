import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoriesScreen } from './StoriesScreen';
import * as client from '../realtime/client';
import { useStoryFeed } from '../hooks/useStories';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  isApiError: () => false,
  apiErrorMessage: () => 'Could not load stories.',
}));

jest.mock('../api/stories', () => ({
  createStory: jest.fn(),
  listStoryFeed: jest.fn(),
  getStory: jest.fn(),
  deleteStory: jest.fn(),
  markStoryViewed: jest.fn(),
  listStoryViewers: jest.fn(),
}));

jest.mock('../hooks/useStories', () => {
  const actual = jest.requireActual('../hooks/useStories');
  return {
    ...actual,
    useStoryFeed: jest.fn(),
    useCreateStory: jest.fn(),
    useDeleteStory: jest.fn(),
    useMarkStoryViewed: jest.fn(),
    useStory: jest.fn(),
    useStoryViewers: jest.fn(),
  };
});

jest.mock('../realtime/client', () => {
  const actual = jest.requireActual('../realtime/client');
  return {
    ...actual,
    realtimeClient: {
      connect: jest.fn(),
    },
  };
});

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', displayName: 'Ama' },
    logout: jest.fn(),
  }),
}));

const mockUseStoryFeed = useStoryFeed as unknown as jest.Mock;
const mockRealtimeClient = client.realtimeClient as unknown as { connect: jest.Mock };

const feedItem = {
  author: { id: 'u2', displayName: 'Kofi', avatarUrl: null },
  stories: [
    {
      id: 's1',
      authorId: 'u2',
      media: {
        publicId: 'story-1',
        url: 'https://cdn.test/s1.png',
        resourceType: 'IMAGE' as const,
      },
      caption: '',
      expiresAt: '2026-01-02T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasViewed: false,
    },
  ],
  latestAt: '2026-01-01T00:00:00.000Z',
};

function makeSocket() {
  const listeners: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket = {
    on: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    off: jest.fn(),
    emit: jest.fn(),
  };
  return socket;
}

function feedState(overrides: Partial<ReturnType<typeof mockUseStoryFeed>> = {}) {
  return {
    data: { items: [], total: 0, page: 1, pageSize: 20 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <StoriesScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('StoriesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStoryFeed.mockReturnValue(feedState());
    mockRealtimeClient.connect.mockReturnValue(makeSocket());
  });

  it('lists author rings and opens a viewer on press', async () => {
    mockUseStoryFeed.mockReturnValue(
      feedState({ data: { items: [feedItem], total: 1, page: 1, pageSize: 20 } }),
    );
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Kofi')).toBeOnTheScreen();
    expect(screen.getByText('1 story')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: "View Kofi's stories" }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryViewer', {
      authorId: 'u2',
      displayName: 'Kofi',
    });
  });

  it('routes the own ring to CreateStory', async () => {
    const ownItem = { ...feedItem, author: { id: 'u1', displayName: 'Ama', avatarUrl: null } };
    mockUseStoryFeed.mockReturnValue(
      feedState({ data: { items: [ownItem], total: 1, page: 1, pageSize: 20 } }),
    );
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: "View Ama's stories" }));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateStory');
  });

  it('shows an empty state when there are no stories', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('No stories yet — share the first one.')).toBeOnTheScreen();
  });

  it('shows an error state with a retry action', async () => {
    const refetch = jest.fn();
    mockUseStoryFeed.mockReturnValue(feedState({ data: undefined, isError: true, refetch }));
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Could not load stories.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('subscribes to story:new and story:deleted for live refresh', async () => {
    const socket = makeSocket();
    mockRealtimeClient.connect.mockReturnValue(socket);
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await waitFor(() => {
      expect(socket.on).toHaveBeenCalledWith(
        client.REALTIME_EVENTS.STORY_NEW,
        expect.any(Function),
      );
      expect(socket.on).toHaveBeenCalledWith(
        client.REALTIME_EVENTS.STORY_DELETED,
        expect.any(Function),
      );
    });
  });
});
