import * as SecureStore from 'expo-secure-store';
import type { AvatarAsset } from '../api/auth';

const ACCESS_TOKEN_KEY = 'eaz_access_token';
const REFRESH_TOKEN_KEY = 'eaz_refresh_token';
const USER_KEY = 'eaz_user';

export interface StoredUser {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  bio?: string;
  avatar?: AvatarAsset | null;
}

export const tokenStorage = {
  async set(accessToken: string, refreshToken: string, user: StoredUser): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
  },

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async getUser(): Promise<StoredUser | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },

  async updateAccessToken(accessToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  },

  async updateTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  },
};
