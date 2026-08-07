import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createRealtimeServer } from './server.js';
import { signAccessToken } from '../modules/auth/token.service.js';
import type { RealtimeAdapter } from './adapter.js';
import { MemoryPresenceStore } from './presence.js';
import { communityEventBus } from './communityEvents.js';
import { communityRepository } from '../modules/communities/community.repository.js';

vi.mock('../modules/communities/community.repository.js', () => ({
  communityRepository: {
    findById: vi.fn(),
    findMember: vi.fn(),
  },
}));

const findById = vi.mocked(communityRepository.findById);
const findMember = vi.mocked(communityRepository.findMember);

class NoopAdapter implements RealtimeAdapter {
  async setup(): Promise<void> {
    // In-memory default adapter — no Redis in tests.
  }
}

const testOpts = { adapter: new NoopAdapter(), presence: new MemoryPresenceStore() };
const COMMUNITY = '6a6a6a6a6a6a6a6a6a6a6a6a';

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
  const port = 4700 + Math.floor(Math.random() * 100);
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  try {
    await run(port);
  } finally {
    await realtime.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

/** Subscribes a socket to a community and resolves once the server acks. */
async function subscribe(socket: ClientSocket, communityId: string): Promise<void> {
  const ack = waitForEvent<{ communityId: string }>(socket, 'community:subscribed');
  socket.emit('community:subscribe', { communityId });
  await ack;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('community realtime member-list relay', () => {
  it('broadcasts a member change to every subscriber, not just the acting user', async () => {
    // The core of Residual #1: alice viewing a PUBLIC community sees carol join
    // even though the change was not alice's own action.
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, COMMUNITY), subscribe(bob, COMMUNITY)]);

      const aliceGot = waitForEvent<{ communityId: string; userId: string; role: string }>(
        alice,
        'community:member:joined',
      );

      // carol joins via REST → communityService calls the bus.
      communityEventBus.emitMemberJoined(COMMUNITY, 'carol', 'MEMBER');

      expect(await aliceGot).toMatchObject({
        communityId: COMMUNITY,
        userId: 'carol',
        role: 'MEMBER',
      });

      alice.disconnect();
      bob.disconnect();
    });
  });

  it('lets any authenticated user subscribe to a PUBLIC community', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const viewer = rawSocket(port, 'viewer');
      await waitForConnect(viewer);
      await subscribe(viewer, COMMUNITY); // resolves only on the server ack
      expect(findMember).not.toHaveBeenCalled(); // PUBLIC needs no membership check
      viewer.disconnect();
    });
  });

  it('rejects a non-member subscribing to a PRIVATE community', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findMember.mockResolvedValue(null);
    await withServer(async (port) => {
      const intruder = rawSocket(port, 'intruder');
      await waitForConnect(intruder);

      let subscribed = false;
      intruder.on('community:subscribed', () => {
        subscribed = true;
      });
      intruder.emit('community:subscribe', { communityId: COMMUNITY });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(subscribed).toBe(false);
      expect(findMember).toHaveBeenCalledWith(COMMUNITY, 'intruder');
      intruder.disconnect();
    });
  });

  it('lets a member subscribe to a PRIVATE community', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findMember.mockResolvedValue({ userId: 'member' } as never);
    await withServer(async (port) => {
      const member = rawSocket(port, 'member');
      await waitForConnect(member);
      await subscribe(member, COMMUNITY);
      member.disconnect();
    });
  });

  it('evicts a departed member so they stop receiving the community room updates', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findMember.mockResolvedValue({ userId: 'alice' } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      await waitForConnect(alice);
      await subscribe(alice, COMMUNITY);

      let gotRole = false;
      alice.on('community:member:role', () => {
        gotRole = true;
      });

      // alice leaves → the bus broadcasts member:left then evicts her socket.
      communityEventBus.emitMemberLeft(COMMUNITY, 'alice');
      await new Promise((resolve) => setTimeout(resolve, 100));

      // A later room broadcast must not reach the evicted alice.
      communityEventBus.emitRoleUpdated(COMMUNITY, 'someone-else', 'MODERATOR');
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(gotRole).toBe(false);
      alice.disconnect();
    });
  });
});
