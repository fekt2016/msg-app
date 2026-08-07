import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';
import { tokenStorage } from '../auth/tokenStorage';
import { refreshSession } from '../auth/refreshSession';
import type { MemberRole } from '../api/communities';

export const REALTIME_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_LIST: 'presence:list',
  CHAT_MESSAGE_NEW: 'chat:message:new',
  CHAT_MESSAGE_DELIVERED: 'chat:message:delivered',
  CHAT_MESSAGE_READ: 'chat:message:read',
  COMMUNITY_MEMBER_JOINED: 'community:member:joined',
  COMMUNITY_MEMBER_LEFT: 'community:member:left',
  COMMUNITY_MEMBER_ROLE: 'community:member:role',
  COMMUNITY_SUBSCRIBE: 'community:subscribe',
  COMMUNITY_UNSUBSCRIBE: 'community:unsubscribe',
  COMMUNITY_SUBSCRIBED: 'community:subscribed',
  GROUP_SUBSCRIBE: 'group:subscribe',
  GROUP_UNSUBSCRIBE: 'group:unsubscribe',
  GROUP_SUBSCRIBED: 'group:subscribed',
  CHAT_GROUP_MESSAGE_NEW: 'chat:group:message:new',
  CHAT_GROUP_MESSAGE_DELIVERED: 'chat:group:message:delivered',
  CHAT_GROUP_MESSAGE_READ: 'chat:group:message:read',
  GROUP_MEMBER_JOINED: 'group:member:joined',
  GROUP_MEMBER_LEFT: 'group:member:left',
  GROUP_DELETED: 'group:deleted',
} as const;

export interface EncryptedMessageEvent {
  senderId: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export interface MessageDeliveredEvent {
  recipientId: string;
  timestamp: number;
}

export interface MessageReadEvent {
  recipientId: string;
  timestamp: number;
}

export interface PresenceUpdate {
  userId: string;
  online: boolean;
  connectionCount: number;
  at: string;
}

export interface PresenceList {
  onlineUserIds: string[];
}

/**
 * A community membership change, delivered to the affected user's own room
 * (`user:{id}`). `role` is present on join/role-change events and absent on
 * leave. Used to keep a viewed community's detail/member views consistent
 * across the same user's devices.
 */
export interface CommunityMemberEvent {
  communityId: string;
  userId: string;
  role?: MemberRole;
  at: string;
}

/** An encrypted group message relayed from a fellow member (server-stamped `senderId`). */
export interface GroupMessageEvent {
  groupId: string;
  senderId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

/** A group delivered/read acknowledgement from `userId` for message `timestamp`. */
export interface GroupAckEvent {
  groupId: string;
  userId: string;
  timestamp: number;
}

/** A group membership change broadcast to the group room and the affected user. */
export interface GroupMemberEvent {
  groupId: string;
  userId: string;
  at: string;
}

const host =
  (Constants.expoConfig?.extra as { API_URL?: string } | undefined)?.API_URL ??
  'http://10.0.2.2:5000/api/v1';

const socketUrl = host.replace(/\/api\/v1\/?$/, '');

/** The `data.code` the backend tags on a handshake auth rejection. */
const AUTH_ERROR_CODE = 'UNAUTHENTICATED';

/**
 * How many times the client will refresh the access token and retry the
 * handshake before treating the session as dead. A refreshed token that is
 * still rejected almost always means the session is genuinely invalid; without
 * a cap the client would refresh/reconnect in a tight loop.
 */
const MAX_AUTH_RETRIES = 2;

class RealtimeClient {
  private socket: Socket | null = null;
  private reauthenticating = false;
  private authRetries = 0;

  /**
   * Invoked when re-authentication is exhausted or impossible (no refresh
   * token, or a refreshed token is still rejected). The provider wires this to
   * a logout so the UI can send the user back to sign-in instead of spinning
   * on "Connecting…".
   */
  onAuthFailure?: () => void;

  connect(): Socket {
    if (this.socket) return this.socket;

    this.socket = io(socketUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });

    return this.socket;
  }

  /**
   * Authenticates and opens the connection using the stored access token.
   *
   * Transport-level failures are retried by Socket.IO's built-in reconnection.
   * An authentication rejection (`connect_error` tagged `UNAUTHENTICATED` —
   * typically an access token that expired while the socket was disconnected)
   * is handled here: the access token is refreshed and the handshake retried,
   * so a reconnecting socket recovers on its own instead of getting stuck. The
   * listeners are (re)attached idempotently so they survive a provider-level
   * `removeAllListeners()` between `open()` calls.
   */
  async open(): Promise<Socket> {
    const socket = this.connect();

    socket.off(REALTIME_EVENTS.CONNECT, this.handleConnect);
    socket.on(REALTIME_EVENTS.CONNECT, this.handleConnect);
    socket.off(REALTIME_EVENTS.CONNECT_ERROR, this.handleConnectError);
    socket.on(REALTIME_EVENTS.CONNECT_ERROR, this.handleConnectError);

    const accessToken = await tokenStorage.getAccessToken();
    socket.auth = { token: accessToken ?? undefined };
    socket.connect();
    return socket;
  }

  private handleConnect = (): void => {
    // A successful handshake means the current token works — reset the budget.
    this.authRetries = 0;
  };

  private handleConnectError = (err: Error): void => {
    const code = (err as { data?: { code?: string } }).data?.code;
    // Only an auth rejection warrants a token refresh; transport errors are
    // left to Socket.IO's reconnection so we don't rotate the refresh token on
    // every network blip.
    if (code !== AUTH_ERROR_CODE) return;
    void this.reauthenticate();
  };

  private async reauthenticate(): Promise<void> {
    if (this.reauthenticating) return;

    if (this.authRetries >= MAX_AUTH_RETRIES) {
      this.failAuth();
      return;
    }

    this.reauthenticating = true;
    this.authRetries += 1;
    try {
      const accessToken = await refreshSession();
      const socket = this.socket;
      if (socket) {
        socket.auth = { token: accessToken };
        socket.connect();
      }
    } catch {
      this.failAuth();
    } finally {
      this.reauthenticating = false;
    }
  }

  private failAuth(): void {
    this.disconnect();
    this.onAuthFailure?.();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.reauthenticating = false;
    this.authRetries = 0;
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const realtimeClient = new RealtimeClient();
