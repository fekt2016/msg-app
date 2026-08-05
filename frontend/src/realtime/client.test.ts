import { REALTIME_EVENTS, realtimeClient } from './client';
import * as tokenStorage from '../auth/tokenStorage';

jest.mock('socket.io-client', () => {
  const socket = {
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    auth: {},
    connected: false,
  };
  return {
    io: jest.fn(() => socket),
  };
});

jest.mock('../auth/tokenStorage', () => ({
  tokenStorage: {
    getAccessToken: jest.fn(),
  },
}));

jest.mock('../auth/refreshSession', () => ({
  refreshSession: jest.fn(),
}));

import { io } from 'socket.io-client';
import { refreshSession } from '../auth/refreshSession';
const mockIo = io as jest.Mock;
const mockRefreshSession = refreshSession as jest.Mock;

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

/** Retrieves the last `connect_error` handler the client registered. */
function connectErrorHandler(socket: { on: jest.Mock }): (err: unknown) => void {
  const call = [...socket.on.mock.calls].reverse().find(([event]) => event === 'connect_error');
  if (!call) throw new Error('connect_error handler was not registered');
  return call[1] as (err: unknown) => void;
}

describe('realtimeClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    realtimeClient.disconnect();
  });

  it('builds the socket URL from the API URL', async () => {
    const socket = await realtimeClient.open();
    expect(mockIo).toHaveBeenCalledWith(
      'http://10.0.2.2:5000',
      expect.objectContaining({ autoConnect: false, reconnection: true }),
    );
    expect(socket).toBeDefined();
  });

  it('attaches the stored access token to the handshake', async () => {
    (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue('token-123');

    const socket = await realtimeClient.open();

    expect(socket.auth).toEqual({ token: 'token-123' });
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('opens without a token when none is stored', async () => {
    (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue(null);

    const socket = await realtimeClient.open();

    expect(socket.auth).toEqual({ token: undefined });
  });

  it('reuses the same socket instance across open() calls', async () => {
    const first = await realtimeClient.open();
    const second = await realtimeClient.open();
    expect(first).toBe(second);
  });

  it('disconnect clears the socket', async () => {
    const socket = await realtimeClient.open();
    realtimeClient.disconnect();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(realtimeClient.connected).toBe(false);
  });

  it('exposes documented event names', () => {
    expect(REALTIME_EVENTS.PRESENCE_UPDATE).toBe('presence:update');
    expect(REALTIME_EVENTS.PRESENCE_LIST).toBe('presence:list');
    expect(REALTIME_EVENTS.CONNECT_ERROR).toBe('connect_error');
  });

  describe('re-authentication on an expired token', () => {
    it('refreshes the access token and reconnects on an UNAUTHENTICATED handshake error', async () => {
      (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue('stale-token');
      mockRefreshSession.mockResolvedValue('fresh-token');

      const socket = await realtimeClient.open();
      expect(socket.auth).toEqual({ token: 'stale-token' });
      (socket.connect as jest.Mock).mockClear();

      connectErrorHandler(socket as unknown as { on: jest.Mock })({
        data: { code: 'UNAUTHENTICATED' },
      });
      await flush();

      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      expect(socket.auth).toEqual({ token: 'fresh-token' });
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it('ignores transport-level connect errors without refreshing', async () => {
      (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue('token');

      const socket = await realtimeClient.open();
      connectErrorHandler(socket as unknown as { on: jest.Mock })(new Error('xhr poll error'));
      await flush();

      expect(mockRefreshSession).not.toHaveBeenCalled();
    });

    it('gives up and calls onAuthFailure when the refresh itself fails', async () => {
      (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue('stale-token');
      mockRefreshSession.mockRejectedValue(new Error('No refresh token available'));
      const onAuthFailure = jest.fn();
      realtimeClient.onAuthFailure = onAuthFailure;

      const socket = await realtimeClient.open();
      connectErrorHandler(socket as unknown as { on: jest.Mock })({
        data: { code: 'UNAUTHENTICATED' },
      });
      await flush();

      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      expect(socket.disconnect).toHaveBeenCalled();
      realtimeClient.onAuthFailure = undefined;
    });

    it('stops retrying after repeated rejections of refreshed tokens', async () => {
      (tokenStorage.tokenStorage.getAccessToken as jest.Mock).mockResolvedValue('stale-token');
      mockRefreshSession.mockResolvedValue('fresh-but-still-rejected');
      const onAuthFailure = jest.fn();
      realtimeClient.onAuthFailure = onAuthFailure;

      const socket = await realtimeClient.open();
      const fireAuthError = () =>
        connectErrorHandler(socket as unknown as { on: jest.Mock })({
          data: { code: 'UNAUTHENTICATED' },
        });

      // Each rejected reconnect drives another connect_error; the client must
      // refresh at most MAX_AUTH_RETRIES (2) times, then fail the session.
      fireAuthError();
      await flush();
      fireAuthError();
      await flush();
      fireAuthError();
      await flush();

      expect(mockRefreshSession).toHaveBeenCalledTimes(2);
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      realtimeClient.onAuthFailure = undefined;
    });
  });
});
