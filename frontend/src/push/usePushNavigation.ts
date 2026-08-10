import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { navigateFromPushData } from '../navigation/navigationRef';

/**
 * Routes taps on push notifications to the referenced chat. Handles both:
 *  - a tap while the app is running/backgrounded (response listener), and
 *  - a cold start where the app was launched by tapping a notification
 *    (`getLastNotificationResponseAsync`).
 *
 * Gated on `isAuthenticated` because the target screens live in the
 * authenticated stack — a tap received while signed out is ignored.
 */
export function usePushNavigation(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) {
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
