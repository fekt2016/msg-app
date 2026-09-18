import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { registerDevice, unregisterDevice, type PushPlatform } from '../api/push';
import type * as NotificationsNs from 'expo-notifications';

type NotificationsModule = typeof NotificationsNs;

let notificationsModule: NotificationsModule | null = null;
let handlerInstalled = false;

// expo-notifications is unavailable in Expo Go on Android (SDK 53+) — the
// module logs an error and resolves to an unusable object instead of throwing.
// Never evaluate it in Expo Go: gate on the execution environment, then
// validate the resolved module's shape. Push is best-effort and treated as
// unsupported whenever this module isn't genuinely available.
function loadNotifications(): NotificationsModule | null {
  if (notificationsModule) {
    return notificationsModule;
  }
  if (Constants.executionEnvironment === 'storeClient') {
    return null;
  }
  let mod: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications');
  } catch {
    return null;
  }
  const Notifications = mod as NotificationsModule | undefined;
  if (
    !Notifications ||
    typeof Notifications.setNotificationHandler !== 'function' ||
    typeof Notifications.getPermissionsAsync !== 'function' ||
    typeof Notifications.getExpoPushTokenAsync !== 'function'
  ) {
    return null;
  }
  if (!handlerInstalled) {
    handlerInstalled = true;
    // Foreground presentation: show the banner + play a sound even while the
    // app is open. Set once — Expo requires a single global handler.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  notificationsModule = Notifications;
  return Notifications;
}

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
 *  - no-op where expo-notifications is unavailable (Android Expo Go, SDK 53+);
 *  - skips the network call when the token is unchanged since last registration.
 *
 * Failures are surfaced to the caller (which logs/ignores) rather than thrown
 * into the auth flow — push is non-critical and must not block sign-in.
 */
export async function ensurePushRegistered(userId: string, deviceId: string): Promise<void> {
  if (!Device.isDevice) {
    return;
  }

  const Notifications = loadNotifications();
  if (!Notifications) {
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
  if (!projectId) {
    // SDK 53+ cannot infer the id from the manifest in a dev build; without it
    // getExpoPushTokenAsync throws ERR_NOTIFICATIONS_NO_EXPERIENCE_ID. Surface
    // a clear, actionable hint rather than a silent failure that shows up only
    // as a missing device row in the backend.
    console.warn(
      '[push] No EAS projectId available — set EXPO_PUBLIC_EAS_PROJECT_ID (or run `eas init`) and restart to enable push',
    );
    return;
  }
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

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
