import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient, isApiError } from '../api/client';
import * as authApi from '../api/auth';
import type { InternalAxiosRequestConfig } from 'axios';
import { getMyProfile } from '../api/users';
import type { OtpPurpose, SafeUser } from '../api/auth';
import { getDeviceId } from './deviceId';
import { tokenStorage, type StoredUser } from './tokenStorage';
import { refreshSession } from './refreshSession';
import { ensureE2eeKeysRegistered } from '../e2ee/ensureKeys';
import { flushOutbox, outboxStore } from '../e2ee/outbox';

const OUTBOX_FLUSH_INTERVAL_MS = 30_000;

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: StoredUser | null;
  deviceId: string | null;
  registerAndSendOtp: (input: {
    identifier: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  login: (input: { identifier: string; password: string }) => Promise<void>;
  verifyOtp: (input: { identifier: string; purpose: OtpPurpose; code: string }) => Promise<void>;
  resendOtp: (input: { identifier: string; purpose: OtpPurpose }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toStoredUser(user: SafeUser): StoredUser {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    bio: user.bio,
    avatar: user.avatar,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [storedUser, storedRefresh, id] = await Promise.all([
          tokenStorage.getUser(),
          tokenStorage.getRefreshToken(),
          getDeviceId(),
        ]);
        if (cancelled) return;
        setDeviceId(id);
        if (storedUser && storedRefresh) {
          setUser(storedUser);
          // E2EE bootstrap for a restored session: publish this device's public
          // bundle if it isn't up yet, and drain any messages queued while the
          // app was closed. Fire-and-forget — a hiccup must not block launch.
          void ensureE2eeKeysRegistered(storedUser.id).catch((err) => {
            console.error('[e2ee] key bootstrap failed:', err);
          });
          void flushOutbox(storedUser.id).catch((err) => {
            console.error('[outbox] flush failed:', err);
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once a session is active (login, OTP verify, or restore), periodically
  // drain the on-device outbox so a message queued for a contact without keys
  // (or for a dropped connection) goes out as soon as their keys or our network
  // return, without the user having to reopen the chat. The immediate flush
  // happens inside persistSession / the restore path above.
  useEffect(() => {
    if (!user?.id) return;
    const timer = setInterval(() => {
      void flushOutbox(user.id).catch((err) => {
        console.error('[outbox] flush failed:', err);
      });
    }, OUTBOX_FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user?.id]);

  // Attach the access token to every request.
  useEffect(() => {
    const interceptor = apiClient.interceptors.request.use(async (config) => {
      const accessToken = await tokenStorage.getAccessToken();
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });
    return () => apiClient.interceptors.request.eject(interceptor);
  }, []);

  // Refresh the access token once when a request fails with 401, then retry it.
  useEffect(() => {
    let refreshPromise: Promise<string> | null = null;

    const interceptor = apiClient.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        const status = isApiError(error) ? error.response?.status : undefined;
        const config = (isApiError(error) ? error.config : undefined) as
          (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

        const isAuthEndpoint = config?.url?.startsWith('/auth/');
        const canRefresh = status === 401 && config && !config._retried && !isAuthEndpoint;

        if (!canRefresh) {
          return Promise.reject(error);
        }

        config._retried = true;
        try {
          refreshPromise =
            refreshPromise ??
            refreshSession().finally(() => {
              refreshPromise = null;
            });
          const accessToken = await refreshPromise;
          config.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient.request(config);
        } catch {
          await tokenStorage.clear();
          setUser(null);
          return Promise.reject(error);
        }
      },
    );
    return () => apiClient.interceptors.response.eject(interceptor);
  }, []);

  const persistSession = useCallback(async (result: authApi.AuthResult) => {
    await tokenStorage.set(result.accessToken, result.refreshToken, toStoredUser(result.user));
    setUser(toStoredUser(result.user));
    // Keys at registration: complete the E2EE bootstrap as part of finishing
    // sign-in so the account is messageable immediately (a public bundle must
    // exist before anyone can encrypt to us). Best effort — a transient upload
    // failure must not block auth; the interval and the outbox retry it.
    await ensureE2eeKeysRegistered(result.user.id).catch((err) => {
      console.error('[e2ee] key bootstrap failed:', err);
    });
    void flushOutbox(result.user.id).catch((err) => {
      console.error('[outbox] flush failed:', err);
    });
  }, []);

  const registerAndSendOtp = useCallback(
    async (input: { identifier: string; password: string; displayName: string }) => {
      await authApi.register(input);
    },
    [],
  );

  const login = useCallback(
    async (input: { identifier: string; password: string }) => {
      const id = deviceId ?? (await getDeviceId());
      setDeviceId(id);
      const result = await authApi.login({ ...input, deviceId: id });
      await persistSession(result);
    },
    [deviceId, persistSession],
  );

  const verifyOtp = useCallback(
    async (input: { identifier: string; purpose: OtpPurpose; code: string }) => {
      const id = deviceId ?? (await getDeviceId());
      setDeviceId(id);
      const result = await authApi.verifyOtp({ ...input, deviceId: id });
      await persistSession(result);
    },
    [deviceId, persistSession],
  );

  const resendOtp = useCallback(async (input: { identifier: string; purpose: OtpPurpose }) => {
    await authApi.resendOtp(input);
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch (err) {
      // Best effort — the session is cleared locally regardless.
      if (isApiError(err) && err.response?.status === 401) {
        // Refresh token already invalid; nothing to revoke server-side.
      }
    } finally {
      await tokenStorage.clear();
      // Queued drafts are plaintext held on this device for the current user —
      // never leave them readable by whoever signs in next on the same device.
      await outboxStore.clear();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await getMyProfile();
    const next = toStoredUser(profile);
    setUser(next);
    const refreshToken = await tokenStorage.getRefreshToken();
    const accessToken = await tokenStorage.getAccessToken();
    if (refreshToken && accessToken) {
      await tokenStorage.set(accessToken, refreshToken, next);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: user !== null,
      user,
      deviceId,
      registerAndSendOtp,
      login,
      verifyOtp,
      resendOtp,
      logout,
      refreshProfile,
    }),
    [
      isLoading,
      user,
      deviceId,
      registerAndSendOtp,
      login,
      verifyOtp,
      resendOtp,
      logout,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
