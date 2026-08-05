import type { Request, Response } from 'express';
import { e2eeService } from './e2ee.service.js';
import { apiResponse, apiCreated } from '../../utils/apiResponse.js';
import type {
  PublicKeyBundleBody,
  RotateSignedPreKeyBody,
  RotateOneTimePreKeysBody,
} from './e2ee.validation.js';

export const e2eeController = {
  async uploadPublicKeys(req: Request, res: Response) {
    const bundle = req.body as PublicKeyBundleBody;
    const result = await e2eeService.storePublicKeys(req.user!.id, bundle);
    res.status(201).json(apiCreated(result));
  },

  async getKeyBundle(req: Request, res: Response) {
    const { userId } = req.params;
    const result = await e2eeService.getKeyBundle(userId as string);
    res.status(200).json(apiResponse(result));
  },

  async rotateSignedPreKey(req: Request, res: Response) {
    const { signedPreKey } = req.body as RotateSignedPreKeyBody;
    const result = await e2eeService.rotateSignedPreKey(req.user!.id, signedPreKey);
    res.status(200).json(apiResponse(result));
  },

  async rotateOneTimePreKeys(req: Request, res: Response) {
    const { oneTimePreKeys } = req.body as RotateOneTimePreKeysBody;
    const result = await e2eeService.rotateOneTimePreKeys(req.user!.id, oneTimePreKeys);
    res.status(200).json(apiResponse(result));
  },

  async storePreKeys(req: Request, res: Response) {
    const { preKeys } = req.body as { preKeys: { keyId: number; publicKey: string }[] };
    await e2eeService.storePreKeys(req.user!.id, preKeys);
    res.status(200).json(apiResponse({ stored: true }));
  },

  async consumeOneTimePreKeys(req: Request, res: Response) {
    const { keyIds } = req.body as { keyIds: number[] };
    await e2eeService.consumeOneTimePreKeys(req.user!.id, keyIds);
    res.status(200).json(apiResponse({ consumed: true }));
  },

  async sendMessage(req: Request, res: Response) {
    const { recipientId, ciphertext, timestamp } = req.body as {
      recipientId: string;
      ciphertext: string;
      timestamp: number;
    };
    await e2eeService.storeEncryptedMessage(req.user!.id, recipientId, ciphertext, timestamp);
    res.status(200).json(apiResponse({ sent: true }));
  },

  async deleteKeys(req: Request, res: Response) {
    await e2eeService.deleteKeys(req.user!.id);
    res.status(200).json(apiResponse({ deleted: true }));
  },
};
