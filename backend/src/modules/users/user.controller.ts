import type { Request, Response } from 'express';
import { userService } from './user.service.js';
import { apiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../errors/AppError.js';

export const userController = {
  async getProfile(req: Request, res: Response) {
    const profile = await userService.getProfile(req.user!.id);
    res.status(200).json(apiResponse(profile));
  },

  async listChatUsers(req: Request, res: Response) {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await userService.listChatUsers(req.user!.id, page, pageSize);
    res.status(200).json(
      apiResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      }),
    );
  },

  async matchContacts(req: Request, res: Response) {
    const users = await userService.matchContacts(req.body.phoneNumbers);
    res.status(200).json(apiResponse(users));
  },

  async updateProfile(req: Request, res: Response) {
    const profile = await userService.updateProfile(req.user!.id, req.body);
    res.status(200).json(apiResponse(profile));
  },

  async updateAvatar(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(422, 'MISSING_FILE', 'An avatar image file is required');
    }
    const profile = await userService.updateAvatar(req.user!.id, req.file);
    res.status(200).json(apiResponse(profile));
  },
};
