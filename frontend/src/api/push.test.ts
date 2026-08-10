import { registerDevice, listDevices, unregisterDevice } from './push';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

const device = {
  deviceId: 'dev-1',
  platform: 'android' as const,
  appVersion: '1.0.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('push api client', () => {
  it('registerDevice posts the payload and unwraps the envelope', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: device } });

    const result = await registerDevice({
      deviceId: 'dev-1',
      pushToken: 'ExponentPushToken[a]',
      platform: 'android',
      appVersion: '1.0.0',
    });

    expect(mockClient.post).toHaveBeenCalledWith('/push/devices', {
      deviceId: 'dev-1',
      pushToken: 'ExponentPushToken[a]',
      platform: 'android',
      appVersion: '1.0.0',
    });
    expect(result).toEqual(device);
  });

  it('listDevices unwraps the array envelope', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: [device] } });
    expect(await listDevices()).toEqual([device]);
    expect(mockClient.get).toHaveBeenCalledWith('/push/devices');
  });

  it('unregisterDevice deletes the URL-encoded device id', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: { deleted: true } } });
    await unregisterDevice('dev/1');
    expect(mockClient.delete).toHaveBeenCalledWith('/push/devices/dev%2F1');
  });
});
