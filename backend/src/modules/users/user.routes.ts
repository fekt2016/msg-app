import { Router } from 'express';
import { userController } from './user.controller.js';
import {
  updateProfileSchema,
  matchContactsSchema,
  listChatUsersQuerySchema,
} from './user.validation.js';
import { avatarUpload } from './avatarUpload.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const userRouter: Router = Router();

userRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     AvatarAsset:
 *       type: object
 *       properties:
 *         publicId: { type: string }
 *         url: { type: string }
 *         width: { type: integer }
 *         height: { type: integer }
 *     Profile:
 *       allOf:
 *         - $ref: '#/components/schemas/SafeUser'
 *         - type: object
 *           properties:
 *             bio: { type: string }
 *             avatar: { $ref: '#/components/schemas/AvatarAsset', nullable: true }
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Profile' }
 *       401:
 *         description: Missing or invalid token
 */
userRouter.get('/me', asyncHandler(userController.getProfile));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List verified users available to chat with (excludes the authenticated user)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Page of chat users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Profile'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *                     total: { type: integer }
 *                     totalPages: { type: integer }
 *       401:
 *         description: Missing or invalid token
 *       422:
 *         description: Validation failed
 */
userRouter.get(
  '/',
  validate({ query: listChatUsersQuerySchema }),
  asyncHandler(userController.listChatUsers),
);

/**
 * @swagger
 * /users/match-contacts:
 *   post:
 *     summary: Match a set of contact phone numbers against registered users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumbers]
 *             properties:
 *               phoneNumbers:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Registered users whose phone numbers matched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Profile'
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Missing or invalid token
 */
userRouter.post(
  '/match-contacts',
  validate({ body: matchContactsSchema }),
  asyncHandler(userController.matchContacts),
);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update the authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string, minLength: 1, maxLength: 50 }
 *               bio: { type: string, maxLength: 160 }
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Profile' }
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Missing or invalid token
 */
userRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(userController.updateProfile),
);

/**
 * @swagger
 * /users/me/avatar:
 *   post:
 *     summary: Upload a profile avatar (JPEG, PNG or WebP)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile with the new avatar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Profile' }
 *       422:
 *         description: Invalid file type or size
 *       401:
 *         description: Missing or invalid token
 */
userRouter.post(
  '/me/avatar',
  avatarUpload.single('avatar'),
  asyncHandler(userController.updateAvatar),
);

export default userRouter;
