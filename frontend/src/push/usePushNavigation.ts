import { useEffect } from 'react';
import Constants from 'expo-constants';
import { navigateFromPushData } from '../navigation/navigationRef';
import type * as NotificationsNs from 'expo-notifications';

type NotificationsModule = typeof NotificationsNs;

/**
 * Routes taps on push notifications to the referenced chat. Handles both:
 *  - a tap while the app is running/backgrounded (response listener), and
 *  - a cold start where the app was launched by tapping a notification
 *    (`getLastNotificationResponseAsync`).
 *
 * Gated on `isAuthenticated` because the target screens live in the
 * authenticated stack — a tap received while signed out is ignored.
 *
 * expo-notifications is resolved lazily; on Android in Expo Go (SDK 53+) its
 * module throws at import time, so tap-to-open is skipped there rather than
 * crashing the app.
 */
export function usePushNavigation(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // expo-notifications is removed from Expo Go (SDK 53+); requiring it there
    // logs an error and resolves to a non-functional object. Skip entirely.
    if (Constants.executionEnvironment === 'storeClient') {
      return;
    }

    let Notifications: NotificationsModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Notifications = require('expo-notifications') as NotificationsModule;
    } catch {
      return;
    }
    if (
      typeof Notifications.getLastNotificationResponseAsync !== 'function' ||
      typeof Notifications.addNotificationResponseReceivedListener !== 'function'
    ) {
      return;
    }

    // Cold start: the notification that launched the app, if any.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        navigateFromPushData(response.notification.request.content.data);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromPushData(response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, [isAuthenticated]);
}
