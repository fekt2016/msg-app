import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as channelRepositoryModule from './channel.repository.js';
import { channelService } from './channel.service.js';

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
    listSubscribers: vi.fn(),
    listSubscriptionsForUser: vi.fn(),
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
