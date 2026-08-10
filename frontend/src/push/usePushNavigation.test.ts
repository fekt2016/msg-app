import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { usePushNavigation } from './usePushNavigation';
import { navigateFromPushData } from '../navigation/navigationRef';

jest.mock('../navigation/navigationRef', () => ({
  navigateFromPushData: jest.fn(),
}));

const getLast = Notifications.getLastNotificationResponseAsync as jest.Mock;
const addListener = Notifications.addNotificationResponseReceivedListener as jest.Mock;
const route = navigateFromPushData as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getLast.mockResolvedValue(null);
  addListener.mockReturnValue({ remove: jest.fn() });
});

describe('usePushNavigation', () => {
  it('does not subscribe when signed out', async () => {
    await renderHook(() => usePushNavigation(false));
    expect(addListener).not.toHaveBeenCalled();
    expect(getLast).not.toHaveBeenCalled();
  });

  it('subscribes when authenticated and removes the subscription on teardown', async () => {
    const remove = jest.fn();
    addListener.mockReturnValue({ remove });

    const { rerender } = await renderHook((auth: boolean) => usePushNavigation(auth), {
      initialProps: true,
    });
    expect(addListener).toHaveBeenCalledTimes(1);

    // Signing out changes the effect dependency → its cleanup runs.
    await rerender(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('routes a runtime tap through the notification data', async () => {
    let handler: ((r: unknown) => void) | undefined;
    addListener.mockImplementation((cb: (r: unknown) => void) => {
      handler = cb;
      return { remove: jest.fn() };
    });

    await renderHook(() => usePushNavigation(true));
    handler?.({
      notification: { request: { content: { data: { type: 'chat:message', senderId: 'u1' } } } },
    });

    expect(route).toHaveBeenCalledWith({ type: 'chat:message', senderId: 'u1' });
  });

  it('routes the cold-start notification that launched the app', async () => {
    getLast.mockResolvedValue({
      notification: {
        request: { content: { data: { type: 'chat:group:message', groupId: 'g1' } } },
      },
    });

    await renderHook(() => usePushNavigation(true));

    // The cold-start check resolves on the next microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(route).toHaveBeenCalledWith({ type: 'chat:group:message', groupId: 'g1' });
  });
});
