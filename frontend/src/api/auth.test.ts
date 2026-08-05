import { apiClient } from './client';
import { login, logout, refresh, register, resendOtp, verifyOtp } from './auth';

jest.mock('./client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

const mockPost = apiClient.post as jest.Mock;

describe('auth api', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('registers and returns the userId', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { userId: 'u1' } } });
    const id = await register({ identifier: 'a@b.com', password: 'password123', displayName: 'A' });
    expect(id).toBe('u1');
    expect(mockPost).toHaveBeenCalledWith('/auth/register', {
      identifier: 'a@b.com',
      password: 'password123',
      displayName: 'A',
    });
  });

  it('resends an OTP', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { sent: true } } });
    await resendOtp({ identifier: 'a@b.com', purpose: 'VERIFY' });
    expect(mockPost).toHaveBeenCalledWith('/auth/resend-otp', {
      identifier: 'a@b.com',
      purpose: 'VERIFY',
    });
  });

  it('verifies an OTP and returns tokens + user', async () => {
    const payload = {
      user: {
        id: 'u1',
        displayName: 'A',
        role: 'USER',
        status: 'VERIFIED',
        isVerified: true,
        email: 'a@b.com',
        phone: null,
      },
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 900,
    };
    mockPost.mockResolvedValue({ data: { success: true, data: payload } });
    const result = await verifyOtp({
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      code: '123456',
      deviceId: 'd1',
    });
    expect(result.accessToken).toBe('at');
    expect(result.user.displayName).toBe('A');
    expect(mockPost).toHaveBeenCalledWith('/auth/verify-otp', {
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      code: '123456',
      deviceId: 'd1',
    });
  });

  it('logs in', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900, user: {} },
      },
    });
    const result = await login({ identifier: 'a@b.com', password: 'password123', deviceId: 'd1' });
    expect(result.accessToken).toBe('at');
  });

  it('refreshes a token pair', async () => {
    mockPost.mockResolvedValue({
      data: { success: true, data: { accessToken: 'at2', refreshToken: 'rt2', expiresIn: 900 } },
    });
    const result = await refresh('rt');
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt' });
    expect(result.accessToken).toBe('at2');
  });

  it('logs out', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { sent: true } } });
    await logout('rt');
    expect(mockPost).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'rt' });
  });
});
