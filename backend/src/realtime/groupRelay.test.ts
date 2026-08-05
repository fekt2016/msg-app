import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createRealtimeServer } from './server.js';
import { signAccessToken } from '../modules/auth/token.service.js';
import type { RealtimeAdapter } from './adapter.js';
import { MemoryPresenceStore } from './presence.js';
import { groupRepository } from '../modules/groups/group.repository.js';

vi.mock('../modules/groups/group.repository.js', () => ({
  groupRepository: {
    isMember: vi.fn(),
  },
}));

const isMember = vi.mocked(groupRepository.isMember);

class NoopAdapter implements RealtimeAdapter {
  async setup(): Promise<void> {
    // In-memory default adapter — no Redis in tests.
  }
}

const testOpts = { adapter: new NoopAdapter(), presence: new MemoryPresenceStore() };
const GROUP = '5f5f5f5f5f5f5f5f5f5f5f5f';

function validToken(userId: string, deviceId = 'device-1'): string {
  return signAccessToken({ sub: userId, role: 'USER', deviceId });
}

function rawSocket(port: number, userId: string): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    path: '/socket.io',
    auth: { token: validToken(userId) },
    forceNew: true,
    reconnection: false,
    timeout: 3000,
  });
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve) => socket.once(event, (p: T) => resolve(p)));
}

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const httpServer = createServer();
  const realtime = await createRealtimeServer(httpServer, testOpts);
  const port = 4600 + Math.floor(Math.random() * 100);
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  try {
    await run(port);
  } finally {
    await realtime.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

/** Subscribes a socket to a group and resolves once the server acks. */
async function subscribe(socket: ClientSocket, groupId: string): Promise<void> {
  const ack = waitForEvent<{ groupId: string }>(socket, 'group:subscribed');
  socket.emit('group:subscribe', { groupId });
  await ack;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('group realtime relay', () => {
  it('lets a member subscribe and relays a group message to other members', async () => {
    isMember.mockResolvedValue(true);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);

      await Promise.all([subscribe(alice, GROUP), subscribe(bob, GROUP)]);

      const received = waitForEvent<{
        groupId: string;
        senderId: string;
        ciphertext: string;
        iv: string;
        timestamp: number;
      }>(bob, 'chat:group:message:new');

      alice.emit('chat:group:message:new', {
        groupId: GROUP,
        ciphertext: 'cipher',
        iv: 'iv',
        timestamp: 99,
      });

      expect(await received).toEqual({
        groupId: GROUP,
        senderId: 'alice',
        ciphertext: 'cipher',
        iv: 'iv',
        timestamp: 99,
      });

      alice.disconnect();
      bob.disconnect();
    });
  });

  it('does not echo the group message back to the sender', async () => {
    isMember.mockResolvedValue(true);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      await waitForConnect(alice);
      await subscribe(alice, GROUP);

      let echoed = false;
      alice.on('chat:group:message:new', () => {
        echoed = true;
      });
      alice.emit('chat:group:message:new', {
        groupId: GROUP,
        ciphertext: 'c',
        iv: 'i',
        timestamp: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(echoed).toBe(false);
      alice.disconnect();
    });
  });

  it('rejects a non-member subscribe', async () => {
    isMember.mockResolvedValue(false);
    await withServer(async (port) => {
      const intruder = rawSocket(port, 'intruder');
      await waitForConnect(intruder);

      let subscribed = false;
      intruder.on('group:subscribed', () => {
        subscribed = true;
      });
      intruder.emit('group:subscribe', { groupId: GROUP });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(subscribed).toBe(false);
      expect(isMember).toHaveBeenCalledWith(GROUP, 'intruder');
      intruder.disconnect();
    });
  });

  it('drops a group message from a socket that never subscribed', async () => {
    isMember.mockResolvedValue(true);
    await withServer(async (port) => {
      const member = rawSocket(port, 'alice');
      const outsider = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(member), waitForConnect(outsider)]);
      await subscribe(member, GROUP);

      let received = false;
      member.on('chat:group:message:new', () => {
        received = true;
      });
      // outsider never subscribed — its emit must not reach the room.
      outsider.emit('chat:group:message:new', {
        groupId: GROUP,
        ciphertext: 'c',
        iv: 'i',
        timestamp: 2,
      });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(received).toBe(false);
      member.disconnect();
      outsider.disconnect();
    });
  });

  it('relays a group delivered ack to other members', async () => {
    isMember.mockResolvedValue(true);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, GROUP), subscribe(bob, GROUP)]);

      const ack = waitForEvent<{ groupId: string; userId: string; timestamp: number }>(
        alice,
        'chat:group:message:delivered',
      );
      bob.emit('chat:group:message:delivered', { groupId: GROUP, timestamp: 77 });

      expect(await ack).toEqual({ groupId: GROUP, userId: 'bob', timestamp: 77 });
      alice.disconnect();
      bob.disconnect();
    });
  });
});
