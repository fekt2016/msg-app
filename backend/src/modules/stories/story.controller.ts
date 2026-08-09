import type { Request, Response } from 'express';
import { storyService } from './story.service.js';
import { AppError } from '../../errors/AppError.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type { CreateStoryBody } from './story.validation.js';

export const storyController = {
  async create(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(422, 'MISSING_FILE', 'A media file is required');
    }
    const body = (req.body ?? {}) as CreateStoryBody;
    const result = await storyService.create(req.user!.id, req.file, body.caption);
    res.status(201).json(apiCreated(result));
  },

  async feed(req: Request, res: Response) {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await storyService.feed(req.user!.id, page, pageSize);
    res.status(200).json(
      apiResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      }),
    );
  },

  async getById(req: Request, res: Response) {
    const storyId = String(req.params.storyId);
    const result = await storyService.get(storyId, req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async remove(req: Request, res: Response) {
    const storyId = String(req.params.storyId);
    await storyService.delete(req.user!.id, storyId);
    res.status(200).json(apiResponse({ deleted: true }));
  },

  async markViewed(req: Request, res: Response) {
    const storyId = String(req.params.storyId);
    const result = await storyService.markViewed(req.user!.id, storyId);
    res.status(200).json(apiResponse(result));
  },

  async listViewers(req: Request, res: Response) {
    const storyId = String(req.params.storyId);
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await storyService.listViewers(req.user!.id, storyId, page, pageSize);
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
