import { Router } from 'express';
import { channelController } from './channel.controller.js';
import { inviteTokenParamSchema } from './channel.validation.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Unauthenticated invite router — mounted in app.ts BEFORE the authenticated
 * channelRouter so a user who opens an invite link without a session can still
 * preview the channel (channel name, role granted, expiry). No join side
 * effect here; joining stays authenticated on channelRouter
 * (POST /channels/invites/:token/join).
 */
export const channelInviteRouter: Router = Router();

/**
 * @swagger
 * /channels/invites/{token}:
 *   get:
 *     summary: Preview a channel invite without authentication (no join side effect)
 *     tags: [Channels]
 *     parameters:
 *       - { name: token, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Invite preview
 *       404:
 *         description: Invalid invite
 *       410:
 *         description: Expired or revoked invite
 */
channelInviteRouter.get(
  '/invites/:token',
  validate({ params: inviteTokenParamSchema }),
  asyncHandler(channelController.previewInvite),
);
