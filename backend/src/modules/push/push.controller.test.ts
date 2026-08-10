import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./push.service.js', () => ({
  pushService: {
    registerDevice: vi.fn(),
    unregisterDevice: vi.fn(),
    listDevices: vi.fn(),
  },
}));

import { pushController } from './push.controller.js';
import { pushService } from './push.service.js';

const service = vi.mocked(pushService);

function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pushController.registerDevice', () => {
  it('takes the owner from the auth context, never from the body', async () => {
    service.registerDevice.mockResolvedValue({
      deviceId: 'd-1',
      platform: 'android',
      appVersion: '',
      updatedAt: new Date(),
    });
    const req = {
      // A malicious body userId must be ignored.
      body: { userId: 'attacker', deviceId: 'd-1', pushToken: 'tok', platform: 'android' },
      user: { id: 'u-1', role: 'USER', deviceId: 'd-1' },
    } as unknown as Request;
    const res = mockRes();

    await pushController.registerDevice(req, res);

    expect(service.registerDevice).toHaveBeenCalledWith({
      userId: 'u-1',
      deviceId: 'd-1',
      pushToken: 'tok',
      platform: 'android',
    });
    // The forged userId is overwritten by the spread order, not honoured.
    expect(service.registerDevice.mock.calls[0][0].userId).toBe('u-1');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('pushController.unregisterDevice', () => {
  it('passes the auth user and path deviceId to the service', async () => {
    service.unregisterDevice.mockResolvedValue(undefined);
    const req = {
      params: { deviceId: 'd-1' },
      user: { id: 'u-1', role: 'USER', deviceId: 'd-1' },
    } as unknown as Request;
    const res = mockRes();

    await pushController.unregisterDevice(req, res);

    expect(service.unregisterDevice).toHaveBeenCalledWith('u-1', 'd-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('pushController.listDevices', () => {
  it('lists only the authenticated user devices', async () => {
    service.listDevices.mockResolvedValue([]);
    const req = { user: { id: 'u-1', role: 'USER', deviceId: 'd-1' } } as unknown as Request;
    const res = mockRes();

    await pushController.listDevices(req, res);

    expect(service.listDevices).toHaveBeenCalledWith('u-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
