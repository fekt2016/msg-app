import type { Request, Response } from 'express';
import { groupMessageService } from './groupMessage.service.js';
import { apiResponse } from '../../utils/apiResponse.js';
import type { GroupMessageParam, GroupMessageQuery } from './groupMessage.validation.js';

export const groupMessageController = {
  async listMessages(req: Request, res: Response) {
    const { groupId } = req.params as unknown as GroupMessageParam;
    const { page, pageSize } = req.query as unknown as GroupMessageQuery;
    const result = await groupMessageService.listGroupMessages(
      req.user!.id,
      groupId,
      page,
      pageSize,
    );
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
