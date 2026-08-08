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

vi.mock('./channelInvite.model.js', () => ({
  ChannelInviteModel: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('./channelJoinRequest.model.js', () => ({
  ChannelJoinRequestModel: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
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
import { ChannelInviteModel } from './channelInvite.model.js';
import { ChannelJoinRequestModel } from './channelJoinRequest.model.js';
import { userRepository } from '../auth/user.repository.js';
import { channelRepository } from './channel.repository.js';

const channelModel = vi.mocked(ChannelModel) as unknown as Record<string, ReturnType<typeof vi.fn>>;
const subscriberModel = vi.mocked(ChannelSubscriberModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const inviteModel = vi.mocked(ChannelInviteModel) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const joinRequestModel = vi.mocked(ChannelJoinRequestModel) as unknown as Record<
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
  it('lists a user subscription rows, paginated', async () => {
    const sort = vi.fn(() => ({
      skip: () => ({ limit: () => execChain([subscriberDoc()]) }),
    }));
    subscriberModel.find.mockReturnValue({ sort });
    subscriberModel.countDocuments.mockResolvedValue(1);

    const result = await channelRepository.listSubscriptionsForUser('user-1', 1, 20);

    expect(subscriberModel.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(subscriberModel.countDocuments).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

function inviteDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'invite-1' },
    channelId: { toString: () => 'channel-1' },
    createdBy: { toString: () => 'user-1' },
    tokenHash: 'hashed-token',
    role: 'SUBSCRIBER',
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    usedCount: 0,
    maxUses: 1,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

function joinRequestDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'request-1' },
    channelId: { toString: () => 'channel-1' },
    userId: { toString: () => 'user-2' },
    role: 'SUBSCRIBER',
    status: 'PENDING',
    decidedAt: null,
    decidedBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

describe('channelRepository invites', () => {
  it('creates an invite', async () => {
    inviteModel.create.mockResolvedValue(inviteDoc());
    const input = {
      channelId: 'channel-1',
      createdBy: 'user-1',
      tokenHash: 'hashed-token',
      role: 'ADMIN' as const,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      maxUses: 1,
    };
    await channelRepository.createInvite(input);
    expect(inviteModel.create).toHaveBeenCalledWith(input);
  });

  it('finds an invite by token hash', async () => {
    inviteModel.findOne.mockResolvedValue(inviteDoc());
    const result = await channelRepository.findInviteByTokenHash('hashed-token');
    expect(inviteModel.findOne).toHaveBeenCalledWith({ tokenHash: 'hashed-token' });
    expect(result).toBeDefined();
  });

  it('lists active (non-revoked) invites for a channel sorted newest first', async () => {
    inviteModel.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([inviteDoc()]) });
    const result = await channelRepository.listActiveInvites('channel-1');
    expect(inviteModel.find).toHaveBeenCalledWith({ channelId: 'channel-1', revokedAt: null });
    expect(inviteModel.find).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it('revokes an invite scoped to its channel (B2 — no cross-channel revoke)', async () => {
    inviteModel.findOneAndUpdate.mockResolvedValue(inviteDoc({ revokedAt: new Date() }));
    await channelRepository.revokeInvite('invite-1', 'channel-1');
    expect(inviteModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'invite-1', channelId: 'channel-1' },
      { $set: { revokedAt: expect.any(Date) } },
      { new: true },
    );
  });

  it('atomically consumes an invite behind a maxUses guard (B1)', async () => {
    inviteModel.findOneAndUpdate.mockResolvedValue(inviteDoc({ usedCount: 1 }));
    const result = await channelRepository.consumeInvite('invite-1');
    expect(inviteModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'invite-1',
        revokedAt: null,
        expiresAt: { $gt: expect.any(Date) },
        $expr: { $lt: ['$usedCount', '$maxUses'] },
      },
      { $inc: { usedCount: 1 } },
      { new: true },
    );
    expect(result).not.toBeNull();
  });

  it('returns null when the invite can no longer be consumed (B1 race lost)', async () => {
    inviteModel.findOneAndUpdate.mockResolvedValue(null);
    const result = await channelRepository.consumeInvite('invite-1');
    expect(result).toBeNull();
  });
});

describe('channelRepository join requests', () => {
  it('creates a pending join request', async () => {
    joinRequestModel.create.mockResolvedValue(joinRequestDoc());
    await channelRepository.createJoinRequest('channel-1', 'user-2');
    expect(joinRequestModel.create).toHaveBeenCalledWith({
      channelId: 'channel-1',
      userId: 'user-2',
    });
  });

  it('finds the live pending request for a user', async () => {
    joinRequestModel.findOne.mockResolvedValue(joinRequestDoc());
    const result = await channelRepository.findLiveJoinRequest('channel-1', 'user-2');
    expect(joinRequestModel.findOne).toHaveBeenCalledWith({
      channelId: 'channel-1',
      userId: 'user-2',
      status: 'PENDING',
    });
    expect(result).toBeDefined();
  });

  it('lists requests with the requester display name joined in one query', async () => {
    const sort = vi.fn(() => ({
      skip: () => ({ limit: () => execChain([joinRequestDoc()]) }),
    }));
    joinRequestModel.find.mockReturnValue({ sort });
    joinRequestModel.countDocuments.mockResolvedValue(1);
    userRepository.findByIds.mockResolvedValue([
      {
        _id: { toString: () => 'user-2' },
        displayName: 'Kwame',
        avatar: { url: 'https://img/k.png' },
      },
    ]);

    const result = await channelRepository.listJoinRequests('channel-1', 'PENDING', 1, 20);

    expect(joinRequestModel.find).toHaveBeenCalledWith({
      channelId: 'channel-1',
      status: 'PENDING',
    });
    expect(userRepository.findByIds).toHaveBeenCalledWith(['user-2']);
    expect(result.items[0].displayName).toBe('Kwame');
    expect(result.items[0].avatarUrl).toBe('https://img/k.png');
  });

  it('transitions a pending request to a decided status', async () => {
    joinRequestModel.findOneAndUpdate.mockResolvedValue(joinRequestDoc({ status: 'APPROVED' }));
    await channelRepository.setJoinRequestStatus('channel-1', 'user-2', 'APPROVED', 'user-1');
    expect(joinRequestModel.findOneAndUpdate).toHaveBeenCalledWith(
      { channelId: 'channel-1', userId: 'user-2', status: 'PENDING' },
      { $set: { status: 'APPROVED', decidedAt: expect.any(Date), decidedBy: 'user-1' } },
      { new: true },
    );
  });
});
