import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

import { OtpScreen } from './OtpScreen';

const route = {
  params: { identifier: 'a@b.com', purpose: 'VERIFY' as const },
} as never;

function renderOtp() {
  const navigation = { goBack: jest.fn() } as never;
  return render(
    <AuthProvider>
      <OtpScreen navigation={navigation} route={route} />
    </AuthProvider>,
  );
}

describe('OtpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the code entry', async () => {
    await renderOtp();
    expect(screen.getByText(/Verify it's you/)).toBeOnTheScreen();
    expect(screen.getByLabelText('6-digit verification code')).toBeOnTheScreen();
  });

  it('auto-submits when the 6th digit is entered', async () => {
    mockAuthApi.verifyOtp.mockResolvedValue({
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

    await renderOtp();
    await fireEvent.changeText(screen.getByLabelText('6-digit verification code'), '123456');

    await waitFor(() => {
      expect(mockAuthApi.verifyOtp).toHaveBeenCalledWith({
        identifier: 'a@b.com',
        purpose: 'VERIFY',
        code: '123456',
        deviceId: 'test-device-id',
      });
    });
  });

  it('resends after the cooldown elapses', async () => {
    mockAuthApi.resendOtp.mockResolvedValue(undefined);

    await renderOtp();
    await fireEvent.press(screen.getByRole('button', { name: /Resend code in/ }));

    expect(mockAuthApi.resendOtp).not.toHaveBeenCalled();

    for (let i = 0; i < 31; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    }

    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() => {
      expect(mockAuthApi.resendOtp).toHaveBeenCalledWith({
        identifier: 'a@b.com',
        purpose: 'VERIFY',
      });
    });
  });
});
