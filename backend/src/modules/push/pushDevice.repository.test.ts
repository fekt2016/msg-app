import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pushDevice.model.js', () => ({
  PushDeviceModel: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

import { pushDeviceRepository } from './pushDevice.repository.js';
import { PushDeviceModel } from './pushDevice.model.js';

const model = vi.mocked(PushDeviceModel) as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pushDeviceRepository.upsertByDeviceId', () => {
  it('upserts keyed on deviceId so a device never accumulates duplicate rows', async () => {
    model.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ deviceId: 'd-1' }) });

    await pushDeviceRepository.upsertByDeviceId({
      userId: 'u-1',
      deviceId: 'd-1',
      pushToken: 'tok',
      platform: 'android',
    });

    const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ deviceId: 'd-1' });
    expect(update).toMatchObject({ userId: 'u-1', pushToken: 'tok', platform: 'android' });
    expect(options).toMatchObject({ upsert: true, new: true });
  });
});

describe('pushDeviceRepository.listTokensByUserId', () => {
  it('returns only the push tokens for the user', async () => {
    model.find.mockReturnValue({
      lean: () => Promise.resolve([{ pushToken: 'a' }, { pushToken: 'b' }]),
    });

    const tokens = await pushDeviceRepository.listTokensByUserId('u-1');

    expect(model.find).toHaveBeenCalledWith({ userId: 'u-1' }, { pushToken: 1 });
    expect(tokens).toEqual(['a', 'b']);
  });
});

describe('pushDeviceRepository.deleteByDeviceIdForUser', () => {
  it('scopes the delete to the owning user and reports whether a row was removed', async () => {
    model.deleteOne.mockResolvedValue({ deletedCount: 1 });
    expect(await pushDeviceRepository.deleteByDeviceIdForUser('d-1', 'u-1')).toBe(true);
    expect(model.deleteOne).toHaveBeenCalledWith({ deviceId: 'd-1', userId: 'u-1' });

    model.deleteOne.mockResolvedValue({ deletedCount: 0 });
    expect(await pushDeviceRepository.deleteByDeviceIdForUser('d-1', 'other')).toBe(false);
  });
});
