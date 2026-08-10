import { Router } from 'express';
import { pushController } from './push.controller.js';
import { registerDeviceSchema, unregisterDeviceSchema } from './push.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const pushRouter: Router = Router();

pushRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     PushDevice:
 *       type: object
 *       properties:
 *         deviceId: { type: string }
 *         platform: { type: string, enum: [android, ios, web] }
 *         appVersion: { type: string }
 *         updatedAt: { type: string, format: date-time }
 * tags:
 *   - name: Push
 *     description: Device registration for push notifications
 */

/**
 * @swagger
 * /api/v1/push/devices:
 *   post:
 *     summary: Register (or refresh) the current device for push notifications
 *     tags: [Push]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deviceId, pushToken, platform]
 *             properties:
 *               deviceId: { type: string }
 *               pushToken: { type: string }
 *               platform: { type: string, enum: [android, ios, web] }
 *               appVersion: { type: string }
 *     responses:
 *       201: { description: Device registered }
 *   get:
 *     summary: List the current user's registered devices
 *     tags: [Push]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Device list }
 */
pushRouter.post(
  '/devices',
  validate(registerDeviceSchema),
  asyncHandler(pushController.registerDevice),
);

pushRouter.get('/devices', asyncHandler(pushController.listDevices));

/**
 * @swagger
 * /api/v1/push/devices/{deviceId}:
 *   delete:
 *     summary: Unregister a device the current user owns
 *     tags: [Push]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device unregistered }
 *       404: { description: No such device for this user }
 */
pushRouter.delete(
  '/devices/:deviceId',
  validate(unregisterDeviceSchema),
  asyncHandler(pushController.unregisterDevice),
);
