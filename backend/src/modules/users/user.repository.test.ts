import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/user.model.js', () => ({
  UserModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { UserModel } from '../auth/user.model.js';
import { userDirectoryRepository } from './user.repository.js';

const mockModel = vi.mocked(UserModel);

function findChain(result: unknown) {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function countChain(result: number) {
  return { exec: vi.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userDirectoryRepository.listChatUsers', () => {
  it('applies skip/limit for the requested page and uses lean()', async () => {
    const chain = findChain([{ _id: 'user-2' }]);
    mockModel.find.mockReturnValue(chain as never);
    mockModel.countDocuments.mockReturnValue(countChain(41) as never);

    const result = await userDirectoryRepository.listChatUsers('user-1', 2, 20);

    expect(mockModel.find).toHaveBeenCalledWith({
      _id: { $ne: 'user-1' },
      isVerified: true,
      deletedAt: null,
    });
    expect(chain.sort).toHaveBeenCalledWith({ displayName: 1 });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.lean).toHaveBeenCalled();
    expect(result).toEqual({ items: [{ _id: 'user-2' }], total: 41, page: 2, pageSize: 20 });
  });

  it('excludes soft-deleted and unverified users via the shared filter', async () => {
    const chain = findChain([]);
    mockModel.find.mockReturnValue(chain as never);
    mockModel.countDocuments.mockReturnValue(countChain(0) as never);

    await userDirectoryRepository.listChatUsers('user-1', 1, 20);

    const filterArg = mockModel.find.mock.calls[0]?.[0];
    expect(filterArg).toEqual({ _id: { $ne: 'user-1' }, isVerified: true, deletedAt: null });
    expect(mockModel.countDocuments).toHaveBeenCalledWith(filterArg);
  });
});

describe('userDirectoryRepository.findVerifiedByPhoneNumbers', () => {
  it('queries verified, non-deleted users by phone and uses lean()', async () => {
    const chain = {
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([{ _id: 'user-2' }]),
    };
    mockModel.find.mockReturnValue(chain as never);

    const result = await userDirectoryRepository.findVerifiedByPhoneNumbers(['233241234567']);

    expect(mockModel.find).toHaveBeenCalledWith({
      phone: { $in: ['233241234567'] },
      isVerified: true,
      deletedAt: null,
    });
    expect(chain.lean).toHaveBeenCalled();
    expect(result).toEqual([{ _id: 'user-2' }]);
  });
});
