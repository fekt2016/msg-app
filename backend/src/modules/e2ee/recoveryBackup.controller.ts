import type { Request, Response } from 'express';
import { recoveryBackupService } from './recoveryBackup.service.js';
import { apiResponse } from '../../utils/apiResponse.js';
import type { PutRecoveryBackupBody } from './recoveryBackup.validation.js';

export const recoveryBackupController = {
  async put(req: Request, res: Response) {
    const body = req.body as PutRecoveryBackupBody;
    const result = await recoveryBackupService.put(req.user!.id, body);
    res.status(200).json(apiResponse(result));
  },

  async get(req: Request, res: Response) {
    const result = await recoveryBackupService.get(req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async status(req: Request, res: Response) {
    const result = await recoveryBackupService.status(req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async remove(req: Request, res: Response) {
    await recoveryBackupService.remove(req.user!.id);
    res.status(200).json(apiResponse({ deleted: true }));
  },
};
