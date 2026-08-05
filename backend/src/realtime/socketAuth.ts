import type { Socket } from 'socket.io';
import { verifyAccessToken, type AccessTokenPayload } from '../modules/auth/token.service.js';
import { AppError } from '../errors/AppError.js';

export const SOCKET_AUTH_ERROR = 'socket:auth:error';

export interface SocketUser {
  userId: string;
  role: AccessTokenPayload['role'];
  deviceId: string;
}

/**
 * Builds a handshake rejection carrying a machine-readable `data.code` that
 * Socket.IO forwards to the client's `connect_error` handler. The client uses
 * this to distinguish an authentication failure (refresh the access token and
 * retry) from a transient transport error (let Socket.IO reconnect as-is).
 */
function unauthenticated(message: string): Error {
  const err = new AppError(401, 'UNAUTHENTICATED', message);
  (err as Error & { data?: unknown }).data = { code: 'UNAUTHENTICATED' };
  return err;
}

declare module 'socket.io' {
  interface Socket {
    user?: SocketUser;
  }
}

/**
 * Authenticates a Socket.IO handshake using the same JWT as the REST API.
 *
 * The client supplies the access token via the `auth.token` handshake field
 * (`io({ auth: { token } })`). On failure the connection is rejected with an
 * error that the client can inspect to force a re-login.
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as unknown;
  if (typeof token !== 'string' || token.length === 0) {
    next(unauthenticated('Missing access token in socket handshake'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    socket.user = { userId: payload.sub, role: payload.role, deviceId: payload.deviceId };
    socket.join(`user:${payload.sub}`);
    next();
  } catch {
    next(unauthenticated('Invalid or expired access token'));
  }
}
