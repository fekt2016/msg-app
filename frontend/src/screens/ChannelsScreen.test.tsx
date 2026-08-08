import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as channelsApi from '../api/channels';
import { ChannelsScreen } from './ChannelsScreen';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  isApiError: () => false,
  apiErrorMessage: () => 'Could not load channels.',
}));

jest.mock('../api/channels', () => ({
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
}));

const mockApi = channelsApi as jest.Mocked<typeof channelsApi>;

const channel = {
  id: 'ch1',
  name: 'Accra Announcements',
  slug: 'accra-announcements',
  description: 'Official city updates',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  subscriberCount: 12,
  postCount: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  isSubscribed: true,
  role: 'SUBSCRIBER' as const,
};

const withRole = (role: 'OWNER' | 'ADMIN' | 'SUBSCRIBER') => ({ ...channel, role });

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <ChannelsScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('ChannelsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listChannels.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    mockApi.listMyChannels.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it('lists channels and opens one on press', async () => {
    mockApi.listChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Open Accra Announcements' }));
    expect(navigation.navigate).toHaveBeenCalledWith('ChannelDetail', {
      identifier: 'accra-announcements',
    });
  });

  it('shows my channels section', async () => {
    mockApi.listMyChannels.mockResolvedValue({
      items: [withRole('OWNER')],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('My channels')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Open my channel Accra Announcements' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('ChannelDetail', {
      identifier: 'accra-announcements',
    });
  });

  it('searches by query text', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    await waitFor(() => expect(mockApi.listChannels).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByLabelText('Search channels'), 'announce');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(mockApi.listChannels).toHaveBeenCalledWith({ q: 'announce', page: 1, pageSize: 50 }),
    );
  });

  it('shows an error state and retries', async () => {
    mockApi.listChannels.mockRejectedValue(new Error('boom'));
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    expect(await screen.findByText('Could not load channels.')).toBeOnTheScreen();

    mockApi.listChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Accra Announcements')).toBeOnTheScreen();
  });

  it('shows an empty state when there are no channels', async () => {
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    expect(await screen.findByText(/No public channels yet/)).toBeOnTheScreen();
  });

  it('navigates to create a channel', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText(/No public channels yet/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '+ Create a channel' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateChannel');
  });

  it('navigates to join with an invite token', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText(/No public channels yet/)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Have an invite? Join with a token' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('InviteJoin');
  });
});
