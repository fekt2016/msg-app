import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./otpCode.model.js', () => ({
  OtpCodeModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    deleteOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

import { OtpCodeModel } from './otpCode.model.js';
import { otpRepository } from './otp.repository.js';

const mockModel = vi.mocked(OtpCodeModel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('otpRepository', () => {
  it('creates an otp code', async () => {
    mockModel.create.mockResolvedValue({});
    await otpRepository.create({
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      codeHash: 'hash',
      expiresAt: new Date(),
    });
    expect(mockModel.create).toHaveBeenCalledWith({
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      codeHash: 'hash',
      expiresAt: expect.any(Date),
    });
  });

  it('finds the latest code sorted newest-first', async () => {
    const sort = vi.fn();
    mockModel.findOne.mockReturnValue({ sort });
    sort.mockResolvedValue({});
    await otpRepository.findLatest('a@b.com', 'VERIFY');
    expect(mockModel.findOne).toHaveBeenCalledWith({ identifier: 'a@b.com', purpose: 'VERIFY' });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('counts recent codes within a window', async () => {
    mockModel.countDocuments.mockResolvedValue(2);
    const start = new Date();
    const count = await otpRepository.countRecent('a@b.com', 'VERIFY', start);
    expect(count).toBe(2);
    expect(mockModel.countDocuments).toHaveBeenCalledWith({
      identifier: 'a@b.com',
      purpose: 'VERIFY',
      createdAt: { $gte: start },
    });
  });

  it('deletes by id', async () => {
    await otpRepository.deleteById('otp-1');
    expect(mockModel.deleteOne).toHaveBeenCalledWith({ _id: 'otp-1' });
  });

  it('increments attempts', async () => {
    await otpRepository.incrementAttempts('otp-1');
    expect(mockModel.updateOne).toHaveBeenCalledWith({ _id: 'otp-1' }, { $inc: { attempts: 1 } });
  });
});
