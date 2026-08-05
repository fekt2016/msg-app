import { Router } from 'express';
import { communityController } from './community.controller.js';
import {
  createCommunitySchema,
  updateCommunitySchema,
  updateRoleSchema,
  listCommunitiesQuerySchema,
  communityIdentifierParamSchema,
  memberParamSchema,
} from './community.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const communityRouter: Router = Router();

communityRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     Community:
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
 *         memberCount: { type: integer }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CommunityMember:
 *       type: object
 *       properties:
 *         communityId: { type: string }
 *         userId: { type: string }
 *         role: { type: string, enum: [OWNER, MODERATOR, MEMBER] }
 *         joinedAt: { type: string, format: date-time }
 *         displayName: { type: string }
 *         avatarUrl: { type: string, nullable: true }
 */

/**
 * @swagger
 * /communities:
 *   post:
 *     summary: Create a community (the creator becomes the owner)
 *     tags: [Communities]
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
 *         description: Created community
 *       422:
 *         description: Validation failed
 */
communityRouter.post(
  '/',
  validate({ body: createCommunitySchema }),
  asyncHandler(communityController.create),
);

/**
 * @swagger
 * /communities:
 *   get:
 *     summary: List public communities (optionally search via Typesense)
 *     tags: [Communities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: q, in: query, schema: { type: string }, description: Search query }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated communities
 */
communityRouter.get(
  '/',
  validate({ query: listCommunitiesQuerySchema }),
  asyncHandler(communityController.list),
);

/**
 * @swagger
 * /communities/{identifier}:
 *   get:
 *     summary: Get a community by id or slug with the viewer's membership status
 *     tags: [Communities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Community with membership
 *       404:
 *         description: Not found
 */
communityRouter.get(
  '/:identifier',
  validate({ params: communityIdentifierParamSchema }),
  asyncHandler(communityController.getById),
);

/**
 * @swagger
 * /communities/{identifier}:
 *   patch:
 *     summary: Update a community (owner or moderator)
 *     tags: [Communities]
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
 *         description: Updated community
 *       403:
 *         description: Not permitted
 */
communityRouter.patch(
  '/:identifier',
  validate({ params: communityIdentifierParamSchema, body: updateCommunitySchema }),
  asyncHandler(communityController.update),
);

/**
 * @swagger
 * /communities/{identifier}:
 *   delete:
 *     summary: Soft-delete a community (owner only)
 *     tags: [Communities]
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
communityRouter.delete(
  '/:identifier',
  validate({ params: communityIdentifierParamSchema }),
  asyncHandler(communityController.remove),
);

/**
 * @swagger
 * /communities/{identifier}/join:
 *   post:
 *     summary: Join a public community
 *     tags: [Communities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Joined
 *       403:
 *         description: Private community
 */
communityRouter.post(
  '/:identifier/join',
  validate({ params: communityIdentifierParamSchema }),
  asyncHandler(communityController.join),
);

/**
 * @swagger
 * /communities/{identifier}/leave:
 *   post:
 *     summary: Leave a community (the owner cannot leave)
 *     tags: [Communities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Left
 *       400:
 *         description: Owner cannot leave
 */
communityRouter.post(
  '/:identifier/leave',
  validate({ params: communityIdentifierParamSchema }),
  asyncHandler(communityController.leave),
);

/**
 * @swagger
 * /communities/{identifier}/members:
 *   get:
 *     summary: List community members (paginated)
 *     tags: [Communities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: identifier, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated members
 */
communityRouter.get(
  '/:identifier/members',
  validate({ params: communityIdentifierParamSchema, query: listCommunitiesQuerySchema }),
  asyncHandler(communityController.listMembers),
);

/**
 * @swagger
 * /communities/{identifier}/members/{userId}:
 *   patch:
 *     summary: Update a member's role (owner or moderator; cannot assign or modify OWNER)
 *     tags: [Communities]
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
 *               role: { type: string, enum: [MODERATOR, MEMBER] }
 *     responses:
 *       200:
 *         description: Role updated
 *       403:
 *         description: Not permitted
 */
communityRouter.patch(
  '/:identifier/members/:userId',
  validate({ params: memberParamSchema, body: updateRoleSchema }),
  asyncHandler(communityController.updateRole),
);

export default communityRouter;
