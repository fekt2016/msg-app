import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./channel.model.js', () => ({
  ChannelModel: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('./channelSubscriber.model.js', () => ({
  ChannelSubscriberModel: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findByIds: vi.fn(),
  },
}));

import { ChannelModel } from './channel.model.js';
import { ChannelSubscriberModel } from './channelSubscriber.model.js';
import { userRepository } from '../auth/user.repository.js';
import { channelRepository } from './channel.repository.js';

const channelModel = vi.mocked(ChannelModel) as unknown as Record<string, ReturnType<typeof vi.fn>>;
const subscriberModel = vi.mocked(ChannelSubscriberModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

function execChain(result: unknown) {
  return {
    exec: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
}

function channelDoc(overrides: Record<string, unknown> = {}) {
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
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

function subscriberDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'sub-1' },
    channelId: { toString: () => 'channel-1' },
    userId: { toString: () => 'user-1' },
    role: 'SUBSCRIBER',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    toObject: () => ({
      channelId: { toString: () => 'channel-1' },
      userId: { toString: () => 'user-1' },
      role: 'SUBSCRIBER',
    }),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelRepository.create', () => {
  it('creates a channel with the given input', async () => {
    channelModel.create.mockResolvedValue(channelDoc());
    const input = {
      name: 'Accra News',
      slug: 'accra-news',
      visibility: 'PUBLIC',
      ownerId: 'user-1',
    };

    await expect(channelRepository.create(input)).resolves.toBeDefined();
    expect(channelModel.create).toHaveBeenCalledWith(input);
  });
});

describe('channelRepository.findByIdOrSlug', () => {
  it('looks up by id when the identifier is an ObjectId', async () => {
    channelModel.findOne.mockResolvedValue(channelDoc());
    await channelRepository.findByIdOrSlug('507f1f77bcf86cd799439011');
    expect(channelModel.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011' });
  });

  it('looks up by lowercased slug otherwise', async () => {
    channelModel.findOne.mockResolvedValue(channelDoc());
    await channelRepository.findByIdOrSlug('Accra News');
    expect(channelModel.findOne).toHaveBeenCalledWith({ slug: 'accra news' });
  });
});

describe('channelRepository.findVisible', () => {
  it('queries public, non-deleted channels sorted by subscriber count', async () => {
    const sort = vi.fn(() => ({
      skip: () => ({ limit: () => execChain([channelDoc()]) }),
    }));
    channelModel.find.mockReturnValue({ sort });
    channelModel.countDocuments.mockResolvedValue(1);

    const result = await channelRepository.findVisible(1, 20);

    expect(channelModel.find).toHaveBeenCalledWith({ visibility: 'PUBLIC', deletedAt: null });
    expect(channelModel.countDocuments).toHaveBeenCalledWith({
      visibility: 'PUBLIC',
      deletedAt: null,
    });
    expect(result.total).toBe(1);
  });
});

describe('channelRepository.addSubscriber', () => {
  it('creates a subscriber row', async () => {
    subscriberModel.create.mockResolvedValue(subscriberDoc());
    await channelRepository.addSubscriber('channel-1', 'user-2', 'SUBSCRIBER');
    expect(subscriberModel.create).toHaveBeenCalledWith({
      channelId: 'channel-1',
      userId: 'user-2',
      role: 'SUBSCRIBER',
    });
  });
});

describe('channelRepository.findSubscriber', () => {
  it('finds a subscriber row', async () => {
    subscriberModel.findOne.mockResolvedValue(subscriberDoc());
    await channelRepository.findSubscriber('channel-1', 'user-1');
    expect(subscriberModel.findOne).toHaveBeenCalledWith({
      channelId: 'channel-1',
      userId: 'user-1',
    });
  });
});

describe('channelRepository.findSubscriptions', () => {
  it('returns nothing for an empty id list', async () => {
    const result = await channelRepository.findSubscriptions([], 'user-1');
    expect(result).toEqual([]);
    expect(subscriberModel.find).not.toHaveBeenCalled();
  });

  it('queries subscriptions for the given channels and user', async () => {
    subscriberModel.find.mockResolvedValue([subscriberDoc()]);
    const result = await channelRepository.findSubscriptions(['channel-1', 'channel-2'], 'user-1');
    expect(subscriberModel.find).toHaveBeenCalledWith({
      channelId: { $in: ['channel-1', 'channel-2'] },
      userId: 'user-1',
    });
    expect(result).toHaveLength(1);
  });
});

describe('channelRepository.updateSubscriberRole', () => {
  it('updates the role on the matching row', async () => {
    subscriberModel.findOneAndUpdate.mockResolvedValue(subscriberDoc({ role: 'ADMIN' }));
    await channelRepository.updateSubscriberRole('channel-1', 'user-2', 'ADMIN');
    expect(subscriberModel.findOneAndUpdate).toHaveBeenCalledWith(
      { channelId: 'channel-1', userId: 'user-2' },
      { $set: { role: 'ADMIN' } },
      { new: true, runValidators: true },
    );
  });
});

describe('channelRepository.listSubscribers', () => {
  it('joins subscriber rows with user display names in one query', async () => {
    const sort = vi.fn(() => ({
      skip: () => ({ limit: () => execChain([subscriberDoc()]) }),
    }));
    subscriberModel.find.mockReturnValue({ sort });
    subscriberModel.countDocuments.mockResolvedValue(1);
    userRepository.findByIds.mockResolvedValue([
      {
        _id: { toString: () => 'user-1' },
        displayName: 'Ama',
        avatar: { url: 'https://img/a.png' },
      },
    ]);

    const result = await channelRepository.listSubscribers('channel-1', 1, 20);

    expect(userRepository.findByIds).toHaveBeenCalledWith(['user-1']);
    expect(result.items[0]).toMatchObject({
      userId: 'user-1',
      displayName: 'Ama',
      avatarUrl: 'https://img/a.png',
    });
  });
});

describe('channelRepository.listSubscriptionsForUser', () => {
  it('lists a user subscription rows', async () => {
    subscriberModel.find.mockResolvedValue([subscriberDoc()]);
    const result = await channelRepository.listSubscriptionsForUser('user-1');
    expect(subscriberModel.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(result).toHaveLength(1);
  });
});
