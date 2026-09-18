import { Router } from 'express';
import { notificationController } from './notification.controller.js';
import { listNotificationsSchema, markReadSchema } from './notification.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const notificationRouter: Router = Router();

notificationRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         type: { type: string }
 *         title: { type: string }
 *         body: { type: string }
 *         data: { type: object }
 *         readAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 * tags:
 *   - name: Notifications
 *     description: In-app notification center (feed, read state)
 */

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: List the current user's in-app notifications (newest first, cursor-paginated)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema: { type: string }
 *         description: Opaque pagination cursor from the previous page's meta
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Notification feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/Notification' } }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pageSize: { type: integer }
 *                     nextCursor: { type: string, nullable: true }
 */
notificationRouter.get(
  '/',
  validate(listNotificationsSchema),
  asyncHandler(notificationController.listFeed),
);

/**
 * @swagger
 * /api/v1/notifications/unread-count:
 *   get:
 *     summary: Current user's unread notification count (tab badge)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer }
 */
notificationRouter.get('/unread-count', asyncHandler(notificationController.unreadCount));

/**
 * @swagger
 * /api/v1/notifications/read:
 *   post:
 *     summary: Mark one of the current user's notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notificationId]
 *             properties:
 *               notificationId: { type: string }
 *     responses:
 *       200: { description: Notification marked read }
 *       404: { description: Notification not found }
 */
notificationRouter.post(
  '/read',
  validate(markReadSchema),
  asyncHandler(notificationController.markRead),
);

/**
 * @swagger
 * /api/v1/notifications/read-all:
 *   post:
 *     summary: Mark all of the current user's notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All notifications marked read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedCount: { type: integer }
 */
notificationRouter.post('/read-all', asyncHandler(notificationController.markAllRead));
