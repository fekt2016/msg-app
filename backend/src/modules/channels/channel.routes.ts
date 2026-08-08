import { Router } from 'express';
import { channelController } from './channel.controller.js';
import {
  createChannelSchema,
  updateChannelSchema,
  updateSubscriberRoleSchema,
  listChannelsQuerySchema,
  channelIdentifierParamSchema,
  subscriberParamSchema,
  createInviteSchema,
  inviteTokenParamSchema,
  inviteParamSchema,
  decideJoinRequestSchema,
  listJoinRequestsQuerySchema,
  createPostSchema,
  updatePostSchema,
  listPostsQuerySchema,
  postParamSchema,
} from './channel.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { postImageUpload } from './postImageUpload.js';

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
 *     ChannelInvite:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         channelId: { type: string }
 *         createdBy: { type: string }
 *         role: { type: string, enum: [SUBSCRIBER, ADMIN] }
 *         expiresAt: { type: string, format: date-time }
 *         usedCount: { type: integer }
 *         maxUses: { type: integer }
 *         revokedAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *     JoinRequest:
 *       type: object
 *       properties:
 *         userId: { type: string }
 *         role: { type: string, enum: [SUBSCRIBER] }
 *         status: { type: string, enum: [PENDING, APPROVED, DENIED] }
 *         createdAt: { type: string, format: date-time }
 *         decidedAt: { type: string, format: date-time, nullable: true }
 *         decidedBy: { type: string, nullable: true }
 *         displayName: { type: string }
 *         avatarUrl: { type: string, nullable: true }
 *     ChannelPost:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         channelId: { type: string }
 *         authorId: { type: string }
 *         body: { type: string }
 *         images:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               publicId: { type: string }
 *               url: { type: string }
 *               alt: { type: string }
 *               order: { type: integer }
 *         reactionCounts:
 *           type: object
 *           additionalProperties: { type: integer }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *         author:
 *           type: object
 *           properties:
 *             displayName: { type: string }
 *             avatarUrl: { type: string, nullable: true }
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
 * /channels/invites/{token}/join:
 *   post:
 *     summary: Join a private channel via an invite token (authenticated)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: token, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Joined (or already subscribed)
 *       404:
 *         description: Invalid invite
 *       410:
 *         description: Expired, revoked, or used-up invite
 *
 * NOTE: the unauthenticated invite preview lives on a separate
 * channelInviteRouter mounted before this router in app.ts. This join route is
 * registered before /:identifier so the literal `invites` segment is never
 * swallowed as an identifier.
 */
channelRouter.post(
  '/invites/:token/join',
  validate({ params: inviteTokenParamSchema }),
  asyncHandler(channelController.joinViaInvite),
);

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

/**
 * @swagger
 * /channels/{identifier}/invites:
 *   post:
 *     summary: Create an invite link (owner or admin); the raw token is returned once
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: string, enum: [SUBSCRIBER, ADMIN], default: SUBSCRIBER }
 *               expiresInDays: { type: integer, minimum: 1, maximum: 30, default: 7 }
 *               maxUses: { type: integer, minimum: 1, maximum: 1000, default: 1 }
 *     responses:
 *       201:
 *         description: Created invite (token in response)
 *       403:
 *         description: Not permitted
 */
channelRouter.post(
  '/:identifier/invites',
  validate({ params: channelIdentifierParamSchema, body: createInviteSchema }),
  asyncHandler(channelController.createInvite),
);

/**
 * @swagger
 * /channels/{identifier}/invites:
 *   get:
 *     summary: List active invites (owner or admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Active invites
 */
channelRouter.get(
  '/:identifier/invites',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.listInvites),
);

/**
 * @swagger
 * /channels/{identifier}/invites/{inviteId}:
 *   delete:
 *     summary: Revoke an invite (owner or admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: inviteId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Revoked
 *       404:
 *         description: Invite not found
 */
channelRouter.delete(
  '/:identifier/invites/:inviteId',
  validate({ params: inviteParamSchema }),
  asyncHandler(channelController.revokeInvite),
);

/**
 * @swagger
 * /channels/{identifier}/requests:
 *   post:
 *     summary: Request to join a private channel
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       201:
 *         description: Request submitted
 *       400:
 *         description: Public channel — subscribe directly
 *       409:
 *         description: Already subscribed or request already pending
 */
channelRouter.post(
  '/:identifier/requests',
  validate({ params: channelIdentifierParamSchema }),
  asyncHandler(channelController.createJoinRequest),
);

/**
 * @swagger
 * /channels/{identifier}/requests:
 *   get:
 *     summary: List join requests (owner or admin), status default PENDING
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string, enum: [PENDING, APPROVED, DENIED], default: PENDING } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated requests
 */
channelRouter.get(
  '/:identifier/requests',
  validate({
    params: channelIdentifierParamSchema,
    query: listJoinRequestsQuerySchema,
  }),
  asyncHandler(channelController.listJoinRequests),
);

/**
 * @swagger
 * /channels/{identifier}/requests/{userId}:
 *   patch:
 *     summary: Approve or deny a join request (owner or admin)
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
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, DENY] }
 *     responses:
 *       200:
 *         description: Decided
 *       404:
 *         description: No pending request
 *       409:
 *         description: User already subscribed
 */
channelRouter.patch(
  '/:identifier/requests/:userId',
  validate({ params: subscriberParamSchema, body: decideJoinRequestSchema }),
  asyncHandler(channelController.decideJoinRequest),
);

/**
 * @swagger
 * /channels/{identifier}/posts:
 *   post:
 *     summary: Create a post (owner or admin)
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
 *             required: [body]
 *             properties:
 *               body: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Created post
 *       403:
 *         description: Not permitted (owner/admin only)
 */
channelRouter.post(
  '/:identifier/posts',
  validate({ params: channelIdentifierParamSchema, body: createPostSchema }),
  asyncHandler(channelController.createPost),
);

// NOTE: cursor-paginated (documented deviation from the offset page/pageSize
// meta shape — see postCursor.ts). meta.nextCursor is null when no more pages.
/**
 * @swagger
 * /channels/{identifier}/posts:
 *   get:
 *     summary: Feed of posts, cursor-paginated (private channels gated to subscribers)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { name: cursor, in: query, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Paginated posts with meta.nextCursor (null when no more pages)
 */
channelRouter.get(
  '/:identifier/posts',
  validate({ params: channelIdentifierParamSchema, query: listPostsQuerySchema }),
  asyncHandler(channelController.listPosts),
);

/**
 * @swagger
 * /channels/{identifier}/posts/{postId}:
 *   get:
 *     summary: Get a single post
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: postId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Post
 *       404:
 *         description: Not found
 */
channelRouter.get(
  '/:identifier/posts/:postId',
  validate({ params: postParamSchema }),
  asyncHandler(channelController.getPost),
);

/**
 * @swagger
 * /channels/{identifier}/posts/{postId}:
 *   patch:
 *     summary: Edit a post (author or channel admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: postId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Updated post
 *       403:
 *         description: Not permitted
 */
channelRouter.patch(
  '/:identifier/posts/:postId',
  validate({ params: postParamSchema, body: updatePostSchema }),
  asyncHandler(channelController.updatePost),
);

/**
 * @swagger
 * /channels/{identifier}/posts/{postId}:
 *   delete:
 *     summary: Soft-delete a post (author or channel admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: postId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Not permitted
 */
channelRouter.delete(
  '/:identifier/posts/:postId',
  validate({ params: postParamSchema }),
  asyncHandler(channelController.removePost),
);

/**
 * @swagger
 * /channels/{identifier}/posts/{postId}/images:
 *   post:
 *     summary: Upload an image to a post (author or channel admin)
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: postId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Post with the appended image
 *       415:
 *         description: Invalid file type or size
 */
channelRouter.post(
  '/:identifier/posts/:postId/images',
  postImageUpload.single('image'),
  validate({ params: postParamSchema }),
  asyncHandler(channelController.addPostImage),
);
