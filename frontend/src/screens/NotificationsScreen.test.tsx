import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsScreen } from './NotificationsScreen';
import * as notificationsApi from '../api/notifications';
import type { AppNotification } from '../api/notifications';

jest.mock('../api/notifications', () => ({
  listNotifications: jest.fn(),
  getUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const api = notificationsApi as jest.Mocked<typeof notificationsApi>;

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'chat:message',
    title: 'Ama',
    body: 'Sent you a message',
    data: { type: 'chat:message', senderId: 'u2', senderName: 'Ama' },
    readAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderScreen(navigation: { navigate: jest.Mock }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <NotificationsScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getUnreadNotificationCount.mockResolvedValue(0);
    api.markNotificationRead.mockImplementation(async (id: string) =>
      makeNotification({ id, readAt: '2026-09-02T00:00:00.000Z' }),
    );
  });

  it('marks a chat notification read and opens the conversation on tap', async () => {
    api.listNotifications.mockResolvedValue({ items: [makeNotification()], nextCursor: null });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);

    await fireEvent.press(await screen.findByRole('button', { name: /Ama/ }));

    expect(api.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      userId: 'u2',
      displayName: 'Ama',
    });
  });

  it('routes a community role notification to the community', async () => {
    api.listNotifications.mockResolvedValue({
      items: [
        makeNotification({
          id: 'n2',
          type: 'community:role',
          title: 'Accra Tech',
          body: 'You are now a moderator',
          data: { type: 'community:role', identifier: 'accra-tech' },
          readAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      nextCursor: null,
    });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);
    await fireEvent.press(await screen.findByRole('button', { name: /Accra Tech/ }));

    expect(navigation.navigate).toHaveBeenCalledWith('CommunityDetail', {
      identifier: 'accra-tech',
    });
    // Already read — no redundant mark-read call.
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('routes a channel post notification to the channel', async () => {
    api.listNotifications.mockResolvedValue({
      items: [
        makeNotification({
          type: 'channel:post:new',
          title: 'Accra News',
          body: 'Kofi posted a message',
          data: { type: 'channel:post:new', identifier: 'accra-news', postId: 'p1' },
        }),
      ],
      nextCursor: null,
    });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);
    await fireEvent.press(await screen.findByRole('button', { name: /Accra News/ }));

    expect(navigation.navigate).toHaveBeenCalledWith('ChannelDetail', { identifier: 'accra-news' });
  });

  it('routes a story-like notification to the author’s story viewer', async () => {
    api.listNotifications.mockResolvedValue({
      items: [
        makeNotification({
          type: 'story:liked',
          title: 'Kofi',
          body: 'Liked your story',
          data: { type: 'story:liked', storyId: 's1', authorId: 'u1', authorDisplayName: 'Ama' },
        }),
      ],
      nextCursor: null,
    });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);
    await fireEvent.press(await screen.findByRole('button', { name: /Kofi/ }));

    expect(navigation.navigate).toHaveBeenCalledWith('StoryViewer', {
      authorId: 'u1',
      displayName: 'Ama',
    });
  });

  it('shows an empty state when there are no notifications', async () => {
    api.listNotifications.mockResolvedValue({ items: [], nextCursor: null });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);

    expect(await screen.findByText(/No notifications yet/)).toBeOnTheScreen();
  });

  it('recovers from a failed load by tapping to retry', async () => {
    api.listNotifications
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({ items: [makeNotification()], nextCursor: null });
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);

    await fireEvent.press(
      await screen.findByRole('button', { name: /Could not load notifications/ }),
    );

    expect(await screen.findByText('Ama')).toBeOnTheScreen();
  });

  it('marks all notifications read from the header action', async () => {
    api.listNotifications.mockResolvedValue({ items: [makeNotification()], nextCursor: null });
    api.getUnreadNotificationCount.mockResolvedValue(1);
    api.markAllNotificationsRead.mockResolvedValue(1);
    const navigation = { navigate: jest.fn() };

    await renderScreen(navigation);

    await fireEvent.press(await screen.findByRole('button', { name: /Mark all notifications/ }));

    expect(api.markAllNotificationsRead).toHaveBeenCalled();
  });
});
