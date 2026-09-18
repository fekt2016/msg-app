import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Constants from 'expo-constants';
import { ensurePushRegistered, unregisterPush } from './registerPush';
import * as pushApi from '../api/push';

jest.mock('../api/push', () => ({
  registerDevice: jest.fn(async () => ({})),
  unregisterDevice: jest.fn(async () => undefined),
}));

// Override the global (isDevice: false) so the happy path runs; individual
// tests flip it back to false to assert the no-op guard.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));

// Provide an EAS projectId so `resolveProjectId` resolves and the guard that
// skips registration without one doesn't short-circuit the happy path.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } },
}));

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;
const deleteItem = SecureStore.deleteItemAsync as jest.Mock;
const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const getToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const registerDevice = pushApi.registerDevice as jest.Mock;
const unregisterDevice = pushApi.unregisterDevice as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (Device as { isDevice: boolean }).isDevice = true;
  getItem.mockResolvedValue(null);
  getPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
  getToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
});

describe('ensurePushRegistered', () => {
  it('is a no-op on a simulator/emulator (not a physical device)', async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    await ensurePushRegistered('u1', 'dev-1');
    expect(getToken).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('is a no-op when permission is denied and cannot be re-requested', async () => {
    getPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });
    await ensurePushRegistered('u1', 'dev-1');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('requests permission when undetermined, then registers the token', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    requestPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });

    await ensurePushRegistered('u1', 'dev-1');

    expect(requestPermissions).toHaveBeenCalled();
    expect(registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'dev-1', pushToken: 'ExponentPushToken[abc]' }),
    );
    // Records the token so a later call can skip the network.
    expect(setItem).toHaveBeenCalledWith('eaz_push_token_u1', 'ExponentPushToken[abc]');
  });

  it('skips the network call when the token is unchanged since last registration', async () => {
    getItem.mockResolvedValue('ExponentPushToken[abc]');
    await ensurePushRegistered('u1', 'dev-1');
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('re-registers when Expo rotated the token', async () => {
    getItem.mockResolvedValue('ExponentPushToken[old]');
    await ensurePushRegistered('u1', 'dev-1');
    expect(registerDevice).toHaveBeenCalled();
  });

  it('is a no-op when no EAS projectId is available and warns with an actionable hint', async () => {
    // Simulate a dev build without `eas init`/EXPO_PUBLIC_EAS_PROJECT_ID —
    // expo-notifications SDK 53+ cannot infer the id from the manifest here.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // The default import used by registerPush.ts is the `default` property
    // on the namespace object returned by the global jest.mock.
    const constantsMock = Constants as unknown as {
      default: { expoConfig?: Record<string, unknown> };
    };
    constantsMock.default.expoConfig = { extra: {} };

    await ensurePushRegistered('u1', 'dev-1');

    expect(getToken).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_EAS_PROJECT_ID'));
    warn.mockRestore();
  });
});

describe('unregisterPush', () => {
  it('clears the local guard and deregisters the device', async () => {
    await unregisterPush('u1', 'dev-1');
    expect(deleteItem).toHaveBeenCalledWith('eaz_push_token_u1');
    expect(unregisterDevice).toHaveBeenCalledWith('dev-1');
  });
});
