import type { Request, Response } from 'express';
import { groupKeyService } from './groupKey.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import { AppError } from '../../errors/AppError.js';

export const groupKeyController = {
  async uploadSenderKeys(req: Request, res: Response) {
    const { groupId } = req.params as { groupId: string };
    const { envelopes } = req.body as {
      envelopes: { recipientId: string; keyId: number; ciphertext: string; iv: string }[];
    };
    const result = await groupKeyService.uploadSenderKeys(groupId, req.user!.id, envelopes);
    res.status(201).json(apiCreated({ envelopes: result }));
  },

  async getSenderKey(req: Request, res: Response) {
    const { groupId, senderId } = req.params as { groupId: string; senderId: string };
    const result = await groupKeyService.getSenderKey(groupId, senderId, req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async listSenderKeys(req: Request, res: Response) {
    const { groupId } = req.params as { groupId: string };
    const result = await groupKeyService.listSenderKeys(groupId, req.user!.id);
    res.status(200).json(apiResponse(result));
  },

  async deleteSenderKey(req: Request, res: Response) {
    const { groupId, senderId } = req.params as { groupId: string; senderId: string };
    // A member may only delete their OWN sender key. Without this check any
    // authenticated user could delete any other member's group sender key.
    if (senderId !== req.user!.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own sender key');
    }
    await groupKeyService.deleteSenderKey(groupId, senderId);
    res.status(200).json(apiResponse({ deleted: true }));
  },
};
