import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as channelRepositoryModule from './channel.repository.js';
import { channelService } from './channel.service.js';

vi.mock('../../realtime/channelEvents.js', () => ({
  CHANNEL_EVENTS: {
    POST_NEW: 'channel:post:new',
    POST_UPDATED: 'channel:post:updated',
    POST_DELETED: 'channel:post:deleted',
    POST_REACTION: 'channel:post:reaction',
    SUBSCRIBER_JOINED: 'channel:subscriber:joined',
    SUBSCRIBER_LEFT: 'channel:subscriber:left',
    SUBSCRIBER_ROLE: 'channel:subscriber:role',
    DELETED: 'channel:deleted',
  },
  channelEventBus: {
    emitSubscriberJoined: vi.fn(),
    emitSubscriberLeft: vi.fn(),
    emitSubscriberRole: vi.fn(),
    emitDeleted: vi.fn(),
  },
}));

vi.mock('./channel.repository.js', () => ({
  channelRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByIds: vi.fn(),
    findByIdOrSlug: vi.fn(),
    findVisible: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementSubscriberCount: vi.fn(),
    findSubscriber: vi.fn(),
    findSubscriptions: vi.fn(),
    addSubscriber: vi.fn(),
    removeSubscriber: vi.fn(),
    updateSubscriberRole: vi.fn(),
    countSubscribers: vi.fn(),
    listSubscriberIds: vi.fn(),
    listSubscribers: vi.fn(),
    listSubscriptionsForUser: vi.fn(),
    createInvite: vi.fn(),
    findInviteByTokenHash: vi.fn(),
    listActiveInvites: vi.fn(),
    revokeInvite: vi.fn(),
    incrementInviteUsed: vi.fn(),
    createJoinRequest: vi.fn(),
    findLiveJoinRequest: vi.fn(),
    findJoinRequest: vi.fn(),
    listJoinRequests: vi.fn(),
    setJoinRequestStatus: vi.fn(),
  },
}));

const repo = vi.mocked(channelRepositoryModule.channelRepository);

function fakeChannel(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toString: () => 'channel-1' },
    name: 'Accra News',
    slug: 'accra-news',
    description: '',
    avatar: undefined,
    visibility: 'PUBLIC',
    ownerId: { toString: () => 'user-1' },
    subscriberCount: 1,
    postCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelService.create', () => {
  it('creates a channel and adds the creator as owner', async () => {
    repo.create.mockResolvedValue(fakeChannel());
    repo.findBySlug.mockResolvedValue(null);
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const result = await channelService.create('user-1', { name: 'Accra News' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'accra-news', visibility: 'PUBLIC', ownerId: 'user-1' }),
    );
    expect(repo.addSubscriber).toHaveBeenCalledWith('channel-1', 'user-1', 'OWNER');
    expect(repo.incrementSubscriberCount).toHaveBeenCalledWith('channel-1', 1);
    expect(result.role).toBe('OWNER');
    expect(result.channel.slug).toBe('accra-news');
  });

  it('generates a unique slug when the base slug is taken', async () => {
    repo.create.mockResolvedValue(fakeChannel({ slug: 'accra-news-2' }));
    repo.findBySlug.mockResolvedValueOnce(fakeChannel()).mockResolvedValueOnce(null);

    await channelService.create('user-1', { name: 'Accra News' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'accra-news-2' }));
  });

  it('creates a private channel when visibility is PRIVATE', async () => {
    repo.create.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findBySlug.mockResolvedValue(null);

    await channelService.create('user-1', { name: 'Secret Board', visibility: 'PRIVATE' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'PRIVATE' }));
  });
});

describe('channelService.list', () => {
  it('lists visible channels without viewer enrichment', async () => {
    repo.findVisible.mockResolvedValue({
      items: [fakeChannel()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await channelService.list(1, 20);

    expect(repo.findVisible).toHaveBeenCalledWith(1, 20);
    expect(result.items[0].name).toBe('Accra News');
    expect(result.items[0].isSubscribed).toBe(false);
    expect(repo.findSubscriptions).not.toHaveBeenCalled();
  });

  it('enriches browse items with the viewer subscription via one batched query', async () => {
    repo.findVisible.mockResolvedValue({
      items: [fakeChannel()],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    repo.findSubscriptions.mockResolvedValue([
      { channelId: { toString: () => 'channel-1' }, role: 'SUBSCRIBER' },
    ]);

    const result = await channelService.list(1, 20, 'user-2');

    expect(repo.findSubscriptions).toHaveBeenCalledWith(['channel-1'], 'user-2');
    expect(result.items[0].isSubscribed).toBe(true);
    expect(result.items[0].role).toBe('SUBSCRIBER');
  });
});

describe('channelService.listMine', () => {
  it('returns the viewer subscribed channels with roles', async () => {
    repo.listSubscriptionsForUser.mockResolvedValue([
      { channelId: { toString: () => 'channel-1' }, role: 'ADMIN' },
      { channelId: { toString: () => 'channel-2' }, role: 'SUBSCRIBER' },
    ]);
    repo.findByIds.mockResolvedValue([fakeChannel()]);

    const result = await channelService.listMine('user-1');

    expect(repo.listSubscriptionsForUser).toHaveBeenCalledWith('user-1');
    expect(repo.findByIds).toHaveBeenCalledWith(['channel-1', 'channel-2']);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isSubscribed).toBe(true);
    expect(result.items[0].role).toBe('ADMIN');
  });

  it('returns an empty list when the viewer has no subscriptions', async () => {
    repo.listSubscriptionsForUser.mockResolvedValue([]);
    repo.findByIds.mockResolvedValue([]);

    const result = await channelService.listMine('user-1');

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('channelService.getByIdOrSlug', () => {
  it('returns the channel without subscription for anonymous viewers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());

    const result = await channelService.getByIdOrSlug('accra-news');

    expect(result).toEqual(
      expect.objectContaining({ isSubscribed: false, role: null, slug: 'accra-news' }),
    );
    expect(repo.findSubscriber).not.toHaveBeenCalled();
  });

  it('returns subscription for authenticated viewers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const result = await channelService.getByIdOrSlug('channel-1', 'user-2');

    expect(result.isSubscribed).toBe(true);
    expect(result.role).toBe('SUBSCRIBER');
  });

  it('throws 404 for a deleted channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ deletedAt: new Date() }));

    await expect(channelService.getByIdOrSlug('accra-news')).rejects.toMatchObject({
      code: 'CHANNEL_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws 404 when not found', async () => {
    repo.findByIdOrSlug.mockResolvedValue(null);

    await expect(channelService.getByIdOrSlug('nope')).rejects.toMatchObject({
      code: 'CHANNEL_NOT_FOUND',
    });
  });

  it('forbids non-subscribers from viewing a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);

    await expect(channelService.getByIdOrSlug('secret', 'user-9')).rejects.toMatchObject({
      code: 'PRIVATE_CHANNEL',
      statusCode: 403,
    });
  });

  it('allows subscribers to view a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const result = await channelService.getByIdOrSlug('secret', 'user-2');

    expect(result.isSubscribed).toBe(true);
    expect(result.visibility).toBe('PRIVATE');
  });
});

describe('channelService.update', () => {
  it('updates name, regenerates the slug, and returns the updated channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.findBySlug.mockResolvedValue(null);
    repo.update.mockResolvedValue(fakeChannel({ name: 'New Name', slug: 'new-name' }));

    const result = await channelService.update('user-1', 'accra-news', { name: 'New Name' });

    expect(repo.update).toHaveBeenCalledWith('channel-1', { name: 'New Name', slug: 'new-name' });
    expect(result.name).toBe('New Name');
  });

  it('forbids non-subscribers from updating', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);

    await expect(
      channelService.update('user-9', 'accra-news', { description: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('forbids plain subscribers from updating', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    await expect(
      channelService.update('user-9', 'accra-news', { description: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('channelService.softDelete', () => {
  it('soft-deletes as the owner', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.softDelete.mockResolvedValue(fakeChannel({ deletedAt: new Date() }));

    await channelService.softDelete('user-1', 'accra-news');

    expect(repo.softDelete).toHaveBeenCalledWith('channel-1');
  });

  it('forbids admins from deleting', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'ADMIN' });

    await expect(channelService.softDelete('user-2', 'accra-news')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('channelService.subscribe', () => {
  it('subscribes to a public channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const result = await channelService.subscribe('user-2', 'accra-news');

    expect(repo.addSubscriber).toHaveBeenCalledWith('channel-1', 'user-2', 'SUBSCRIBER');
    expect(result.isSubscribed).toBe(true);
    expect(result.subscriberCount).toBe(2);
  });

  it('forbids subscribing to a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    await expect(channelService.subscribe('user-2', 'secret')).rejects.toMatchObject({
      code: 'PRIVATE_CHANNEL',
      statusCode: 403,
    });
  });

  it('is idempotent for existing subscribers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const result = await channelService.subscribe('user-2', 'accra-news');

    expect(repo.addSubscriber).not.toHaveBeenCalled();
    expect(result.isSubscribed).toBe(true);
    expect(result.role).toBe('SUBSCRIBER');
  });
});

describe('channelService.unsubscribe', () => {
  it('unsubscribes a subscriber', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });
    repo.removeSubscriber.mockResolvedValue(undefined);
    repo.incrementSubscriberCount.mockResolvedValue(undefined);

    const result = await channelService.unsubscribe('user-2', 'accra-news');

    expect(repo.removeSubscriber).toHaveBeenCalledWith('channel-1', 'user-2');
    expect(result.isSubscribed).toBe(false);
  });

  it('forbids the owner from unsubscribing', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });

    await expect(channelService.unsubscribe('user-1', 'accra-news')).rejects.toMatchObject({
      code: 'OWNER_CANNOT_UNSUBSCRIBE',
      statusCode: 400,
    });
  });
});

describe('channelService.updateSubscriberRole', () => {
  it('updates a subscriber role to ADMIN', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'SUBSCRIBER' });
    repo.updateSubscriberRole.mockResolvedValue({ role: 'ADMIN' });

    await channelService.updateSubscriberRole('user-1', 'accra-news', 'user-2', 'ADMIN');

    expect(repo.updateSubscriberRole).toHaveBeenCalledWith('channel-1', 'user-2', 'ADMIN');
  });

  it('cannot assign the OWNER role', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });

    await expect(
      channelService.updateSubscriberRole('user-1', 'accra-news', 'user-2', 'OWNER'),
    ).rejects.toMatchObject({ code: 'CANNOT_ASSIGN_OWNER' });
  });

  it('cannot modify the owner row', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'OWNER' });

    await expect(
      channelService.updateSubscriberRole('user-1', 'accra-news', 'user-1', 'ADMIN'),
    ).rejects.toMatchObject({ code: 'CANNOT_MODIFY_OWNER' });
  });
});

describe('channelService.listSubscribers', () => {
  it('returns paginated subscribers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.listSubscribers.mockResolvedValue({
      items: [{ userId: 'user-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await channelService.listSubscribers('accra-news', 'user-1', 1, 20);

    expect(repo.listSubscribers).toHaveBeenCalledWith('channel-1', 1, 20);
    expect(result.items).toHaveLength(1);
  });

  it('forbids non-subscribers from listing a private channel subscribers', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);

    await expect(channelService.listSubscribers('secret', 'user-9', 1, 20)).rejects.toMatchObject({
      code: 'PRIVATE_CHANNEL',
      statusCode: 403,
    });
  });
});

function fakeInvite(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'invite-1' },
    channelId: { toString: () => 'channel-1' },
    createdBy: { toString: () => 'user-1' },
    tokenHash: 'hashed-token',
    role: 'SUBSCRIBER',
    expiresAt: new Date(Date.now() + 86400000),
    usedCount: 0,
    maxUses: 1,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

describe('channelService.createInvite', () => {
  it('creates an invite and returns the raw token once', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.createInvite.mockResolvedValue(fakeInvite());

    const result = await channelService.createInvite('user-1', 'accra-news', {});

    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThanOrEqual(40);
    expect(repo.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        createdBy: 'user-1',
        role: 'SUBSCRIBER',
        maxUses: 1,
      }),
    );
    expect(repo.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it('forbids a plain subscriber from creating invites', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    await expect(channelService.createInvite('user-9', 'accra-news', {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('channelService.listInvites', () => {
  it('lists active invites for a channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'ADMIN' });
    repo.listActiveInvites.mockResolvedValue([fakeInvite()]);

    const result = await channelService.listInvites('user-1', 'accra-news');

    expect(repo.listActiveInvites).toHaveBeenCalledWith('channel-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('invite-1');
  });
});

describe('channelService.revokeInvite', () => {
  it('revokes an invite belonging to the channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.revokeInvite.mockResolvedValue(fakeInvite());

    await channelService.revokeInvite('user-1', 'accra-news', 'invite-1');

    expect(repo.revokeInvite).toHaveBeenCalledWith('invite-1');
  });

  it('throws 404 when the invite does not exist', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.revokeInvite.mockResolvedValue(null);

    await expect(channelService.revokeInvite('user-1', 'accra-news', 'nope')).rejects.toMatchObject(
      { code: 'INVITE_NOT_FOUND', statusCode: 404 },
    );
  });
});

describe('channelService.previewInvite', () => {
  it('previews the channel name, role and expiry without side effects', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite());
    repo.findById.mockResolvedValue(fakeChannel());

    const result = await channelService.previewInvite('raw-token');

    expect(repo.findInviteByTokenHash).toHaveBeenCalledWith(expect.any(String));
    expect(result).toEqual(
      expect.objectContaining({
        channelName: 'Accra News',
        channelSlug: 'accra-news',
        role: 'SUBSCRIBER',
      }),
    );
  });

  it('throws 404 for an unknown token', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(null);

    await expect(channelService.previewInvite('bad')).rejects.toMatchObject({
      code: 'INVITE_INVALID',
      statusCode: 404,
    });
  });

  it('throws 410 for a revoked invite', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite({ revokedAt: new Date() }));

    await expect(channelService.previewInvite('raw-token')).rejects.toMatchObject({
      code: 'INVITE_GONE',
      statusCode: 410,
    });
  });

  it('throws 410 for an expired invite', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(
      fakeInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(channelService.previewInvite('raw-token')).rejects.toMatchObject({
      code: 'INVITE_GONE',
      statusCode: 410,
    });
  });

  it('throws 410 for a used-up invite', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite({ usedCount: 1, maxUses: 1 }));

    await expect(channelService.previewInvite('raw-token')).rejects.toMatchObject({
      code: 'INVITE_GONE',
      statusCode: 410,
    });
  });
});

describe('channelService.joinViaInvite', () => {
  it('adds the user as a subscriber and consumes the invite', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite());
    repo.findById.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue(null);
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);
    repo.incrementInviteUsed.mockResolvedValue(undefined);

    const result = await channelService.joinViaInvite('user-2', 'raw-token');

    expect(repo.addSubscriber).toHaveBeenCalledWith('channel-1', 'user-2', 'SUBSCRIBER');
    expect(repo.incrementSubscriberCount).toHaveBeenCalledWith('channel-1', 1);
    expect(repo.incrementInviteUsed).toHaveBeenCalledWith('invite-1');
    expect(result).toEqual(expect.objectContaining({ joined: true, upgraded: false }));
  });

  it('returns a no-op for an already-subscribed user', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite());
    repo.findById.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    const result = await channelService.joinViaInvite('user-2', 'raw-token');

    expect(repo.addSubscriber).not.toHaveBeenCalled();
    expect(repo.incrementInviteUsed).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ joined: false, upgraded: false, role: 'SUBSCRIBER' }),
    );
  });

  it('upgrades a subscriber to admin when the invite grants admin', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite({ role: 'ADMIN' }));
    repo.findById.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });
    repo.updateSubscriberRole.mockResolvedValue({ role: 'ADMIN' });

    const result = await channelService.joinViaInvite('user-2', 'raw-token');

    expect(repo.updateSubscriberRole).toHaveBeenCalledWith('channel-1', 'user-2', 'ADMIN');
    expect(result.upgraded).toBe(true);
  });

  it('never downgrades an existing admin', async () => {
    repo.findInviteByTokenHash.mockResolvedValue(fakeInvite());
    repo.findById.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'ADMIN' });

    const result = await channelService.joinViaInvite('user-2', 'raw-token');

    expect(repo.updateSubscriberRole).not.toHaveBeenCalled();
    expect(result.role).toBe('ADMIN');
  });
});

describe('channelService.createJoinRequest', () => {
  it('creates a pending request for a private channel', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);
    repo.findLiveJoinRequest.mockResolvedValue(null);
    repo.createJoinRequest.mockResolvedValue({});

    await channelService.createJoinRequest('user-2', 'secret');

    expect(repo.createJoinRequest).toHaveBeenCalledWith('channel-1', 'user-2');
  });

  it('rejects requests to public channels', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());

    await expect(channelService.createJoinRequest('user-2', 'accra-news')).rejects.toMatchObject({
      code: 'PUBLIC_CHANNEL_OPEN',
      statusCode: 400,
    });
  });

  it('conflicts when the user is already subscribed', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue({ role: 'SUBSCRIBER' });

    await expect(channelService.createJoinRequest('user-2', 'secret')).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
      statusCode: 409,
    });
  });

  it('conflicts when a request is already pending', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel({ visibility: 'PRIVATE' }));
    repo.findSubscriber.mockResolvedValue(null);
    repo.findLiveJoinRequest.mockResolvedValue({ status: 'PENDING' });

    await expect(channelService.createJoinRequest('user-2', 'secret')).rejects.toMatchObject({
      code: 'REQUEST_PENDING',
      statusCode: 409,
    });
  });
});

describe('channelService.listJoinRequests', () => {
  it('lists requests joined with requester display info', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.listJoinRequests.mockResolvedValue({
      items: [
        {
          request: {
            userId: { toString: () => 'user-2' },
            role: 'SUBSCRIBER',
            status: 'PENDING',
            createdAt: new Date(),
            decidedAt: null,
            decidedBy: null,
          },
          displayName: 'Kwame',
          avatarUrl: 'https://img/k.png',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await channelService.listJoinRequests('user-1', 'accra-news', 'PENDING', 1, 20);

    expect(repo.listJoinRequests).toHaveBeenCalledWith('channel-1', 'PENDING', 1, 20);
    expect(result.items[0]).toMatchObject({ userId: 'user-2', displayName: 'Kwame' });
  });
});

describe('channelService.decideJoinRequest', () => {
  it('approves a request, creating the subscription row', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValueOnce({ role: 'OWNER' }).mockResolvedValueOnce(null);
    repo.findLiveJoinRequest.mockResolvedValue({ status: 'PENDING' });
    repo.addSubscriber.mockResolvedValue({});
    repo.incrementSubscriberCount.mockResolvedValue(undefined);
    repo.setJoinRequestStatus.mockResolvedValue({});

    await channelService.decideJoinRequest('user-1', 'accra-news', 'user-2', 'APPROVE');

    expect(repo.addSubscriber).toHaveBeenCalledWith('channel-1', 'user-2', 'SUBSCRIBER');
    expect(repo.incrementSubscriberCount).toHaveBeenCalledWith('channel-1', 1);
    expect(repo.setJoinRequestStatus).toHaveBeenCalledWith(
      'channel-1',
      'user-2',
      'APPROVED',
      'user-1',
    );
  });

  it('denies a request without creating a subscription row', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.findLiveJoinRequest.mockResolvedValue({ status: 'PENDING' });
    repo.setJoinRequestStatus.mockResolvedValue({});

    await channelService.decideJoinRequest('user-1', 'accra-news', 'user-2', 'DENY');

    expect(repo.addSubscriber).not.toHaveBeenCalled();
    expect(repo.setJoinRequestStatus).toHaveBeenCalledWith(
      'channel-1',
      'user-2',
      'DENIED',
      'user-1',
    );
  });

  it('throws 404 when there is no pending request', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber.mockResolvedValue({ role: 'OWNER' });
    repo.findLiveJoinRequest.mockResolvedValue(null);

    await expect(
      channelService.decideJoinRequest('user-1', 'accra-news', 'user-2', 'APPROVE'),
    ).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND', statusCode: 404 });
  });

  it('conflicts when the target is already subscribed', async () => {
    repo.findByIdOrSlug.mockResolvedValue(fakeChannel());
    repo.findSubscriber
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'SUBSCRIBER' });
    repo.findLiveJoinRequest.mockResolvedValue({ status: 'PENDING' });

    await expect(
      channelService.decideJoinRequest('user-1', 'accra-news', 'user-2', 'APPROVE'),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED', statusCode: 409 });
  });
});
