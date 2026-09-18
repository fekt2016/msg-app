import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationService } from './notification.service.js';
import * as notificationRepositoryModule from './notification.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as notificationEventsModule from '../../realtime/notificationEvents.js';

vi.mock('./notification.repository.js', () => ({
  notificationRepository: {
    create: vi.fn(),
    upsertUnread: vi.fn(),
    listFeed: vi.fn(),
    countUnread: vi.fn(),
    findOwned: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../realtime/notificationEvents.js', () => ({
  notificationEventBus: {
    emitNew: vi.fn(),
    emitUnread: vi.fn(),
  },
}));

const repo = vi.mocked(notificationRepositoryModule.notificationRepository);
const users = vi.mocked(userRepositoryModule.userRepository);
const bus = vi.mocked(notificationEventsModule.notificationEventBus);

const NOW = new Date('2026-01-01T00:00:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'n-1' },
    userId: 'u-1',
    channel: 'IN_APP',
    type: 'chat:message',
    title: 'Ama',
    body: 'Sent you a message',
    data: { senderId: 'u-2' },
    coalesceKey: null,
    readAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.countUnread.mockResolvedValue(1);
});

describe('notificationService.notify (fire-and-forget surface)', () => {
  it('persists a one-per-event notification and fans out new + unread', async () => {
    repo.create.mockResolvedValue(fakeDoc());

    await notificationService.communityRoleUpdated(
      'accra-stars',
      'Accra Stars',
      'u-2',
      'MODERATOR',
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-2',
        type: 'community:role',
        title: 'Accra Stars',
        body: 'You are now a moderator',
        data: { type: 'community:role', identifier: 'accra-stars' },
      }),
    );
    expect(bus.emitNew).toHaveBeenCalledWith('u-2', expect.objectContaining({ id: 'n-1' }));
    expect(bus.emitUnread).toHaveBeenCalledWith('u-2', 1);
  });

  it('never throws when persistence fails — a failed notification cannot take down an event path', async () => {
    repo.create.mockRejectedValue(new Error('mongo down'));

    await expect(
      notificationService.communityRoleUpdated('s', 'n', 'u-2', 'MEMBER'),
    ).resolves.toBeUndefined();
    expect(bus.emitNew).not.toHaveBeenCalled();
  });
});

describe('notificationService.chatMessage', () => {
  it('resolves the sender name lazily and coalesces per sender', async () => {
    users.findById.mockResolvedValue({ displayName: 'Ama', _id: { toString: () => 'u-2' } });
    repo.upsertUnread.mockResolvedValue(fakeDoc());

    await notificationService.chatMessage('u-2', 'u-1');

    expect(users.findById).toHaveBeenCalledWith('u-2');
    expect(repo.upsertUnread).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        type: 'chat:message',
        coalesceKey: 'chat:u-2',
        title: 'Ama',
        data: { type: 'chat:message', senderId: 'u-2', senderName: 'Ama' },
      }),
    );
  });

  it('falls back to a generic title when the sender cannot be resolved', async () => {
    users.findById.mockResolvedValue(null);
    repo.upsertUnread.mockResolvedValue(fakeDoc());

    await notificationService.chatMessage('u-2', 'u-1');

    expect(repo.upsertUnread).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New message' }),
    );
  });
});

describe('notificationService.listFeed', () => {
  it('maps repository rows to the public shape and forwards the cursor', async () => {
    repo.listFeed.mockResolvedValue({ items: [fakeDoc()], nextCursor: 'c-1' });

    const result = await notificationService.listFeed('u-1', 'c-1', 20);

    expect(repo.listFeed).toHaveBeenCalledWith('u-1', { limit: 20, cursor: 'c-1' });
    expect(result.items[0]).toEqual({
      id: 'n-1',
      type: 'chat:message',
      title: 'Ama',
      body: 'Sent you a message',
      data: { senderId: 'u-2' },
      readAt: null,
      createdAt: NOW,
    });
    expect(result.nextCursor).toBe('c-1');
  });
});

describe('notificationService.getUnreadCount', () => {
  it('returns the unread count for the user', async () => {
    repo.countUnread.mockResolvedValue(5);
    expect(await notificationService.getUnreadCount('u-1')).toEqual({ count: 5 });
  });
});

describe('notificationService.markRead', () => {
  it('throws NOTIFICATION_NOT_FOUND when the row is not owned', async () => {
    repo.findOwned.mockResolvedValue(null);
    await expect(notificationService.markRead('u-1', 'n-99')).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
    });
  });

  it('is idempotent on an already-read row', async () => {
    repo.findOwned.mockResolvedValue(fakeDoc({ readAt: NOW }));
    await notificationService.markRead('u-1', 'n-1');
    expect(repo.markRead).not.toHaveBeenCalled();
    expect(bus.emitUnread).toHaveBeenCalledWith('u-1', 1);
  });

  it('marks unread rows read and emits the refreshed count', async () => {
    repo.findOwned.mockResolvedValue(fakeDoc());
    repo.markRead.mockResolvedValue(fakeDoc({ readAt: NOW }));

    const result = await notificationService.markRead('u-1', 'n-1');

    expect(repo.markRead).toHaveBeenCalledWith('n-1', 'u-1');
    expect(result.readAt).toEqual(NOW);
    expect(bus.emitUnread).toHaveBeenCalledWith('u-1', 1);
  });
});

describe('notificationService.markAllRead', () => {
  it('marks everything read and zeroes the live badge', async () => {
    repo.markAllRead.mockResolvedValue(3);
    const result = await notificationService.markAllRead('u-1');
    expect(result).toEqual({ updatedCount: 3 });
    expect(bus.emitUnread).toHaveBeenCalledWith('u-1', 0);
  });
});

describe('notificationService.groupMemberJoined', () => {
  it('is a no-op when there are no other members to notify', async () => {
    await notificationService.groupMemberJoined('g-1', 'Squad', 'u-3', []);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('notifies every provided member with the joiner resolved by name', async () => {
    users.findById.mockResolvedValue({ displayName: 'Kofi', _id: { toString: () => 'u-3' } });
    repo.create.mockResolvedValue(fakeDoc());

    await notificationService.groupMemberJoined('g-1', 'Squad', 'u-3', ['u-1', 'u-2']);

    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        type: 'group:member:joined',
        body: 'Kofi joined the group',
        data: { type: 'group:member:joined', groupId: 'g-1', groupName: 'Squad' },
      }),
    );
    expect(bus.emitUnread).toHaveBeenCalledTimes(2);
  });
});

describe('notificationService.groupMemberRemoved', () => {
  it('notifies the removed member with the removal body', async () => {
    repo.create.mockResolvedValue(fakeDoc());
    await notificationService.groupMemberRemoved('g-1', 'Squad', 'u-2');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-2',
        type: 'group:member:left',
        body: 'You were removed from the group',
      }),
    );
  });
});

describe('notificationService.channelPostCreated', () => {
  it('excludes the author from the subscriber fan-out', async () => {
    users.findById.mockResolvedValue(null);
    repo.create.mockResolvedValue(fakeDoc());

    await notificationService.channelPostCreated(
      'accra-news',
      'Accra News',
      ['u-1', 'u-2', 'u-3'],
      'u-2',
      'Ama',
      'p-1',
    );

    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        type: 'channel:post:new',
        data: expect.objectContaining({
          type: 'channel:post:new',
          identifier: 'accra-news',
          postId: 'p-1',
        }),
      }),
    );
    expect(repo.create).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-2' }));
  });
});

describe('notificationService.channelRequestApproved', () => {
  it('notifies the requester with the approval body and deep-link slug', async () => {
    repo.create.mockResolvedValue(fakeDoc());
    await notificationService.channelRequestApproved('acme-club', 'Acme Club', 'u-2');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-2',
        type: 'channel:request:approved',
        title: 'Acme Club',
        data: expect.objectContaining({
          type: 'channel:request:approved',
          identifier: 'acme-club',
        }),
      }),
    );
  });
});

describe('notificationService.storyLiked', () => {
  it('never notifies an author for their own like', async () => {
    await notificationService.storyLiked('st-1', 'u-2', 'u-2');
    expect(users.findById).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('notifies the author with the liker name and author details for deep-linking', async () => {
    users.findById.mockImplementation((id: string) => {
      if (id === 'u-1') {
        return Promise.resolve({ displayName: 'Ama', _id: { toString: () => 'u-1' } });
      }
      return Promise.resolve({ displayName: 'Kofi', _id: { toString: () => 'u-2' } });
    });
    repo.create.mockResolvedValue(fakeDoc());

    await notificationService.storyLiked('st-1', 'u-2', 'u-1');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        type: 'story:liked',
        title: 'Kofi',
        body: 'Liked your story',
        data: { type: 'story:liked', storyId: 'st-1', authorId: 'u-1', authorDisplayName: 'Ama' },
      }),
    );
  });
});
