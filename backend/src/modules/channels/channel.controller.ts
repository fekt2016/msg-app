import type { Request, Response } from 'express';
import { channelService } from './channel.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type {
  CreateChannelBody,
  UpdateChannelBody,
  UpdateSubscriberRoleBody,
} from './channel.validation.js';

export const channelController = {
  async create(req: Request, res: Response) {
    const body = req.body as CreateChannelBody;
    const result = await channelService.create(req.user!.id, body);
    res.status(201).json(apiCreated(result));
  },

  async list(req: Request, res: Response) {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const viewerId = req.user?.id;
    const result = await channelService.list(page, pageSize, viewerId);
    res.status(200).json(
      apiResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      }),
    );
  },

  async listMine(req: Request, res: Response) {
    const result = await channelService.listMine(req.user!.id);
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
    const identifier = String(req.params.identifier);
    const viewerId = req.user?.id;
    const result = await channelService.getByIdOrSlug(identifier, viewerId);
    res.status(200).json(apiResponse(result));
  },

  async update(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const body = req.body as UpdateChannelBody;
    const result = await channelService.update(req.user!.id, identifier, body);
    res.status(200).json(apiResponse(result));
  },

  async remove(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    await channelService.softDelete(req.user!.id, identifier);
    res.status(200).json(apiResponse({ deleted: true }));
  },

  async subscribe(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const result = await channelService.subscribe(req.user!.id, identifier);
    res.status(200).json(apiResponse(result));
  },

  async unsubscribe(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const result = await channelService.unsubscribe(req.user!.id, identifier);
    res.status(200).json(apiResponse(result));
  },

  async updateSubscriberRole(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const targetUserId = String(req.params.userId);
    const body = req.body as UpdateSubscriberRoleBody;
    await channelService.updateSubscriberRole(req.user!.id, identifier, targetUserId, body.role);
    res.status(200).json(apiResponse({ updated: true }));
  },

  async listSubscribers(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await channelService.listSubscribers(identifier, req.user?.id, page, pageSize);
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
