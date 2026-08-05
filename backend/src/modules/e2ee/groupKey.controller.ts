import type { Request, Response } from 'express';
import { groupKeyService } from './groupKey.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';

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
    // Ownership (a member may only delete their OWN sender key) is enforced in
    // the service — the caller id is passed through for that check.
    await groupKeyService.deleteSenderKey(groupId, senderId, req.user!.id);
    res.status(200).json(apiResponse({ deleted: true }));
  },
};
