import type { Request, Response } from 'express';
import { channelService } from './channel.service.js';
import { channelPostService } from './channelPost.service.js';
import { channelReactionService } from './channelReaction.service.js';
import { AppError } from '../../errors/AppError.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type {
  CreateChannelBody,
  UpdateChannelBody,
  UpdateSubscriberRoleBody,
  CreateInviteBody,
  DecideJoinRequestBody,
  CreatePostBody,
  UpdatePostBody,
  SetReactionBody,
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

  async createInvite(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const body = req.body as CreateInviteBody;
    const result = await channelService.createInvite(req.user!.id, identifier, body);
    res.status(201).json(apiCreated(result));
  },

  async listInvites(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const result = await channelService.listInvites(req.user!.id, identifier);
    res.status(200).json(apiResponse(result.items));
  },

  async revokeInvite(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const inviteId = String(req.params.inviteId);
    await channelService.revokeInvite(req.user!.id, identifier, inviteId);
    res.status(200).json(apiResponse({ revoked: true }));
  },

  async previewInvite(req: Request, res: Response) {
    const token = String(req.params.token);
    const result = await channelService.previewInvite(token);
    res.status(200).json(apiResponse(result));
  },

  async joinViaInvite(req: Request, res: Response) {
    const token = String(req.params.token);
    const result = await channelService.joinViaInvite(req.user!.id, token);
    res.status(200).json(apiResponse(result));
  },

  async createJoinRequest(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    await channelService.createJoinRequest(req.user!.id, identifier);
    res.status(201).json(apiCreated({ requested: true }));
  },

  async listJoinRequests(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const { status, page, pageSize } = req.query as unknown as {
      status: 'PENDING' | 'APPROVED' | 'DENIED';
      page: number;
      pageSize: number;
    };
    const result = await channelService.listJoinRequests(
      req.user!.id,
      identifier,
      status,
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

  async decideJoinRequest(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const targetUserId = String(req.params.userId);
    const body = req.body as DecideJoinRequestBody;
    await channelService.decideJoinRequest(req.user!.id, identifier, targetUserId, body.action);
    res.status(200).json(apiResponse({ status: body.action }));
  },

  async createPost(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const body = req.body as CreatePostBody;
    const result = await channelPostService.createPost(req.user!.id, identifier, body.body);
    res.status(201).json(apiCreated(result));
  },

  async listPosts(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const result = await channelPostService.listPosts(identifier, req.user?.id, {
      limit,
      cursor: cursor ?? null,
    });
    res.status(200).json(apiResponse(result.items, { nextCursor: result.nextCursor }));
  },

  async getPost(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    const result = await channelPostService.getPost(identifier, req.user?.id, postId);
    res.status(200).json(apiResponse(result));
  },

  async updatePost(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    const body = req.body as UpdatePostBody;
    const result = await channelPostService.updatePost(
      req.user!.id,
      identifier,
      postId,
      body.body!,
    );
    res.status(200).json(apiResponse(result));
  },

  async removePost(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    await channelPostService.softDeletePost(req.user!.id, identifier, postId);
    res.status(200).json(apiResponse({ deleted: true }));
  },

  async addPostImage(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    if (!req.file) {
      throw new AppError(422, 'MISSING_FILE', 'An image file is required');
    }
    const result = await channelPostService.addPostImage(
      req.user!.id,
      identifier,
      postId,
      req.file,
    );
    res.status(200).json(apiResponse(result));
  },

  async setReaction(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    const body = req.body as SetReactionBody;
    const reactionCounts = await channelReactionService.setReaction(
      req.user!.id,
      identifier,
      postId,
      body.emoji,
    );
    res.status(200).json(apiResponse({ reactionCounts }));
  },

  async removeReaction(req: Request, res: Response) {
    const identifier = String(req.params.identifier);
    const postId = String(req.params.postId);
    const reactionCounts = await channelReactionService.removeReaction(
      req.user!.id,
      identifier,
      postId,
    );
    res.status(200).json(apiResponse({ reactionCounts }));
  },
};
