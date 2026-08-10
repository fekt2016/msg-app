import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pushDevice.repository.js', () => ({
  pushDeviceRepository: {
    upsertByDeviceId: vi.fn(),
    listByUserId: vi.fn(),
    listTokensByUserId: vi.fn(),
    deleteByDeviceIdForUser: vi.fn(),
  },
}));

vi.mock('./push.provider.js', () => ({
  pushProvider: { send: vi.fn() },
}));

vi.mock('../../realtime/presence.js', () => ({
  presenceStore: { getOnlineUserIds: vi.fn() },
}));

import { pushService } from './push.service.js';
import { pushDeviceRepository } from './pushDevice.repository.js';
import { pushProvider } from './push.provider.js';
import { presenceStore } from '../../realtime/presence.js';
import { AppError } from '../../errors/AppError.js';

const repo = vi.mocked(pushDeviceRepository);
const provider = vi.mocked(pushProvider);
const presence = vi.mocked(presenceStore);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pushService.registerDevice', () => {
  it('upserts and returns a public device shape without the push token', async () => {
    repo.upsertByDeviceId.mockResolvedValue({
      deviceId: 'dev-1',
      platform: 'android',
      appVersion: '1.0.0',
      pushToken: 'ExponentPushToken[secret]',
      updatedAt: new Date('2026-01-01'),
    } as never);

    const result = await pushService.registerDevice({
      userId: 'u1',
      deviceId: 'dev-1',
      pushToken: 'ExponentPushToken[secret]',
      platform: 'android',
    });

    expect(repo.upsertByDeviceId).toHaveBeenCalledWith({
      userId: 'u1',
      deviceId: 'dev-1',
      pushToken: 'ExponentPushToken[secret]',
      platform: 'android',
    });
    expect(result).not.toHaveProperty('pushToken');
    expect(result.deviceId).toBe('dev-1');
  });
});

describe('pushService.unregisterDevice', () => {
  it('deletes scoped to the owner', async () => {
    repo.deleteByDeviceIdForUser.mockResolvedValue(true);
    await pushService.unregisterDevice('u1', 'dev-1');
    expect(repo.deleteByDeviceIdForUser).toHaveBeenCalledWith('dev-1', 'u1');
  });

  it('throws 404 when no matching device is owned by the user', async () => {
    repo.deleteByDeviceIdForUser.mockResolvedValue(false);
    await expect(pushService.unregisterDevice('u1', 'dev-1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('pushService.listDevices', () => {
  it('never leaks push tokens', async () => {
    repo.listByUserId.mockResolvedValue([
      {
        deviceId: 'dev-1',
        platform: 'ios',
        appVersion: '',
        pushToken: 'ExponentPushToken[secret]',
        updatedAt: new Date(),
      },
    ] as never);

    const result = await pushService.listDevices('u1');
    expect(result[0]).not.toHaveProperty('pushToken');
  });
});

describe('pushService.notifyIfOffline', () => {
  it('does not send when the recipient is online', async () => {
    presence.getOnlineUserIds.mockResolvedValue(['u2']);
    await pushService.notifyIfOffline('u2', { title: 't', body: 'b' });
    expect(repo.listTokensByUserId).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('sends to the recipient tokens when offline', async () => {
    presence.getOnlineUserIds.mockResolvedValue([]);
    repo.listTokensByUserId.mockResolvedValue(['ExponentPushToken[a]']);
    await pushService.notifyIfOffline('u2', { title: 't', body: 'b', data: { x: 1 } });
    expect(provider.send).toHaveBeenCalledWith({
      tokens: ['ExponentPushToken[a]'],
      title: 't',
      body: 'b',
      data: { x: 1 },
    });
  });

  it('is a no-op when the recipient has no registered devices', async () => {
    presence.getOnlineUserIds.mockResolvedValue([]);
    repo.listTokensByUserId.mockResolvedValue([]);
    await pushService.notifyIfOffline('u2', { title: 't', body: 'b' });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('swallows provider errors (best-effort, never throws)', async () => {
    presence.getOnlineUserIds.mockResolvedValue([]);
    repo.listTokensByUserId.mockResolvedValue(['ExponentPushToken[a]']);
    provider.send.mockRejectedValue(new Error('expo down'));
    await expect(
      pushService.notifyIfOffline('u2', { title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
  });
});

describe('pushService.notifyOfflineUsers', () => {
  it('excludes the sender and online members, and sends to the rest', async () => {
    presence.getOnlineUserIds.mockResolvedValue(['u2']); // u2 online
    repo.listTokensByUserId.mockImplementation(async (id: string) =>
      id === 'u3' ? ['ExponentPushToken[c]'] : [],
    );

    await pushService.notifyOfflineUsers(['u1', 'u2', 'u3'], 'u1', { title: 't', body: 'b' });

    // u1 is the sender, u2 is online → only u3 gets looked up + notified.
    expect(repo.listTokensByUserId).toHaveBeenCalledTimes(1);
    expect(repo.listTokensByUserId).toHaveBeenCalledWith('u3');
    expect(provider.send).toHaveBeenCalledWith({
      tokens: ['ExponentPushToken[c]'],
      title: 't',
      body: 'b',
    });
  });

  it('does not send when every recipient is the sender or online', async () => {
    presence.getOnlineUserIds.mockResolvedValue(['u2']);
    await pushService.notifyOfflineUsers(['u1', 'u2'], 'u1', { title: 't', body: 'b' });
    expect(provider.send).not.toHaveBeenCalled();
  });
});
