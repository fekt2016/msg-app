import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as communitiesApi from '../api/communities';
import * as groupsApi from '../api/groups';
import { CommunitiesScreen } from './CommunitiesScreen';

jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  isApiError: () => false,
  apiErrorMessage: () => 'Could not load communities.',
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

jest.mock('../api/groups', () => ({
  listGroups: jest.fn(),
  createGroup: jest.fn(),
  getGroup: jest.fn(),
  listGroupMembers: jest.fn(),
  addGroupMembers: jest.fn(),
  removeGroupMember: jest.fn(),
  leaveGroup: jest.fn(),
  deleteGroup: jest.fn(),
}));

const mockApi = communitiesApi as jest.Mocked<typeof communitiesApi>;
const mockGroupsApi = groupsApi as jest.Mocked<typeof groupsApi>;

const community = {
  id: 'c1',
  name: 'Accra Tech',
  slug: 'accra-tech',
  description: 'Builders in Accra',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  memberCount: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const group = {
  id: 'g1',
  name: 'Accra Devs',
  avatar: null,
  ownerId: 'u1',
  memberCount: 3,
  role: 'OWNER' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function renderScreen(navigation: { navigate: jest.Mock; goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <CommunitiesScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('CommunitiesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupsApi.listGroups.mockResolvedValue([]);
  });

  it('lists communities and opens one on press', async () => {
    mockApi.listCommunities.mockResolvedValue({
      items: [community],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Accra Tech')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Open Accra Tech' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CommunityDetail', {
      identifier: 'accra-tech',
    });
  });

  it('shows an empty state when there are no communities', async () => {
    mockApi.listCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    expect(await screen.findByText(/No communities yet/)).toBeOnTheScreen();
  });

  it('searches by query text', async () => {
    mockApi.listCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    await waitFor(() => expect(mockApi.listCommunities).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByLabelText('Search communities'), 'tech');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(mockApi.listCommunities).toHaveBeenCalledWith({ q: 'tech', page: 1, pageSize: 50 }),
    );
  });

  it('shows an error state and retries', async () => {
    mockApi.listCommunities.mockRejectedValue(new Error('boom'));
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    expect(await screen.findByText('Could not load communities.')).toBeOnTheScreen();

    mockApi.listCommunities.mockResolvedValue({
      items: [community],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Accra Tech')).toBeOnTheScreen();
  });

  it('lists groups and opens one on press', async () => {
    mockApi.listCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    mockGroupsApi.listGroups.mockResolvedValue([group]);
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Accra Devs')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Accra Devs' }));
    expect(navigation.navigate).toHaveBeenCalledWith('GroupChat', {
      groupId: 'g1',
      name: 'Accra Devs',
    });
  });

  it('navigates to create a group', async () => {
    mockApi.listCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    mockGroupsApi.listGroups.mockResolvedValue([]);
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText(/No groups yet/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Create a group' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateGroup');
  });

  it('shows an empty state for groups when there are none', async () => {
    mockApi.listCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    await renderScreen({ navigate: jest.fn(), goBack: jest.fn() });

    expect(await screen.findByText(/No groups yet/)).toBeOnTheScreen();
  });
});
