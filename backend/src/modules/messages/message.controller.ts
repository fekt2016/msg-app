import type { Request, Response } from 'express';
import { messageService } from './message.service.js';
import { apiResponse } from '../../utils/apiResponse.js';
import type { ConversationParam, ConversationQuery } from './message.validation.js';

export const messageController = {
  async listConversation(req: Request, res: Response) {
    const { userId } = req.params as unknown as ConversationParam;
    const { page, pageSize } = req.query as unknown as ConversationQuery;
    const result = await messageService.listConversation(req.user!.id, userId, page, pageSize);
    res.status(200).json(
      apiResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      }),
    );
  },
};
