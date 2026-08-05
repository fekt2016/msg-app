import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createRealtimeServer } from './server.js';
import { signAccessToken } from '../modules/auth/token.service.js';
import type { RealtimeAdapter } from './adapter.js';
import { MemoryPresenceStore } from './presence.js';

class NoopAdapter implements RealtimeAdapter {
  async setup(): Promise<void> {
    // In-memory default adapter — no Redis in tests.
  }
}

const testOpts = { adapter: new NoopAdapter(), presence: new MemoryPresenceStore() };

function validToken(userId = 'user-1', deviceId = 'device-1'): string {
  return signAccessToken({ sub: userId, role: 'USER', deviceId });
}

/**
 * Builds a raw (not-yet-connected) socket so event listeners can be attached
 * before the connection is established. The server emits `presence:list`
 * during the handshake; listeners must exist before `connect()` resolves.
 */
function rawSocket(port: number, userId: string, deviceId: string): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    path: '/socket.io',
    auth: { token: validToken(userId, deviceId) },
    forceNew: true,
    reconnection: false,
    timeout: 3000,
  });
}

async function waitForConnect(socket: ClientSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

function collect<T>(socket: ClientSocket, event: string, into: T[]): void {
  socket.on(event, (payload: T) => into.push(payload));
}

/** Polls until `predicate` returns true or the timeout elapses. */
async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Condition not met before timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface PresenceUpdate {
  userId: string;
  online: boolean;
  connectionCount: number;
  at: string;
}

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const httpServer = createServer();
  const realtime = await createRealtimeServer(httpServer, testOpts);
  const port = 4100 + Math.floor(Math.random() * 100);

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));

  try {
    await run(port);
  } finally {
    await realtime.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

describe('realtime server', () => {
  it('authenticates a valid token and attaches the user', async () => {
    await withServer(async (port) => {
      const socket = rawSocket(port, 'user-1', 'device-1');
      await waitForConnect(socket);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  it('rejects a handshake without a token', async () => {
    await withServer(async (port) => {
      const socket = ioc(`http://localhost:${port}`, {
        path: '/socket.io',
        auth: {},
        forceNew: true,
        reconnection: false,
        timeout: 3000,
      });
      await expect(waitForConnect(socket)).rejects.toThrow(/Missing access token/);
      socket.disconnect();
    });
  });

  it('rejects a handshake with an invalid token', async () => {
    await withServer(async (port) => {
      const socket = ioc(`http://localhost:${port}`, {
        path: '/socket.io',
        auth: { token: 'not-a-token' },
        forceNew: true,
        reconnection: false,
        timeout: 3000,
      });
      await expect(waitForConnect(socket)).rejects.toThrow();
      socket.disconnect();
    });
  });

  it('emits a presence update when a user connects, then on disconnect', async () => {
    await withServer(async (port) => {
      const updates: PresenceUpdate[] = [];

      const observer = rawSocket(port, 'observer', 'device-1');
      collect<PresenceUpdate>(observer, 'presence:update', updates);

      const subject = rawSocket(port, 'user-1', 'device-1');
      const listPromise = waitForEvent<{ onlineUserIds: string[] }>(subject, 'presence:list');

      await Promise.all([waitForConnect(observer), waitForConnect(subject)]);

      await waitUntil(() => updates.some((u) => u.userId === 'user-1' && u.online));

      const list = await listPromise;
      expect(list.onlineUserIds).toContain('user-1');

      subject.disconnect();
      await waitUntil(() => updates.some((u) => u.userId === 'user-1' && !u.online));

      observer.disconnect();
    });
  });

  it('reports a user online once, even with multiple connections from that user', async () => {
    await withServer(async (port) => {
      const updates: PresenceUpdate[] = [];

      const observer = rawSocket(port, 'observer', 'device-1');
      collect<PresenceUpdate>(observer, 'presence:update', updates);

      const s1 = rawSocket(port, 'multi', 'device-1');
      const s2 = rawSocket(port, 'multi', 'device-2');
      const listPromise = waitForEvent<{ onlineUserIds: string[] }>(s2, 'presence:list');

      await Promise.all([waitForConnect(observer), waitForConnect(s1), waitForConnect(s2)]);

      const list = await listPromise;
      expect(list.onlineUserIds).toContain('multi');

      s1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(updates.some((u) => u.userId === 'multi' && u.online === false)).toBe(false);

      s2.disconnect();
      await waitUntil(() => updates.some((u) => u.userId === 'multi' && u.online === false));

      observer.disconnect();
    });
  });

  it('relays an encrypted chat message from sender to recipient', async () => {
    await withServer(async (port) => {
      const sender = rawSocket(port, 'alice', 'device-1');
      const recipient = rawSocket(port, 'bob', 'device-1');
      const received = waitForEvent<{
        senderId: string;
        ciphertext: string;
        iv: string;
        timestamp: number;
      }>(recipient, 'chat:message:new');

      await Promise.all([waitForConnect(sender), waitForConnect(recipient)]);

      sender.emit('chat:message:new', {
        recipientId: 'bob',
        ciphertext: 'cipher-abc',
        iv: 'iv-xyz',
        timestamp: 123,
      });

      const event = await received;
      expect(event).toEqual({
        senderId: 'alice',
        ciphertext: 'cipher-abc',
        iv: 'iv-xyz',
        timestamp: 123,
      });
      sender.disconnect();
      recipient.disconnect();
    });
  });

  it('relays a delivered ack from the recipient back to the sender', async () => {
    await withServer(async (port) => {
      const sender = rawSocket(port, 'alice', 'device-1');
      const recipient = rawSocket(port, 'bob', 'device-1');
      const ack = waitForEvent<{ recipientId: string; timestamp: number }>(
        sender,
        'chat:message:delivered',
      );

      await Promise.all([waitForConnect(sender), waitForConnect(recipient)]);

      recipient.emit('chat:message:delivered', {
        senderId: 'alice',
        timestamp: 123,
      });

      const event = await ack;
      expect(event).toEqual({ recipientId: 'bob', timestamp: 123 });
      sender.disconnect();
      recipient.disconnect();
    });
  });

  it('relays a read ack from the recipient back to the sender', async () => {
    await withServer(async (port) => {
      const sender = rawSocket(port, 'alice', 'device-1');
      const recipient = rawSocket(port, 'bob', 'device-1');
      const ack = waitForEvent<{ recipientId: string; timestamp: number }>(
        sender,
        'chat:message:read',
      );

      await Promise.all([waitForConnect(sender), waitForConnect(recipient)]);

      recipient.emit('chat:message:read', {
        senderId: 'alice',
        timestamp: 456,
      });

      const event = await ack;
      expect(event).toEqual({ recipientId: 'bob', timestamp: 456 });
      sender.disconnect();
      recipient.disconnect();
    });
  });

  it('ignores an invalid chat message payload', async () => {
    await withServer(async (port) => {
      const sender = rawSocket(port, 'alice', 'device-1');
      const recipient = rawSocket(port, 'bob', 'device-1');
      let received = false;
      recipient.on('chat:message:new', () => {
        received = true;
      });

      await Promise.all([waitForConnect(sender), waitForConnect(recipient)]);

      sender.emit('chat:message:new', { recipientId: 'bob' });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(received).toBe(false);
      sender.disconnect();
      recipient.disconnect();
    });
  });
});
