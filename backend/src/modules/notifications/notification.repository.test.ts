import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./notification.model.js', () => ({
  NotificationModel: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { NotificationModel } from './notification.model.js';
import { notificationRepository } from './notification.repository.js';
import { encodeNotificationCursor } from './notificationCursor.js';

const model = vi.mocked(NotificationModel) as unknown as Record<string, ReturnType<typeof vi.fn>>;

const INPUT = {
  userId: 'u-1',
  type: 'chat:message' as const,
  title: 'Ama',
  body: 'Sent you a message',
  data: { senderId: 'u-2' },
};

function findChainResult(docs: unknown[]) {
  return {
    sort: () => ({ limit: () => Promise.resolve(docs) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationRepository.create', () => {
  it('persists with the IN_APP channel fixed server-side', async () => {
    model.create.mockResolvedValue({ _id: 'n-1' });
    await notificationRepository.create(INPUT);
    expect(model.create).toHaveBeenCalledWith({ ...INPUT, channel: 'IN_APP' });
  });
});

describe('notificationRepository.upsertUnread', () => {
  it('matches an unread row by user + type + coalesceKey and bumps it to the feed top', async () => {
    model.findOneAndUpdate.mockResolvedValue({ _id: 'n-1' });
    await notificationRepository.upsertUnread({ ...INPUT, coalesceKey: 'chat:u-2' });

    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      userId: 'u-1',
      type: 'chat:message',
      coalesceKey: 'chat:u-2',
      readAt: null,
    });
    expect(update.$set).toMatchObject({ body: INPUT.body, createdAt: expect.any(Date) });
    expect(model.findOneAndUpdate.mock.calls[0][2]).toMatchObject({ upsert: true, new: true });
  });
});

describe('notificationRepository.listFeed', () => {
  it('pages newest-first without a cursor', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    model.find.mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([{ _id: 'n-1', createdAt: now }]) }),
    });

    const result = await notificationRepository.listFeed('u-1', { limit: 20 });
    expect(model.find).toHaveBeenCalledWith({ userId: 'u-1' });
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
  });

  it('applies the compound cursor filter with a deterministic secondary sort', async () => {
    model.find.mockReturnValue(
      findChainResult([
        { _id: 'n-1', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { _id: 'n-2', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]),
    );
    const cursor = encodeNotificationCursor({
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      notificationId: '664f1c2b8f1b2c001f000001',
    });

    await notificationRepository.listFeed('u-1', { limit: 1, cursor });

    const [filter] = model.find.mock.calls[0];
    expect(filter.$or).toEqual([
      { createdAt: { $lt: new Date('2026-01-02T00:00:00.000Z') } },
      { createdAt: new Date('2026-01-02T00:00:00.000Z'), _id: { $lt: '664f1c2b8f1b2c001f000001' } },
    ]);
  });

  it('emits a nextCursor when the page is full (more rows remain)', async () => {
    model.find.mockReturnValue(
      findChainResult([
        { _id: 'n-1', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { _id: 'n-2', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]),
    );
    const result = await notificationRepository.listFeed('u-1', { limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toEqual(expect.any(String));
    const [filter] = model.find.mock.calls[0];
    expect(filter).toEqual({ userId: 'u-1' });
  });
});

describe('notificationRepository.countUnread', () => {
  it('counts only rows with a null readAt for the user', async () => {
    model.countDocuments.mockResolvedValue(3);
    expect(await notificationRepository.countUnread('u-1')).toBe(3);
    expect(model.countDocuments).toHaveBeenCalledWith({ userId: 'u-1', readAt: null });
  });
});

describe('notificationRepository.findOwned', () => {
  it('scopes the lookup to the owning user', async () => {
    model.findOne.mockResolvedValue({ _id: 'n-1' });
    await notificationRepository.findOwned('n-1', 'u-1');
    expect(model.findOne).toHaveBeenCalledWith({ _id: 'n-1', userId: 'u-1' });
  });
});

describe('notificationRepository.markRead', () => {
  it('sets readAt only on an unread owned row', async () => {
    model.findOneAndUpdate.mockResolvedValue({ _id: 'n-1' });
    await notificationRepository.markRead('n-1', 'u-1');
    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'n-1', userId: 'u-1', readAt: null });
    expect(update.$set.readAt).toEqual(expect.any(Date));
  });
});

describe('notificationRepository.markAllRead', () => {
  it('marks every unread row for the user and reports how many changed', async () => {
    model.updateMany.mockResolvedValue({ modifiedCount: 4 });
    expect(await notificationRepository.markAllRead('u-1')).toBe(4);
    expect(model.updateMany).toHaveBeenCalledWith(
      { userId: 'u-1', readAt: null },
      { $set: { readAt: expect.any(Date) } },
    );
  });
});
