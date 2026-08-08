import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelEventBus, CHANNEL_EVENTS } from './channelEvents.js';
import type { SafePost } from '../modules/channels/channelPost.service.js';

interface EmitCall {
  room: string;
  event: string;
  payload: Record<string, unknown>;
}

interface LeaveCall {
  userRoom: string;
  channelRoom: string;
}

/** Builds a fake Socket.IO `Server` that records every room emit and eviction. */
function makeFakeIo(): {
  io: unknown;
  emits: EmitCall[];
  leaves: LeaveCall[];
} {
  const emits: EmitCall[] = [];
  const leaves: LeaveCall[] = [];

  const to = vi.fn((room: string) => ({
    emit: vi.fn((event: string, payload: Record<string, unknown>) => {
      emits.push({ room, event, payload });
    }),
  }));
  const inn = vi.fn((userRoom: string) => ({
    socketsLeave: vi.fn((channelRoom: string) => {
      leaves.push({ userRoom, channelRoom });
    }),
  }));

  return {
    io: { to, in: inn },
    emits,
    leaves,
  };
}

const fakePost: SafePost = {
  id: 'post-1',
  channelId: 'channel-1',
  authorId: 'user-1',
  authorDisplayName: 'Ama',
  authorAvatarUrl: null,
  body: 'Hello world',
  images: [],
  reactionCounts: { '👍': 1 },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  channelEventBus.attach(null as never);
});

describe('channelEventBus', () => {
  it('broadcasts a new post to the whole channel room with an at timestamp', () => {
    const fake = makeFakeIo();
    channelEventBus.attach(fake.io as never);

    channelEventBus.emitPostNew('channel-1', fakePost);

    expect(fake.emits).toHaveLength(1);
    expect(fake.emits[0]).toMatchObject({
      room: 'channel:channel-1',
      event: CHANNEL_EVENTS.POST_NEW,
      payload: { channelId: 'channel-1', post: fakePost },
    });
    expect(typeof fake.emits[0].payload.at).toBe('string');
  });

  it('broadcasts a reaction update to the whole channel room', () => {
    const fake = makeFakeIo();
    channelEventBus.attach(fake.io as never);

    channelEventBus.emitPostReaction('channel-1', 'post-1', { '👍': 2, '❤️': 1 });

    expect(fake.emits).toHaveLength(1);
    expect(fake.emits[0]).toMatchObject({
      room: 'channel:channel-1',
      event: CHANNEL_EVENTS.POST_REACTION,
      payload: { channelId: 'channel-1', postId: 'post-1', reactionCounts: { '👍': 2, '❤️': 1 } },
    });
  });

  it('broadcasts subscriber joined to the channel room and the user room', () => {
    const fake = makeFakeIo();
    channelEventBus.attach(fake.io as never);

    channelEventBus.emitSubscriberJoined('channel-1', 'user-9', 'SUBSCRIBER');

    expect(fake.emits).toHaveLength(2);
    expect(fake.emits[0]).toMatchObject({
      room: 'channel:channel-1',
      event: CHANNEL_EVENTS.SUBSCRIBER_JOINED,
      payload: { channelId: 'channel-1', userId: 'user-9', role: 'SUBSCRIBER' },
    });
    expect(fake.emits[1]).toMatchObject({
      room: 'user:user-9',
      event: CHANNEL_EVENTS.SUBSCRIBER_JOINED,
      payload: { channelId: 'channel-1', userId: 'user-9', role: 'SUBSCRIBER' },
    });
  });

  it('emits subscriber left to both rooms, then evicts the user from the channel room', () => {
    const fake = makeFakeIo();
    channelEventBus.attach(fake.io as never);

    channelEventBus.emitSubscriberLeft('channel-1', 'user-9');

    expect(fake.emits).toHaveLength(2);
    expect(fake.emits[0].event).toBe(CHANNEL_EVENTS.SUBSCRIBER_LEFT);
    expect(fake.emits[1]).toMatchObject({
      room: 'user:user-9',
      event: CHANNEL_EVENTS.SUBSCRIBER_LEFT,
    });

    // Eviction must remove all of the user's sockets from the channel room.
    expect(fake.leaves).toEqual([{ userRoom: 'user:user-9', channelRoom: 'channel:channel-1' }]);
  });

  it('emits channel deleted to every subscriber and evicts each from the room', () => {
    const fake = makeFakeIo();
    channelEventBus.attach(fake.io as never);

    channelEventBus.emitDeleted('channel-1', ['user-1', 'user-2']);

    // One broadcast to the room, plus one per subscriber.
    expect(fake.emits).toHaveLength(3);
    expect(fake.emits[0]).toMatchObject({
      room: 'channel:channel-1',
      event: CHANNEL_EVENTS.DELETED,
      payload: { channelId: 'channel-1' },
    });
    expect(fake.emits[1]).toMatchObject({
      room: 'user:user-1',
      event: CHANNEL_EVENTS.DELETED,
      payload: { channelId: 'channel-1' },
    });
    expect(fake.emits[2]).toMatchObject({
      room: 'user:user-2',
      event: CHANNEL_EVENTS.DELETED,
      payload: { channelId: 'channel-1' },
    });
    expect(fake.leaves).toEqual([
      { userRoom: 'user:user-1', channelRoom: 'channel:channel-1' },
      { userRoom: 'user:user-2', channelRoom: 'channel:channel-1' },
    ]);
  });

  it('is a no-op before attach', () => {
    const fake = makeFakeIo();
    // No `attach` call — the bus has no io.
    channelEventBus.emitPostNew('channel-1', fakePost);
    channelEventBus.emitDeleted('channel-1', ['user-1']);
    expect(fake.emits).toHaveLength(0);
    expect(fake.leaves).toHaveLength(0);
  });
});
