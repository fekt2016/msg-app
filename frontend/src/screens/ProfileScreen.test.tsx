import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider } from '../auth/AuthContext';
import * as usersApi from '../api/users';
import * as ImagePicker from 'expo-image-picker';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: (err: unknown) => Boolean((err as { response?: unknown })?.response),
  apiErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong. Please try again.',
}));

jest.mock('../api/auth', () => ({
  register: jest.fn(),
  resendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('../api/users', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));

jest.mock('../auth/deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const mockUsers = usersApi as jest.Mocked<typeof usersApi>;
const mockPicker = ImagePicker as unknown as { launchImageLibraryAsync: jest.Mock };

import { ProfileScreen } from './ProfileScreen';

const storedUser = {
  id: 'u1',
  displayName: 'Ama',
  email: 'ama@example.com',
  phone: null,
  role: 'USER',
  bio: 'Hello Ghana',
  avatar: null,
};

function renderProfile() {
  return render(
    <AuthProvider>
      <ProfileScreen />
    </AuthProvider>,
  );
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecure.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'eaz_access_token') return 'at';
      if (key === 'eaz_refresh_token') return 'rt';
      if (key === 'eaz_user') return JSON.stringify(storedUser);
      return null;
    });
    mockSecure.setItemAsync.mockResolvedValue(undefined);
    mockSecure.deleteItemAsync.mockResolvedValue(undefined);
  });

  it('renders the current profile values', async () => {
    await renderProfile();
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name').props.value).toBe('Ama');
    expect(screen.getByLabelText('Bio').props.value).toBe('Hello Ghana');
  });

  it('saves edits to the display name and bio', async () => {
    mockUsers.updateMyProfile.mockResolvedValue({
      ...storedUser,
      displayName: 'Ama Owusu',
      bio: 'Living in Accra',
    } as never);
    mockUsers.getMyProfile.mockResolvedValue({
      ...storedUser,
      displayName: 'Ama Owusu',
      bio: 'Living in Accra',
    } as never);

    await renderProfile();
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Ama Owusu');
    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Living in Accra');
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(mockUsers.updateMyProfile).toHaveBeenCalledWith({
        displayName: 'Ama Owusu',
        bio: 'Living in Accra',
      });
    });
    expect(await screen.findByText('Profile saved.')).toBeOnTheScreen();
  });

  it('uploads an avatar and refreshes the profile', async () => {
    mockUsers.uploadAvatar.mockResolvedValue({ ...storedUser } as never);
    mockUsers.getMyProfile.mockResolvedValue({
      ...storedUser,
      avatar: { publicId: 'p', url: 'https://cdn/p', width: 512, height: 512 },
    } as never);
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/avatar.jpg', fileName: 'avatar.jpg', mimeType: 'image/jpeg' }],
    });

    await renderProfile();
    await fireEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));

    await waitFor(() => {
      expect(mockUsers.uploadAvatar).toHaveBeenCalledWith({
        uri: 'file:///tmp/avatar.jpg',
        name: 'avatar.jpg',
        type: 'image/jpeg',
      });
    });
  });

  it('does nothing when the image picker is cancelled', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });

    await renderProfile();
    await fireEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));

    await waitFor(() => {
      expect(mockUsers.uploadAvatar).not.toHaveBeenCalled();
    });
  });
});
