import type { Request, Response } from 'express';
import type { z } from 'zod';
import { pushService } from './push.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type { registerDeviceSchema } from './push.validation.js';

type RegisterDeviceBody = z.infer<typeof registerDeviceSchema.body>;

export const pushController = {
  async registerDevice(req: Request, res: Response) {
    const body = req.body as RegisterDeviceBody;
    // The owner is always the authenticated user — spread body first so a forged
    // `userId` can never override it (defence-in-depth; validation also strips it).
    const device = await pushService.registerDevice({ ...body, userId: req.user!.id });
    res.status(201).json(apiCreated(device));
  },

  async unregisterDevice(req: Request, res: Response) {
    const deviceId = String(req.params.deviceId);
    await pushService.unregisterDevice(req.user!.id, deviceId);
    res.status(200).json(apiResponse({ deleted: true }));
  },

  async listDevices(req: Request, res: Response) {
    const devices = await pushService.listDevices(req.user!.id);
    res.status(200).json(apiResponse(devices));
  },
};
