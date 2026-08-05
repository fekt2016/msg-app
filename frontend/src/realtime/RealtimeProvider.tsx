import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { realtimeClient, REALTIME_EVENTS, type PresenceList, type PresenceUpdate } from './client';
import { useAuth } from '../auth/AuthContext';

interface RealtimeContextValue {
  connected: boolean;
  onlineUserIds: string[];
  isOnline: (userId: string) => boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

/**
 * Connects the realtime socket for the authenticated user and tracks the
 * current presence snapshot (which users are online).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      realtimeClient.disconnect();
      setConnected(false);
      setOnlineUserIds([]);
      return;
    }

    // A socket session that can't be re-authenticated (refresh exhausted or no
    // refresh token) means a dead session — log out so the UI returns to
    // sign-in rather than spinning on "Connecting…".
    realtimeClient.onAuthFailure = () => {
      void logout();
    };

    let socket: Socket;
    void realtimeClient.open().then((s) => {
      socket = s;

      s.on(REALTIME_EVENTS.CONNECT, () => setConnected(true));
      s.on(REALTIME_EVENTS.DISCONNECT, () => setConnected(false));

      s.on(REALTIME_EVENTS.PRESENCE_LIST, (payload: PresenceList) => {
        setOnlineUserIds(payload.onlineUserIds);
      });

      s.on(REALTIME_EVENTS.PRESENCE_UPDATE, (payload: PresenceUpdate) => {
        setOnlineUserIds((current) => {
          if (payload.online) {
            return current.includes(payload.userId) ? current : [...current, payload.userId];
          }
          return current.filter((id) => id !== payload.userId);
        });
      });

      if (s.connected) setConnected(true);
    });

    return () => {
      realtimeClient.onAuthFailure = undefined;
      socket?.disconnect();
      socket?.removeAllListeners();
    };
  }, [user, logout]);

  const isOnline = useCallback((userId: string) => onlineUserIds.includes(userId), [onlineUserIds]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, onlineUserIds, isOnline }),
    [connected, onlineUserIds, isOnline],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return ctx;
}
