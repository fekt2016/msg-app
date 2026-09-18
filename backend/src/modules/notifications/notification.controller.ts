import type { Request, Response } from 'express';
import type { z } from 'zod';
import { notificationService } from './notification.service.js';
import { apiResponse } from '../../utils/apiResponse.js';
import type { listNotificationsSchema, markReadSchema } from './notification.validation.js';

type ListNotificationsQuery = z.infer<typeof listNotificationsSchema.query>;
type MarkReadBody = z.infer<typeof markReadSchema.body>;

export const notificationController = {
  async listFeed(req: Request, res: Response) {
    const { cursor, limit } = req.query as ListNotificationsQuery;
    const result = await notificationService.listFeed(req.user!.id, cursor ?? null, limit ?? 20);
    res.status(200).json(
      apiResponse(result.items, {
        pageSize: result.items.length,
        nextCursor: result.nextCursor ?? undefined,
      }),
    );
  },

  async unreadCount(req: Request, res: Response) {
    const result = await notificationService.getUnreadCount(req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async markRead(req: Request, res: Response) {
    const { notificationId } = req.body as MarkReadBody;
    const notification = await notificationService.markRead(req.user!.id, notificationId);
    res.status(200).json(apiResponse(notification));
  },

  async markAllRead(req: Request, res: Response) {
    const result = await notificationService.markAllRead(req.user!.id);
    res.status(200).json(apiResponse(result));
  },
};
