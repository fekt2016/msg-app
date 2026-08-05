import type { Request, Response } from 'express';
import { groupService } from './group.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type { CreateGroupBody, AddMembersBody } from './group.validation.js';

export const groupController = {
  async create(req: Request, res: Response) {
    const body = req.body as CreateGroupBody;
    const result = await groupService.create(req.user!.id, body);
    res.status(201).json(apiCreated(result));
  },

  async listMine(req: Request, res: Response) {
    const result = await groupService.listMine(req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async getById(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    const result = await groupService.getForMember(req.user!.id, groupId);
    res.status(200).json(apiResponse(result));
  },

  async listMembers(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const result = await groupService.listMembers(req.user!.id, groupId, page, pageSize);
    res.status(200).json(
      apiResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      }),
    );
  },

  async addMembers(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    const body = req.body as AddMembersBody;
    const result = await groupService.addMembers(req.user!.id, groupId, body.memberIds);
    res.status(200).json(apiResponse(result));
  },

  async removeMember(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    const targetUserId = String(req.params.userId);
    await groupService.removeMember(req.user!.id, groupId, targetUserId);
    res.status(200).json(apiResponse({ removed: true }));
  },

  async leave(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    await groupService.leave(req.user!.id, groupId);
    res.status(200).json(apiResponse({ left: true }));
  },

  async remove(req: Request, res: Response) {
    const groupId = String(req.params.groupId);
    await groupService.softDelete(req.user!.id, groupId);
    res.status(200).json(apiResponse({ deleted: true }));
  },
};
