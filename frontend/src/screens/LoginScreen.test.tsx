import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';

jest.mock('../api/client', () => ({
  apiClient: {
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

jest.mock('../auth/deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

const mockAuthApi = authApi as jest.Mocked<typeof authApi>;

import { LoginScreen } from './LoginScreen';

function renderLogin() {
  const navigation = { navigate: jest.fn() } as never;
  return render(
    <AuthProvider>
      <LoginScreen navigation={navigation} route={{} as never} />
    </AuthProvider>,
  );
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form', async () => {
    await renderLogin();
    expect(screen.getByText(/Welcome back/)).toBeOnTheScreen();
    expect(screen.getByText('Email or phone')).toBeOnTheScreen();
    expect(screen.getByText('Password')).toBeOnTheScreen();
  });

  it('disables submit until the form is valid', async () => {
    await renderLogin();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  });

  it('submits with identifier and password', async () => {
    mockAuthApi.login.mockResolvedValue({
      user: {
        id: 'u1',
        displayName: 'A',
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        email: 'a@b.com',
        phone: null,
        bio: '',
        avatar: null,
      },
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 900,
    });

    await renderLogin();
    await fireEvent.changeText(screen.getByLabelText('Email or phone'), 'a@b.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'password123');

    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).not.toBeDisabled();
    await fireEvent.press(button);

    await waitFor(() => {
      expect(mockAuthApi.login).toHaveBeenCalledWith({
        identifier: 'a@b.com',
        password: 'password123',
        deviceId: 'test-device-id',
      });
    });
  });
});
