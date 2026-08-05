import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as groupsApi from '../api/groups';
import * as usersApi from '../api/users';
import { CreateGroupScreen } from './CreateGroupScreen';

jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

jest.mock('../api/groups', () => ({
  createGroup: jest.fn(),
  listGroups: jest.fn(),
  getGroup: jest.fn(),
  listGroupMembers: jest.fn(),
  addGroupMembers: jest.fn(),
  removeGroupMember: jest.fn(),
  leaveGroup: jest.fn(),
  deleteGroup: jest.fn(),
}));

jest.mock('../api/users', () => ({
  listUsers: jest.fn(),
}));

const mockGroups = groupsApi as jest.Mocked<typeof groupsApi>;
const mockUsers = usersApi as jest.Mocked<typeof usersApi>;

async function renderScreen(navigation: {
  navigate: jest.Mock;
  goBack: jest.Mock;
  replace: jest.Mock;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <CreateGroupScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('CreateGroupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a group with a name and selected members', async () => {
    mockUsers.listUsers.mockResolvedValue([
      { id: 'u2', displayName: 'Bob', phoneNumber: null, email: null, avatar: null },
    ] as never);
    mockGroups.createGroup.mockResolvedValue({
      id: 'g9',
      name: 'Weekend',
      avatar: null,
      ownerId: 'me',
      memberCount: 2,
      role: 'OWNER',
      createdAt: '',
      updatedAt: '',
    });
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    await renderScreen(navigation);

    expect(await screen.findByText('Bob')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Weekend');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bob' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() =>
      expect(mockGroups.createGroup).toHaveBeenCalledWith({ name: 'Weekend', memberIds: ['u2'] }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('GroupChat', {
      groupId: 'g9',
      name: 'Weekend',
    });
  });

  it('validates that a name is required', async () => {
    mockUsers.listUsers.mockResolvedValue([] as never);
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByText('Give your group a name.')).toBeOnTheScreen();
    expect(mockGroups.createGroup).not.toHaveBeenCalled();
  });
});
