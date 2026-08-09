import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as storiesHooks from '../hooks/useStories';
import { HomeScreen } from './HomeScreen';

// The feed sizes its pages from the window height; onLayout doesn't fire in the
// test env, so provide a fixed non-zero height for deterministic rendering.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
}));

jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  isApiError: () => false,
  apiErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.'),
}));

jest.mock('../realtime/client', () => ({
  realtimeClient: { connect: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })) },
  REALTIME_EVENTS: { STORY_NEW: 'story:new', STORY_DELETED: 'story:deleted' },
}));

jest.mock('../hooks/useStories', () => ({
  storyKeys: { feed: () => ['stories', 'feed'] },
  useStoryFeed: jest.fn(),
  useMarkStoryViewedInFeed: jest.fn(() => ({ mutate: jest.fn() })),
}));

const mockUseStoryFeed = storiesHooks.useStoryFeed as jest.Mock;

function story(id: string, caption: string) {
  return {
    id,
    authorId: `author-${id}`,
    media: { publicId: `p-${id}`, url: `https://cdn/${id}.jpg`, resourceType: 'IMAGE' as const },
    caption,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    hasViewed: false,
  };
}

function feedItem(authorId: string, displayName: string, stories: ReturnType<typeof story>[]) {
  return {
    author: { id: authorId, displayName, avatarUrl: null },
    stories,
    latestAt: new Date().toISOString(),
  };
}

async function renderHome(navigation: { navigate: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('HomeScreen (stories feed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders stories from the feed', async () => {
    mockUseStoryFeed.mockReturnValue({
      data: { items: [feedItem('author-1', 'Ama', [story('s1', 'Sunny in Accra')])] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { navigate: jest.fn() };
    await renderHome(navigation);

    expect(await screen.findByText('Ama')).toBeOnTheScreen();
    expect(screen.getByText('Sunny in Accra')).toBeOnTheScreen();
  });

  it('toggles the like icon on a story', async () => {
    mockUseStoryFeed.mockReturnValue({
      data: { items: [feedItem('author-1', 'Ama', [story('s1', 'Sunny in Accra')])] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { navigate: jest.fn() };
    await renderHome(navigation);

    await fireEvent.press(await screen.findByRole('button', { name: 'Like story' }));
    expect(screen.getByRole('button', { name: 'Unlike story' })).toBeOnTheScreen();
  });

  it('shows an empty state and opens the create screen', async () => {
    mockUseStoryFeed.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { navigate: jest.fn() };
    await renderHome(navigation);

    expect(screen.getByText('No stories yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Create your first story' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateStory');
  });

  it('recovers from a feed error by tapping to retry', async () => {
    const refetch = jest.fn();
    mockUseStoryFeed.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    const navigation = { navigate: jest.fn() };
    await renderHome(navigation);

    await fireEvent.press(screen.getByText(/Could not load stories/));
    expect(refetch).toHaveBeenCalled();
  });

  it('opens channels from the top bar', async () => {
    mockUseStoryFeed.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { navigate: jest.fn() };
    await renderHome(navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Open channels' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Channels');
  });
});
