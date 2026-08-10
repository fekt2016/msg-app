import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { registerDevice, unregisterDevice, type PushPlatform } from '../api/push';

// Foreground presentation: show the banner + play a sound even while the app is
// open. Set once at import time — Expo requires a single global handler.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Records the token last registered with the backend for a given user, so a
// repeat session activation (login / OTP verify / restore) doesn't re-POST an
// unchanged token. Re-registration still happens when Expo rotates the token.
const registeredTokenKey = (userId: string) => `eaz_push_token_${userId}`;

function currentPlatform(): PushPlatform {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device's Expo push token with the backend so it can receive
 * notifications for messages that arrive while the app is closed/offline.
 *
 * Best-effort and idempotent — safe to call on every session activation:
 *  - no-op on simulators/emulators (they cannot obtain a push token);
 *  - no-op when the user declines notification permission;
 *  - skips the network call when the token is unchanged since last registration.
 *
 * Failures are surfaced to the caller (which logs/ignores) rather than thrown
 * into the auth flow — push is non-critical and must not block sign-in. The
 * only call that can throw on an unsupported runtime (e.g. Android Expo Go,
 * SDK 53+) is `getExpoPushTokenAsync`, which the `Device.isDevice` guard and
 * that caller-level catch handle.
 */
export async function ensurePushRegistered(userId: string, deviceId: string): Promise<void> {
  if (!Device.isDevice) {
    return;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted' && existing.canAskAgain) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return;
  }

  // Android requires an explicit channel or notifications are silently dropped.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = resolveProjectId();
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  const lastRegistered = await SecureStore.getItemAsync(registeredTokenKey(userId));
  if (lastRegistered === pushToken) {
    return;
  }

  await registerDevice({
    deviceId,
    pushToken,
    platform: currentPlatform(),
    appVersion: Application.nativeApplicationVersion ?? undefined,
  });
  await SecureStore.setItemAsync(registeredTokenKey(userId), pushToken);
}

/**
 * Deregisters this device on logout so the previous user stops receiving push
 * for this device. Best-effort — clears the local guard regardless so the next
 * user's token is always re-sent.
 */
export async function unregisterPush(userId: string, deviceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(registeredTokenKey(userId)).catch(() => {});
  await unregisterDevice(deviceId);
}
