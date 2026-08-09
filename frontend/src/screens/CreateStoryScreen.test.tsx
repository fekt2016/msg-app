import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { CreateStoryScreen } from './CreateStoryScreen';
import { useCreateStory } from '../hooks/useStories';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  isApiError: () => false,
  apiErrorMessage: () => 'Could not publish your story.',
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
    useCreateStory: jest.fn(),
  };
});

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockCreateStory = useCreateStory as unknown as jest.Mock;
const mockPicker = ImagePicker as unknown as { launchImageLibraryAsync: jest.Mock };

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <CreateStoryScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('CreateStoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes a picked image with a caption', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockCreateStory.mockReturnValue({ mutateAsync, isPending: false });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/story.jpg',
          fileName: 'story.jpg',
          mimeType: 'image/jpeg',
          type: 'image',
        },
      ],
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Pick a photo or video' }));
    expect(await screen.findByLabelText('Remove selected media')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Story caption'), 'Sunset over Accra');
    await fireEvent.press(screen.getByRole('button', { name: /Publish story/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        media: { uri: 'file:///tmp/story.jpg', name: 'story.jpg', type: 'image/jpeg' },
        caption: 'Sunset over Accra',
      });
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('requires a media selection before publishing', async () => {
    const mutateAsync = jest.fn();
    mockCreateStory.mockReturnValue({ mutateAsync, isPending: false });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: /Publish story/i }));

    expect(await screen.findByText('Pick a photo or video first.')).toBeOnTheScreen();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('surfaces a publish error', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error('Could not publish your story.'));
    mockCreateStory.mockReturnValue({ mutateAsync, isPending: false });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/story.jpg',
          fileName: 'story.jpg',
          mimeType: 'image/jpeg',
          type: 'image',
        },
      ],
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Pick a photo or video' }));
    expect(await screen.findByLabelText('Remove selected media')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Publish story/i }));

    expect(await screen.findByText('Could not publish your story.')).toBeOnTheScreen();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
