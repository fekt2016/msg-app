import { Router } from 'express';
import { messageController } from './message.controller.js';
import { conversationParamSchema, conversationQuerySchema } from './message.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const messageRouter: Router = Router();

messageRouter.use(authenticate);

/**
 * @swagger
 * /messages/{userId}:
 *   get:
 *     summary: List the 1:1 encrypted conversation with a user (newest first, paginated)
 *     description: >
 *       Returns stored E2EE ciphertext only — the server never holds plaintext.
 *       The caller and `userId` are the two participants; messages are append-only.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: userId, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated ciphertext messages
 *       404:
 *         description: User not found
 *       422:
 *         description: Validation failed
 */
messageRouter.get(
  '/:userId',
  validate({ params: conversationParamSchema, query: conversationQuerySchema }),
  asyncHandler(messageController.listConversation),
);

export default messageRouter;
