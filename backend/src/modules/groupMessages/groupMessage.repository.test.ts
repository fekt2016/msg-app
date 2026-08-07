import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./groupMessage.model.js', () => ({
  GroupMessageModel: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { GroupMessageModel } from './groupMessage.model.js';
import { groupMessageRepository } from './groupMessage.repository.js';

const mockModel = vi.mocked(GroupMessageModel) as unknown as {
  create: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
};

/** Builds a query stub whose `.exec()` resolves to `result`. */
function execChain(result: unknown) {
  return { exec: vi.fn().mockResolvedValue(result) };
}

function doc(overrides = {}) {
  return {
    _id: { toString: () => 'gm-1' },
    groupId: { toString: () => 'group-1' },
    senderId: { toString: () => 'user-a' },
    keyId: 3,
    ciphertext: 'ct',
    iv: 'iv',
    timestamp: 100,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupMessageRepository.create', () => {
  it('creates a stored group message', async () => {
    mockModel.create.mockResolvedValue(doc());
    const input = {
      groupId: 'group-1',
      senderId: 'user-a',
      keyId: 3,
      ciphertext: 'ct',
      iv: 'iv',
      timestamp: 100,
    };

    await expect(groupMessageRepository.create(input)).resolves.toBeDefined();
    expect(mockModel.create).toHaveBeenCalledWith(input);
  });
});

describe('groupMessageRepository.listByGroup', () => {
  it('queries per group, newest first, with pagination', async () => {
    mockModel.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => execChain([doc()]),
        }),
      }),
    });
    mockModel.countDocuments.mockResolvedValue(1);

    const result = await groupMessageRepository.listByGroup('group-1', 1, 20);

    expect(mockModel.find).toHaveBeenCalledWith({ groupId: 'group-1' });
    expect(mockModel.countDocuments).toHaveBeenCalledWith({ groupId: 'group-1' });
    expect(result).toEqual({
      items: [
        {
          id: 'gm-1',
          groupId: 'group-1',
          senderId: 'user-a',
          keyId: 3,
          ciphertext: 'ct',
          iv: 'iv',
          timestamp: 100,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('returns an empty page when there are no messages', async () => {
    mockModel.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => execChain([]),
        }),
      }),
    });
    mockModel.countDocuments.mockResolvedValue(0);

    const result = await groupMessageRepository.listByGroup('group-1', 1, 20);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
