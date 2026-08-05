import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { apiCreated, apiResponse } from '../../utils/apiResponse.js';

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    res.status(201).json(apiCreated(result));
  },

  async resendOtp(req: Request, res: Response) {
    await authService.resendOtp(req.body);
    res.status(200).json(apiResponse({ sent: true }));
  },

  async verifyOtp(req: Request, res: Response) {
    const result = await authService.verifyOtp(req.body);
    res.status(200).json(apiResponse(result));
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);
    res.status(200).json(apiResponse(result));
  },

  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.body);
    res.status(200).json(apiResponse(result));
  },

  async logout(req: Request, res: Response) {
    await authService.logout(req.body);
    res.status(200).json(apiResponse({ loggedOut: true }));
  },
};
