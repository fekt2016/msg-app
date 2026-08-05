import * as authApi from '../api/auth';
import { tokenStorage } from './tokenStorage';

/**
 * Exchanges the stored refresh token for a fresh access/refresh token pair and
 * persists it, returning the new access token.
 *
 * Shared by the REST 401-retry interceptor (`AuthContext`) and the realtime
 * socket's re-authentication path (`realtimeClient`) so both refresh through a
 * single implementation. Throws when no refresh token is stored or the refresh
 * request fails — callers decide how to surface a dead session (retry, logout).
 */
export async function refreshSession(): Promise<string> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  const result = await authApi.refresh(refreshToken);
  await tokenStorage.updateTokens(result.accessToken, result.refreshToken);
  return result.accessToken;
}
