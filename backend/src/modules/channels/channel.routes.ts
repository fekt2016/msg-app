import { Router } from 'express';
import { channelController } from './channel.controller.js';
import {
  createChannelSchema,
  updateChannelSchema,
  updateSubscriberRoleSchema,
  listChannelsQuerySchema,
  channelIdentifierParamSchema,
  subscriberParamSchema,
} from './channel.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const channelRouter: Router = Router();

channelRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     Channel:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         name: { type: string }
 *         slug: { type: string }
 *         description: { type: string }
 *         avatar:
 *           type: object
 *           nullable: true
 *           properties:
 *             publicId: { type: string }
 *             url: { type: string }
 *             width: { type: integer }
 *             height: { type: integer }
 *         visibility: { type: string, enum: [PUBLIC, PRIVATE] }
 *         ownerId: { type: string }
 *         subscriberCount: { type: integer }
 *         postCount: { type: integer }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     ChannelWithSubscription:
 *       type: object
 *       allOf:
 *         - $ref: '#/components/schemas/Channel'
 *       properties:
 *         isSubscribed: { type: boolean }
 *         role: { type: string, enum: [OWNER, ADMIN, SUBSCRIBER], nullable: true }
 *     ChannelSubscriber:
 *       type: object
 *       properties:
 *         channelId: { type: string }
 *         userId: { type: string }
 *         role: { type: string, enum: [OWNER, ADMIN, SUBSCRIBER] }
 *         joinedAt: { type: string, format: date-time }
 *         displayName: { type: string }
 *         avatarUrl: { type: string, nullable: true }
 */

/**
 * @swagger
 * /channels:
 *   post:
 *     summary: Create a channel (the creator becomes the owner)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 100 }
 *               description: { type: string, maxLength: 500 }
 *               visibility: { type: string, enum: [PUBLIC, PRIVATE], default: PUBLIC }
 *     responses:
 *       201:
 *         description: Created channel
 *       422:
 *         description: Validation failed
 */
channelRouter.post(
  '/',
  validate({ body: createChannelSchema }),
  asyncHandler(channelController.create),
);

/**
 * @swagger
 * /channels:
 *   get:
 *     summary: Browse public channels with the viewer's subscription status
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated channels
 */
channelRouter.get(
  '/',
  validate({ query: listChannelsQuerySchema }),
  asyncHandler(channelController.list),
);

/**
 * @swagger
 * /channels/mine:
 *   get:
 *     summary: List the viewer's subscribed channels with their role
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscribed channels
 *
 * NOTE: registered before /:identifier — a literal `mine` path must never be
 * swallowed by the identifier catch-all (Express matches in registration order).
 */
channelRouter.get('/mine', asyncHandler(channelController.listMine));

/**
 * @swagger
 * /channels/{identifier}:
 *   get:
 *     summary: Get a channel by id or slug with the viewer's subscription status
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Channel with subscription
 *       403:
 *         description: Private channel
 *       404:
 *         description: Not found
 */
channelRouter.get(
  '/:identifier',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.getById),
);

/**
 * @swagger
 * /channels/{identifier}:
 *   patch:
 *     summary: Update a channel (owner or admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               visibility: { type: string, enum: [PUBLIC, PRIVATE] }
 *     responses:
 *       200:
 *         description: Updated channel
 *       403:
 *         description: Not permitted
 */
channelRouter.patch(
  '/:identifier',
  validate({ params: channelIdentifierParamSchema, body: updateChannelSchema }),
  asyncHandler(channelController.update),
);

/**
 * @swagger
 * /channels/{identifier}:
 *   delete:
 *     summary: Soft-delete a channel (owner only)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Not permitted
 */
channelRouter.delete(
  '/:identifier',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.remove),
);

/**
 * @swagger
 * /channels/{identifier}/subscribe:
 *   post:
 *     summary: Subscribe to a public channel
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Subscribed
 *       403:
 *         description: Private channel — join via invite or request
 */
channelRouter.post(
  '/:identifier/subscribe',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.subscribe),
);

/**
 * @swagger
 * /channels/{identifier}/unsubscribe:
 *   post:
 *     summary: Unsubscribe (the owner cannot unsubscribe)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Unsubscribed
 *       400:
 *         description: Owner cannot unsubscribe
 */
channelRouter.post(
  '/:identifier/unsubscribe',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.unsubscribe),
);

/**
 * @swagger
 * /channels/{identifier}/subscribers:
 *   get:
 *     summary: List channel subscribers (private channels gated to subscribers)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated subscribers
 *       403:
 *         description: Private channel
 */
channelRouter.get(
  '/:identifier/subscribers',
  validate({ params: channelIdentifierParamSchema, query: listChannelsQuerySchema }),
  asyncHandler(channelController.listSubscribers),
);

/**
 * @swagger
 * /channels/{identifier}/subscribers/{userId}:
 *   patch:
 *     summary: Assign or revoke ADMIN (owner only; the owner row cannot be modified)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: userId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [ADMIN, SUBSCRIBER] }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Cannot assign OWNER or modify the owner row
 *       403:
 *         description: Not permitted
 */
channelRouter.patch(
  '/:identifier/subscribers/:userId',
  validate({ params: subscriberParamSchema, body: updateSubscriberRoleSchema }),
  asyncHandler(channelController.updateSubscriberRole),
);
