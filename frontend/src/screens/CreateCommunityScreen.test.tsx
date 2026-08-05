import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as communitiesApi from '../api/communities';
import { CreateCommunityScreen } from './CreateCommunityScreen';

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

const mockApi = communitiesApi as jest.Mocked<typeof communitiesApi>;

const community = {
  id: 'c1',
  name: 'Accra Tech',
  slug: 'accra-tech',
  description: 'Builders in Accra',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  memberCount: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function renderScreen(
  navigation: { navigate: jest.Mock; goBack: jest.Mock; replace: jest.Mock },
  params?: { identifier?: string },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <CreateCommunityScreen navigation={navigation as never} route={{ params } as never} />
    </QueryClientProvider>,
  );
}

function nav() {
  return { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
}

describe('CreateCommunityScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables submit until a name is entered', async () => {
    await renderScreen(nav());
    expect(screen.getByRole('button', { name: 'Create community' })).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Accra Tech Meetup'), 'Accra Tech');
    expect(screen.getByRole('button', { name: 'Create community' })).toBeEnabled();
  });

  it('creates a community and navigates to its detail', async () => {
    mockApi.createCommunity.mockResolvedValue({ community, role: 'OWNER' });
    const navigation = nav();
    await renderScreen(navigation);

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Accra Tech Meetup'), 'Accra Tech');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'Builders in Accra');
    await fireEvent.press(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() =>
      expect(mockApi.createCommunity).toHaveBeenCalledWith({
        name: 'Accra Tech',
        description: 'Builders in Accra',
        visibility: 'PUBLIC',
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('CommunityDetail', {
      identifier: 'accra-tech',
    });
  });

  it('surfaces an error when creation fails', async () => {
    mockApi.createCommunity.mockRejectedValue(new Error('Name already taken'));
    await renderScreen(nav());

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Accra Tech Meetup'), 'Accra Tech');
    await fireEvent.press(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText('Name already taken')).toBeOnTheScreen();
  });

  it('prefills fields and updates in edit mode', async () => {
    mockApi.getCommunity.mockResolvedValue({ ...community, isMember: true, role: 'OWNER' });
    mockApi.updateCommunity.mockResolvedValue({ ...community, name: 'Accra Builders' });
    const navigation = nav();
    await renderScreen(navigation, { identifier: 'accra-tech' });

    // Name prefilled from the loaded community.
    expect(await screen.findByDisplayValue('Accra Tech')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByDisplayValue('Accra Tech'), 'Accra Builders');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockApi.updateCommunity).toHaveBeenCalledWith('accra-tech', {
        name: 'Accra Builders',
        description: 'Builders in Accra',
        visibility: 'PUBLIC',
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('CommunityDetail', {
      identifier: 'accra-tech',
    });
  });
});
