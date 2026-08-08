import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { copyToClipboard } from '../utils/clipboard';
import * as channelsApi from '../api/channels';
import { InvitesScreen } from './InvitesScreen';

jest.mock('../utils/clipboard', () => ({
  copyToClipboard: jest.fn(async () => true),
}));

const mockCopyToClipboard = copyToClipboard as jest.MockedFunction<typeof copyToClipboard>;

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
    createInvite: jest.fn(),
    listInvites: jest.fn(),
    revokeInvite: jest.fn(),
    listPosts: jest.fn(),
    getChannel: jest.fn(),
  };
});

const mockApi = channelsApi as jest.Mocked<typeof channelsApi>;

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const navigation = { goBack: jest.fn() };
  const route = { params: { identifier: 'accra-announcements' } };
  return await render(
    <QueryClientProvider client={queryClient}>
      <InvitesScreen navigation={navigation as never} route={route as never} />
    </QueryClientProvider>,
  );
}

const inviteRow = {
  id: 'inv1',
  channelId: 'ch1',
  createdBy: 'u1',
  role: 'SUBSCRIBER' as const,
  expiresAt: '2026-08-20T00:00:00.000Z',
  usedCount: 0,
  maxUses: 1,
  revokedAt: null,
  createdAt: '2026-08-08T00:00:00.000Z',
};

describe('InvitesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listInvites.mockResolvedValue([]);
    mockApi.revokeInvite.mockResolvedValue(undefined);
  });

  it('lists active invites', async () => {
    mockApi.listInvites.mockResolvedValue([
      { ...inviteRow, role: 'ADMIN', maxUses: 5, usedCount: 1 },
    ]);

    await renderScreen();

    expect(await screen.findByText('ADMIN')).toBeOnTheScreen();
    expect(screen.getByText(/Up to 5 uses/)).toBeOnTheScreen();
    expect(screen.getByText(/Used 1 time/)).toBeOnTheScreen();
  });

  it('creates an invite and copies the token to the clipboard', async () => {
    mockApi.listInvites.mockResolvedValue([]);
    mockApi.createInvite.mockResolvedValue({
      token: 'tok-abc',
      invite: { ...inviteRow, id: 'inv2' },
    });

    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Create invite link' }));

    expect(await screen.findByText('https://eazcommunity.app/join/tok-abc')).toBeOnTheScreen();
    await waitFor(() =>
      expect(mockCopyToClipboard).toHaveBeenCalledWith('https://eazcommunity.app/join/tok-abc'),
    );
  });

  it('revokes an invite', async () => {
    mockApi.listInvites.mockResolvedValue([inviteRow]);

    await renderScreen();

    await fireEvent.press(await screen.findByLabelText('Revoke invite for SUBSCRIBER'));

    await waitFor(() =>
      expect(mockApi.revokeInvite).toHaveBeenCalledWith('accra-announcements', 'inv1'),
    );
  });

  it('shows an empty state when there are no invites', async () => {
    mockApi.listInvites.mockResolvedValue([]);

    await renderScreen();

    expect(
      await screen.findByText('No active invites. Create one above to invite members.'),
    ).toBeOnTheScreen();
  });
});
