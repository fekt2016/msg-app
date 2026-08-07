import { Router } from 'express';
import { groupController } from './group.controller.js';
import { groupMessageController } from '../groupMessages/groupMessage.controller.js';
import {
  createGroupSchema,
  addMembersSchema,
  groupIdParamSchema,
  groupMemberParamSchema,
  listMembersQuerySchema,
} from './group.validation.js';
import {
  groupMessageParamSchema,
  groupMessageQuerySchema,
} from '../groupMessages/groupMessage.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const groupRouter: Router = Router();

groupRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     Group:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         name: { type: string }
 *         avatar:
 *           type: object
 *           nullable: true
 *           properties:
 *             publicId: { type: string }
 *             url: { type: string }
 *             width: { type: integer }
 *             height: { type: integer }
 *         ownerId: { type: string }
 *         memberCount: { type: integer }
 *         role: { type: string, enum: [OWNER, MEMBER] }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     GroupMember:
 *       type: object
 *       properties:
 *         groupId: { type: string }
 *         userId: { type: string }
 *         role: { type: string, enum: [OWNER, MEMBER] }
 *         joinedAt: { type: string, format: date-time }
 *         displayName: { type: string }
 *         avatarUrl: { type: string, nullable: true }
 */

/**
 * @swagger
 * /groups:
 *   post:
 *     summary: Create a group chat (the creator becomes the owner)
 *     tags: [Groups]
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
 *               memberIds:
 *                 type: array
 *                 items: { type: string }
 *                 maxItems: 255
 *     responses:
 *       201:
 *         description: Created group
 *       422:
 *         description: Validation failed or unknown member
 */
groupRouter.post('/', validate({ body: createGroupSchema }), asyncHandler(groupController.create));

/**
 * @swagger
 * /groups:
 *   get:
 *     summary: List the groups the authenticated user belongs to
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The caller's groups
 */
groupRouter.get('/', asyncHandler(groupController.listMine));

/**
 * @swagger
 * /groups/{groupId}:
 *   get:
 *     summary: Get a group the caller is a member of
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Group with the viewer's role
 *       403:
 *         description: Not a member
 *       404:
 *         description: Not found
 */
groupRouter.get(
  '/:groupId',
  validate({ params: groupIdParamSchema }),
  asyncHandler(groupController.getById),
);

/**
 * @swagger
 * /groups/{groupId}/messages:
 *   get:
 *     summary: List a group's E2EE message history (members only, newest first, paginated)
 *     description: >
 *       Returns stored E2EE ciphertext only — the server never holds plaintext.
 *       Each message carries the sender's `keyId` so members can unwrap the
 *       sender key and decrypt. Only group members can read history.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated ciphertext messages
 *       403:
 *         description: Not a member
 *       404:
 *         description: Group not found
 *       422:
 *         description: Validation failed
 */
groupRouter.get(
  '/:groupId/messages',
  validate({ params: groupMessageParamSchema, query: groupMessageQuerySchema }),
  asyncHandler(groupMessageController.listMessages),
);

/**
 * @swagger
 * /groups/{groupId}/members:
 *   get:
 *     summary: List a group's members (members only, paginated)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated members
 *       403:
 *         description: Not a member
 */
groupRouter.get(
  '/:groupId/members',
  validate({ params: groupIdParamSchema, query: listMembersQuerySchema }),
  asyncHandler(groupController.listMembers),
);

/**
 * @swagger
 * /groups/{groupId}/members:
 *   post:
 *     summary: Add members to a group (owner only)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberIds]
 *             properties:
 *               memberIds:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *                 maxItems: 255
 *     responses:
 *       200:
 *         description: Members added
 *       403:
 *         description: Not the owner
 */
groupRouter.post(
  '/:groupId/members',
  validate({ params: groupIdParamSchema, body: addMembersSchema }),
  asyncHandler(groupController.addMembers),
);

/**
 * @swagger
 * /groups/{groupId}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a group (owner only; the owner cannot be removed)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *       - { name: userId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Member removed
 *       403:
 *         description: Not the owner
 */
groupRouter.delete(
  '/:groupId/members/:userId',
  validate({ params: groupMemberParamSchema }),
  asyncHandler(groupController.removeMember),
);

/**
 * @swagger
 * /groups/{groupId}/leave:
 *   post:
 *     summary: Leave a group (the owner cannot leave; delete the group instead)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Left the group
 *       400:
 *         description: Owner cannot leave
 */
groupRouter.post(
  '/:groupId/leave',
  validate({ params: groupIdParamSchema }),
  asyncHandler(groupController.leave),
);

/**
 * @swagger
 * /groups/{groupId}:
 *   delete:
 *     summary: Soft-delete a group (owner only)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Not the owner
 */
groupRouter.delete(
  '/:groupId',
  validate({ params: groupIdParamSchema }),
  asyncHandler(groupController.remove),
);

export default groupRouter;
