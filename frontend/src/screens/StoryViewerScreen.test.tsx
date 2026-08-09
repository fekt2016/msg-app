import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '../realtime/client';
import { StoryViewerScreen } from './StoryViewerScreen';

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
  likeStory: jest.fn(),
  unlikeStory: jest.fn(),
}));

jest.mock('../hooks/useStories', () => {
  const actual = jest.requireActual('../hooks/useStories');
  return {
    ...actual,
    useStoryFeed: jest.fn(),
    useMarkStoryViewed: jest.fn(),
    useStoryViewers: jest.fn(),
    useLikeStory: jest.fn(),
    useUnlikeStory: jest.fn(),
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

import {
  useStoryFeed,
  useMarkStoryViewed,
  useStoryViewers,
  useLikeStory,
  useUnlikeStory,
} from '../hooks/useStories';

const mockUseStoryFeed = useStoryFeed as unknown as jest.Mock;
const mockMarkViewed = useMarkStoryViewed as unknown as jest.Mock;
const mockUseStoryViewers = useStoryViewers as unknown as jest.Mock;
const mockUseLikeStory = useLikeStory as unknown as jest.Mock;
const mockUseUnlikeStory = useUnlikeStory as unknown as jest.Mock;
const mockRealtimeClient = client.realtimeClient as unknown as { connect: jest.Mock };

let mutateViewed: jest.Mock;
let mutateLike: jest.Mock;
let mutateUnlike: jest.Mock;

const imageStory = {
  id: 's1',
  authorId: 'u2',
  media: { publicId: 'story-1', url: 'https://cdn.test/s1.png', resourceType: 'IMAGE' as const },
  caption: 'Sunset over Accra',
  expiresAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasViewed: false,
  hasLiked: false,
  likeCount: 2,
};

const videoStory = {
  id: 's2',
  authorId: 'u2',
  media: {
    publicId: 'story-2',
    url: 'https://cdn.test/s2.mp4',
    resourceType: 'VIDEO' as const,
    durationMs: 6000,
  },
  caption: '',
  expiresAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasViewed: false,
  hasLiked: false,
  likeCount: 0,
};

function feedState(authorId: string, stories: Array<typeof imageStory | typeof videoStory>) {
  return {
    data: {
      items: [
        {
          author: { id: authorId, displayName: 'Kofi', avatarUrl: null },
          stories,
          latestAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
    isLoading: false,
    isError: false,
  };
}

function makeSocket() {
  return {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };
}

async function renderViewer(
  navigation: { navigate: jest.Mock; goBack: jest.Mock },
  stories: Array<typeof imageStory | typeof videoStory> = [imageStory],
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockUseStoryFeed.mockReturnValue(feedState('u2', stories));
  mutateViewed = jest.fn();
  mockMarkViewed.mockReturnValue({ mutate: mutateViewed });
  mutateLike = jest.fn();
  mutateUnlike = jest.fn();
  mockUseLikeStory.mockReturnValue({ mutate: mutateLike });
  mockUseUnlikeStory.mockReturnValue({ mutate: mutateUnlike });
  mockUseStoryViewers.mockReturnValue({ data: undefined });
  mockRealtimeClient.connect.mockReturnValue(makeSocket());
  await render(
    <QueryClientProvider client={queryClient}>
      <StoryViewerScreen
        navigation={navigation as never}
        route={
          {
            params: { authorId: 'u2', displayName: 'Kofi' },
            key: 'x',
            name: 'StoryViewer',
          } as never
        }
      />
    </QueryClientProvider>,
  );
}

describe('StoryViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the first story and marks it viewed on open', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation);

    expect(await screen.findByText('Kofi')).toBeOnTheScreen();
    expect(screen.getByText('Sunset over Accra')).toBeOnTheScreen();
    expect(mutateViewed).toHaveBeenCalled();
  });

  it('does not mark an already-viewed story again', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [{ ...imageStory, hasViewed: true }]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();
    expect(mutateViewed).not.toHaveBeenCalled();
  });

  it('advances to the next story on tap-right', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [imageStory, videoStory]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Next story' }));
    await waitFor(() => {
      expect(mutateViewed).toHaveBeenCalled();
    });
  });

  it('closes when tapping next on the last story', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [imageStory]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close stories' }));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('goes back to the previous story on tap-left', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [imageStory, videoStory]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Next story' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Previous story' }));
    expect(screen.getByText('Sunset over Accra')).toBeOnTheScreen();
  });

  it('likes a story from the heart button', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [imageStory]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Like story' }));

    expect(mutateLike).toHaveBeenCalledWith('s1');
    expect(mutateUnlike).not.toHaveBeenCalled();
  });

  it('unlikes an already-liked story', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [{ ...imageStory, hasLiked: true, likeCount: 3 }]);

    expect(await screen.findByText('Sunset over Accra')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Unlike story' }));

    expect(mutateUnlike).toHaveBeenCalledWith('s1');
    expect(mutateLike).not.toHaveBeenCalled();
  });

  it('shows the like count on a story', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderViewer(navigation, [{ ...imageStory, likeCount: 5 }]);

    expect(await screen.findByText('5')).toBeOnTheScreen();
  });

  it('renders a fallback when the ring is gone', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockUseStoryFeed.mockReturnValue({ data: { items: [], total: 0, page: 1, pageSize: 20 } });
    mockMarkViewed.mockReturnValue({ mutate: jest.fn() });
    mockUseLikeStory.mockReturnValue({ mutate: jest.fn() });
    mockUseUnlikeStory.mockReturnValue({ mutate: jest.fn() });
    mockUseStoryViewers.mockReturnValue({ data: undefined });
    mockRealtimeClient.connect.mockReturnValue(makeSocket());
    await render(
      <QueryClientProvider client={queryClient}>
        <StoryViewerScreen
          navigation={navigation as never}
          route={
            {
              params: { authorId: 'u2', displayName: 'Kofi' },
              key: 'x',
              name: 'StoryViewer',
            } as never
          }
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('This story is no longer available.')).toBeOnTheScreen();
  });
});
