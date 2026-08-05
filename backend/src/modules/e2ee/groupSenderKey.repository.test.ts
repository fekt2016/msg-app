import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./groupSenderKey.model.js', () => ({
  GroupSenderKeyModel: {
    findOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

import { GroupSenderKeyModel } from './groupSenderKey.model.js';
import { groupSenderKeyRepository } from './groupSenderKey.repository.js';

const mockModel = vi.mocked(GroupSenderKeyModel) as unknown as {
  findOne: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

/** Builds a query stub whose `.exec()` resolves to `result`. */
function execChain(result: unknown) {
  return { exec: vi.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupSenderKeyRepository.find', () => {
  it('looks up a sender record by group and sender', async () => {
    const doc = { _id: 'x' };
    mockModel.findOne.mockReturnValue(execChain(doc));

    await expect(groupSenderKeyRepository.find('g-1', 'user-1')).resolves.toBe(doc);
    expect(mockModel.findOne).toHaveBeenCalledWith({ groupId: 'g-1', senderId: 'user-1' });
  });
});

describe('groupSenderKeyRepository.deleteByGroup', () => {
  it('deletes every sender-key record for a group', async () => {
    mockModel.deleteMany.mockReturnValue(execChain({ deletedCount: 2 }));

    await groupSenderKeyRepository.deleteByGroup('g-1');
    expect(mockModel.deleteMany).toHaveBeenCalledWith({ groupId: 'g-1' });
  });
});
