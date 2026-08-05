import * as SecureStore from 'expo-secure-store';
import type {
  E2eeKeyBundle,
  E2eeIdentityKey,
  E2eeSignedPreKey,
  E2eePreKey,
  E2eeOneTimePreKey,
} from './types.js';

const IDENTITY_KEY_KEY = 'e2ee_identity_key';
const SIGNED_PRE_KEY_KEY = 'e2ee_signed_pre_key';
const PRE_KEYS_KEY = 'e2ee_pre_keys';
const ONE_TIME_PRE_KEYS_KEY = 'e2ee_one_time_pre_keys';
const KEY_BUNDLE_KEY = 'e2ee_key_bundle';

export const keyStore = {
  async saveKeyBundle(bundle: E2eeKeyBundle): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(IDENTITY_KEY_KEY, JSON.stringify(bundle.identityKey)),
      SecureStore.setItemAsync(SIGNED_PRE_KEY_KEY, JSON.stringify(bundle.signedPreKey)),
      SecureStore.setItemAsync(PRE_KEYS_KEY, JSON.stringify(bundle.preKeys)),
      SecureStore.setItemAsync(ONE_TIME_PRE_KEYS_KEY, JSON.stringify(bundle.oneTimePreKeys)),
      SecureStore.setItemAsync(KEY_BUNDLE_KEY, JSON.stringify(bundle)),
    ]);
  },

  async getKeyBundle(): Promise<E2eeKeyBundle | null> {
    const raw = await SecureStore.getItemAsync(KEY_BUNDLE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as E2eeKeyBundle;
    } catch {
      return null;
    }
  },

  async getIdentityKey(): Promise<E2eeIdentityKey | null> {
    const raw = await SecureStore.getItemAsync(IDENTITY_KEY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as E2eeIdentityKey;
    } catch {
      return null;
    }
  },

  async getSignedPreKey(): Promise<E2eeSignedPreKey | null> {
    const raw = await SecureStore.getItemAsync(SIGNED_PRE_KEY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as E2eeSignedPreKey;
    } catch {
      return null;
    }
  },

  async getPreKeys(): Promise<E2eePreKey[] | null> {
    const raw = await SecureStore.getItemAsync(PRE_KEYS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as E2eePreKey[];
    } catch {
      return null;
    }
  },

  async getOneTimePreKeys(): Promise<E2eeOneTimePreKey[] | null> {
    const raw = await SecureStore.getItemAsync(ONE_TIME_PRE_KEYS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as E2eeOneTimePreKey[];
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(IDENTITY_KEY_KEY),
      SecureStore.deleteItemAsync(SIGNED_PRE_KEY_KEY),
      SecureStore.deleteItemAsync(PRE_KEYS_KEY),
      SecureStore.deleteItemAsync(ONE_TIME_PRE_KEYS_KEY),
      SecureStore.deleteItemAsync(KEY_BUNDLE_KEY),
    ]);
  },
};
