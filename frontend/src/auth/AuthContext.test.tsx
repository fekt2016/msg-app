import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import * as authApi from '../api/auth';
import { ensureE2eeKeysRegistered } from '../e2ee/ensureKeys';
import { flushOutbox, outboxStore } from '../e2ee/outbox';

let responseInterceptor: ((error: unknown) => unknown) | undefined;
jest.mock('../api/client', () => ({
  apiClient: {
    post: jest.fn(),
    request: jest.fn(async (config: unknown) => config),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: {
        use: jest.fn((_onFulfilled: unknown, onRejected: (error: unknown) => unknown) => {
          responseInterceptor = onRejected;
          return 2;
        }),
        eject: jest.fn(),
      },
    },
  },
  isApiError: (err: unknown) => Boolean((err as { response?: unknown })?.response),
}));

jest.mock('../api/auth', () => ({
  register: jest.fn(),
  resendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
}));

jest.mock('./deviceId', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

jest.mock('../e2ee/ensureKeys', () => ({
  ensureE2eeKeysRegistered: jest.fn(async () => undefined),
  restoreE2eeKeys: jest.fn(async () => undefined),
}));

jest.mock('../e2ee/outbox', () => ({
  flushOutbox: jest.fn(async () => ({ sentIds: [], failedIds: [] })),
  outboxStore: {
    list: jest.fn(async () => []),
    enqueue: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const mockAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockEnsureKeys = ensureE2eeKeysRegistered as jest.Mock;
const mockFlushOutbox = flushOutbox as jest.Mock;
const mockOutboxStore = outboxStore as unknown as { clear: jest.Mock };

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const authResult = {
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
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecure.getItemAsync.mockResolvedValue(null);
    mockSecure.setItemAsync.mockResolvedValue(undefined);
    mockSecure.deleteItemAsync.mockResolvedValue(undefined);
  });

  it('restores a stored session', async () => {
    mockSecure.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_refresh_token') return Promise.resolve('rt');
      if (key === 'eaz_user') return Promise.resolve('{"id":"u1","displayName":"A","role":"USER"}');
      return Promise.resolve(null);
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.displayName).toBe('A');
  });

  it('starts unauthenticated when no session is stored', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logs in, persists tokens, and authenticates', async () => {
    mockAuthApi.login.mockResolvedValue(authResult);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.login({ identifier: 'a@b.com', password: 'password123' });
    });

    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('eaz_access_token', 'at');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('u1');
  });

  it('verifies an OTP to complete registration', async () => {
    mockAuthApi.verifyOtp.mockResolvedValue(authResult);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.verifyOtp({ identifier: 'a@b.com', purpose: 'VERIFY', code: '123456' });
    });

    expect(mockAuthApi.verifyOtp).toHaveBeenCalledWith({
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      code: '123456',
      deviceId: 'test-device-id',
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('publishes E2EE keys as part of completing registration (OTP verify)', async () => {
    mockAuthApi.verifyOtp.mockResolvedValue(authResult);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      await result.current.verifyOtp({ identifier: 'a@b.com', purpose: 'VERIFY', code: '123456' });
    });

    // The account is messageable immediately — its public bundle is uploaded
    // before sign-in resolves, and any queued drafts are flushed.
    expect(mockEnsureKeys).toHaveBeenCalledWith('u1');
    expect(mockFlushOutbox).toHaveBeenCalledWith('u1');
  });

  it('registers without authenticating (OTP still pending)', async () => {
    mockAuthApi.register.mockResolvedValue('u1');

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.registerAndSendOtp({
        identifier: 'a@b.com',
        password: 'password123',
        displayName: 'A',
      });
    });

    expect(mockAuthApi.register).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logs out, revoking server-side and clearing local state', async () => {
    mockAuthApi.login.mockResolvedValue(authResult);
    mockAuthApi.logout.mockResolvedValue(undefined);
    mockSecure.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_refresh_token') return Promise.resolve('rt');
      return Promise.resolve(null);
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      await result.current.login({ identifier: 'a@b.com', password: 'password123' });
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(mockAuthApi.logout).toHaveBeenCalledWith('rt');
    expect(mockSecure.deleteItemAsync).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    // Queued plaintext drafts never survive the session for the next user.
    expect(mockOutboxStore.clear).toHaveBeenCalled();
  });

  it('refreshes the access token and retries a request that failed with 401', async () => {
    mockSecure.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_access_token') return Promise.resolve('at-expired');
      if (key === 'eaz_refresh_token') return Promise.resolve('rt');
      if (key === 'eaz_user') return Promise.resolve('{"id":"u1","displayName":"A","role":"USER"}');
      return Promise.resolve(null);
    });
    mockAuthApi.refresh.mockResolvedValue({
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      expiresIn: 900,
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);

    const rejected = {
      response: { status: 401 },
      config: { url: '/users/match-contacts', headers: { Authorization: 'Bearer at-expired' } },
    };

    let retried: unknown;
    await act(async () => {
      retried = await (responseInterceptor as (e: unknown) => unknown)(rejected);
    });

    expect(mockAuthApi.refresh).toHaveBeenCalledWith('rt');
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('eaz_access_token', 'at-new');
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('eaz_refresh_token', 'rt-new');
    expect(retried).toBe(rejected.config);
  });

  it('clears the session when the refresh token is also invalid', async () => {
    mockSecure.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_access_token') return Promise.resolve('at-expired');
      if (key === 'eaz_refresh_token') return Promise.resolve('rt-invalid');
      if (key === 'eaz_user') return Promise.resolve('{"id":"u1","displayName":"A","role":"USER"}');
      return Promise.resolve(null);
    });
    mockAuthApi.refresh.mockRejectedValue({
      response: { status: 401 },
      config: { url: '/auth/refresh' },
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);

    const rejected = {
      response: { status: 401 },
      config: { url: '/users/match-contacts', headers: { Authorization: 'Bearer at-expired' } },
    };

    let interceptorErr: unknown;
    await act(async () => {
      try {
        await (responseInterceptor as (e: unknown) => unknown)(rejected);
      } catch (e) {
        interceptorErr = e;
      }
    });
    expect(interceptorErr).toBe(rejected);

    expect(mockSecure.deleteItemAsync).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('does not refresh auth endpoints', async () => {
    mockSecure.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_refresh_token') return Promise.resolve('rt');
      return Promise.resolve(null);
    });

    await renderHook(() => useAuth(), { wrapper });
    await act(async () => {});

    const rejected = {
      response: { status: 401 },
      config: { url: '/auth/login', headers: {} },
    };

    let interceptorErr: unknown;
    await act(async () => {
      try {
        await (responseInterceptor as (e: unknown) => unknown)(rejected);
      } catch (e) {
        interceptorErr = e;
      }
    });
    expect(interceptorErr).toBe(rejected);

    expect(mockAuthApi.refresh).not.toHaveBeenCalled();
  });
});
