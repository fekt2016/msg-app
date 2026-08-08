import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createRealtimeServer } from './server.js';
import { signAccessToken } from '../modules/auth/token.service.js';
import type { RealtimeAdapter } from './adapter.js';
import { MemoryPresenceStore } from './presence.js';
import { channelEventBus, CHANNEL_EVENTS } from './channelEvents.js';
import { channelRepository } from '../modules/channels/channel.repository.js';

vi.mock('../modules/channels/channel.repository.js', () => ({
  channelRepository: {
    findById: vi.fn(),
    findSubscriber: vi.fn(),
  },
}));

const findById = vi.mocked(channelRepository.findById);
const findSubscriber = vi.mocked(channelRepository.findSubscriber);

class NoopAdapter implements RealtimeAdapter {
  async setup(): Promise<void> {
    // In-memory default adapter — no Redis in tests.
  }
}

const testOpts = { adapter: new NoopAdapter(), presence: new MemoryPresenceStore() };
const CHANNEL = '7a7a7a7a7a7a7a7a7a7a7a7a';

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
  const port = 4800 + Math.floor(Math.random() * 100);
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  try {
    await run(port);
  } finally {
    await realtime.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

/** Subscribes a socket to a channel and resolves once the server acks. */
async function subscribe(socket: ClientSocket, channelId: string): Promise<void> {
  const ack = waitForEvent<{ channelId: string }>(socket, 'channel:subscribed');
  socket.emit('channel:subscribe', { channelId });
  await ack;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channel realtime relay', () => {
  it('lets any authenticated user subscribe to a PUBLIC channel', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const viewer = rawSocket(port, 'viewer');
      await waitForConnect(viewer);
      await subscribe(viewer, CHANNEL); // resolves only on the server ack
      expect(findSubscriber).not.toHaveBeenCalled(); // PUBLIC needs no subscription row
      viewer.disconnect();
    });
  });

  it('lets a subscriber join a PRIVATE channel', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findSubscriber.mockResolvedValue({ channelId: CHANNEL, userId: 'member' } as never);
    await withServer(async (port) => {
      const member = rawSocket(port, 'member');
      await waitForConnect(member);
      await subscribe(member, CHANNEL);
      expect(findSubscriber).toHaveBeenCalledWith(CHANNEL, 'member');
      member.disconnect();
    });
  });

  it('rejects a non-subscriber joining a PRIVATE channel', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findSubscriber.mockResolvedValue(null);
    await withServer(async (port) => {
      const intruder = rawSocket(port, 'intruder');
      await waitForConnect(intruder);

      let subscribed = false;
      intruder.on('channel:subscribed', () => {
        subscribed = true;
      });
      intruder.emit('channel:subscribe', { channelId: CHANNEL });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(subscribed).toBe(false);
      expect(findSubscriber).toHaveBeenCalledWith(CHANNEL, 'intruder');
      intruder.disconnect();
    });
  });

  it('rejects a subscribe for a soft-deleted channel', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: new Date() } as never);
    await withServer(async (port) => {
      const viewer = rawSocket(port, 'viewer');
      await waitForConnect(viewer);

      let subscribed = false;
      viewer.on('channel:subscribed', () => {
        subscribed = true;
      });
      viewer.emit('channel:subscribe', { channelId: CHANNEL });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(subscribed).toBe(false);
      viewer.disconnect();
    });
  });

  it('broadcasts a new post to every subscribed member of the channel', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, CHANNEL), subscribe(bob, CHANNEL)]);

      const bobGot = waitForEvent<{ channelId: string; postId: string }>(
        bob,
        CHANNEL_EVENTS.POST_NEW,
      );

      // A new post is created via REST → the service calls the bus.
      channelEventBus.emitPostNew(CHANNEL, {
        id: 'post-1',
        channelId: CHANNEL,
        authorId: 'alice',
        authorDisplayName: 'Alice',
        authorAvatarUrl: null,
        body: 'Hello',
        images: [],
        reactionCounts: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(await bobGot).toMatchObject({ channelId: CHANNEL, post: { id: 'post-1' } });

      alice.disconnect();
      bob.disconnect();
    });
  });

  it('broadcasts a reaction update to the whole room', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, CHANNEL), subscribe(bob, CHANNEL)]);

      const bobGot = waitForEvent<{ channelId: string; postId: string; reactionCounts: object }>(
        bob,
        CHANNEL_EVENTS.POST_REACTION,
      );

      channelEventBus.emitPostReaction(CHANNEL, 'post-1', { '👍': 1 });

      expect(await bobGot).toMatchObject({
        channelId: CHANNEL,
        postId: 'post-1',
        reactionCounts: { '👍': 1 },
      });

      alice.disconnect();
      bob.disconnect();
    });
  });

  it('evicts a departed subscriber so they stop receiving the channel room broadcasts', async () => {
    findById.mockResolvedValue({ visibility: 'PRIVATE', deletedAt: null } as never);
    findSubscriber.mockResolvedValue({ channelId: CHANNEL, userId: 'alice' } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, CHANNEL), subscribe(bob, CHANNEL)]);

      let aliceGotPost = false;
      alice.on(CHANNEL_EVENTS.POST_NEW, () => {
        aliceGotPost = true;
      });

      // alice unsubscribes via REST → the bus broadcasts subscriber:left then
      // force-evicts her socket from the room.
      channelEventBus.emitSubscriberLeft(CHANNEL, 'alice');
      await new Promise((resolve) => setTimeout(resolve, 100));

      // A later room broadcast must reach bob but not the evicted alice.
      channelEventBus.emitPostNew(CHANNEL, {
        id: 'post-2',
        channelId: CHANNEL,
        authorId: 'bob',
        authorDisplayName: 'Bob',
        authorAvatarUrl: null,
        body: 'Hi',
        images: [],
        reactionCounts: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(aliceGotPost).toBe(false);
      alice.disconnect();
      bob.disconnect();
    });
  });

  it('evicts every subscriber and announces channel deletion', async () => {
    findById.mockResolvedValue({ visibility: 'PUBLIC', deletedAt: null } as never);
    await withServer(async (port) => {
      const alice = rawSocket(port, 'alice');
      const bob = rawSocket(port, 'bob');
      await Promise.all([waitForConnect(alice), waitForConnect(bob)]);
      await Promise.all([subscribe(alice, CHANNEL), subscribe(bob, CHANNEL)]);

      const deleted = waitForEvent<{ channelId: string }>(alice, CHANNEL_EVENTS.DELETED);

      // Channel soft-deleted via REST → the bus broadcasts channel:deleted and
      // evicts everyone.
      channelEventBus.emitDeleted(CHANNEL, ['alice', 'bob']);

      expect(await deleted).toMatchObject({ channelId: CHANNEL });

      // A post broadcast after deletion must not reach either evicted socket.
      let aliceGotPost = false;
      let bobGotPost = false;
      alice.on(CHANNEL_EVENTS.POST_NEW, () => {
        aliceGotPost = true;
      });
      bob.on(CHANNEL_EVENTS.POST_NEW, () => {
        bobGotPost = true;
      });
      channelEventBus.emitPostNew(CHANNEL, {
        id: 'post-3',
        channelId: CHANNEL,
        authorId: 'x',
        authorDisplayName: 'X',
        authorAvatarUrl: null,
        body: 'y',
        images: [],
        reactionCounts: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(aliceGotPost).toBe(false);
      expect(bobGotPost).toBe(false);
      alice.disconnect();
      bob.disconnect();
    });
  });
});
