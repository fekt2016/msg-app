import { Router, type Router as ExpressRouter } from 'express';
import { groupKeyController } from './groupKey.controller.js';
import {
  groupIdParamSchema,
  senderKeyParamSchema,
  uploadSenderKeysSchema,
} from './groupKey.validation.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';

export const groupKeyRouter: ExpressRouter = Router();

groupKeyRouter.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: E2EE Groups
 *   description: Sender-key distribution for end-to-end encrypted group chat
 */

/**
 * @swagger
 * /e2ee/groups/{groupId}/sender-keys:
 *   post:
 *     summary: Store the caller's group sender-key envelopes (one per recipient, ciphertext only)
 *     description: >
 *       The authenticated user is the sender. Each envelope is their sender key
 *       encrypted pairwise to a recipient's public key. The server stores ciphertext
 *       only and never sees the sender key in plaintext.
 *     tags: [E2EE Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string }, description: Opaque group identifier }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [envelopes]
 *             properties:
 *               envelopes:
 *                 type: array
 *                 maxItems: 500
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [recipientId, keyId, ciphertext, iv]
 *                   properties:
 *                     recipientId: { type: string }
 *                     keyId: { type: integer }
 *                     ciphertext: { type: string }
 *                     iv: { type: string }
 *     responses:
 *       201:
 *         description: Envelopes stored
 *       422:
 *         description: Validation failed or unknown recipient
 */
groupKeyRouter.post(
  '/:groupId/sender-keys',
  validate({ params: groupIdParamSchema, body: uploadSenderKeysSchema }),
  asyncHandler(groupKeyController.uploadSenderKeys),
);

/**
 * @swagger
 * /e2ee/groups/{groupId}/sender-keys:
 *   get:
 *     summary: List group senders that have distributed a sender key to the caller
 *     tags: [E2EE Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: List of senders with their current keyId
 */
groupKeyRouter.get(
  '/:groupId/sender-keys',
  validate({ params: groupIdParamSchema }),
  asyncHandler(groupKeyController.listSenderKeys),
);

/**
 * @swagger
 * /e2ee/groups/{groupId}/sender-keys/{senderId}:
 *   get:
 *     summary: Fetch the caller's own envelope for a group sender
 *     description: Returns only the envelope addressed to the authenticated user.
 *     tags: [E2EE Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *       - { name: senderId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The caller's envelope for that sender
 *       404:
 *         description: No envelope for this recipient
 */
groupKeyRouter.get(
  '/:groupId/sender-keys/:senderId',
  validate({ params: senderKeyParamSchema }),
  asyncHandler(groupKeyController.getSenderKey),
);

/**
 * @swagger
 * /e2ee/groups/{groupId}/sender-keys/{senderId}:
 *   delete:
 *     summary: Delete a group sender key (the sender removes their own key)
 *     tags: [E2EE Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *       - { name: senderId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 */
groupKeyRouter.delete(
  '/:groupId/sender-keys/:senderId',
  validate({ params: senderKeyParamSchema }),
  asyncHandler(groupKeyController.deleteSenderKey),
);

export default groupKeyRouter;
