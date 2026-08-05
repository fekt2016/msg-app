import type { Request, Response } from 'express';
import { communityService } from './community.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type {
  CreateCommunityBody,
  UpdateCommunityBody,
  UpdateRoleBody,
} from './community.validation.js';

export const communityController = {
  async create(req: Request, res: Response) {
    const body = req.body as CreateCommunityBody;
    const result = await communityService.create(req.user!.id, body);
    res.status(201).json(apiCreated(result));
  },

  async list(req: Request, res: Response) {
    const { q, page, pageSize } = req.query as unknown as {
      q?: string;
      page: number;
      pageSize: number;
    };
    const result = await communityService.list(page, pageSize, q);
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
    const result = await communityService.getByIdOrSlug(identifier, viewerId);
    res.status(200).json(apiResponse(result));
  },

  async update(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const body = req.body as UpdateCommunityBody;
    const result = await communityService.update(req.user!.id, identifier, body);
    res.status(200).json(apiResponse(result));
  },

  async remove(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    await communityService.softDelete(req.user!.id, identifier);
    res.status(200).json(apiResponse({ deleted: true }));
  },

  async join(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const result = await communityService.join(req.user!.id, identifier);
    res.status(200).json(apiResponse(result));
  },

  async leave(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const result = await communityService.leave(req.user!.id, identifier);
    res.status(200).json(apiResponse(result));
  },

  async updateRole(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const targetUserId = String(req.params.userId);
    const body = req.body as UpdateRoleBody;
    await communityService.updateRole(req.user!.id, identifier, targetUserId, body.role);
    res.status(200).json(apiResponse({ updated: true }));
  },

  async listMembers(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await communityService.listMembers(identifier, page, pageSize);
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
