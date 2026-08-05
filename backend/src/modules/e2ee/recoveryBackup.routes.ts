import { Router, type Router as ExpressRouter } from 'express';
import { recoveryBackupController } from './recoveryBackup.controller.js';
import { putRecoveryBackupSchema } from './recoveryBackup.validation.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';

export const recoveryBackupRouter: ExpressRouter = Router();

/**
 * @swagger
 * tags:
 *   name: E2EE Recovery
 *   description: >
 *     Server-blind storage of the user's encrypted E2EE identity backup. The
 *     private key bundle is encrypted on-device with a key derived (Argon2id)
 *     from a 24-word BIP39 recovery phrase the user holds. The server stores an
 *     opaque ciphertext blob plus non-secret KDF parameters only.
 */

/**
 * @swagger
 * /e2ee/recovery:
 *   put:
 *     summary: Create or replace the caller's encrypted recovery backup
 *     tags: [E2EE Recovery]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ciphertext, iv, salt, kdf, version]
 *             properties:
 *               ciphertext: { type: string, description: base64 AES-256-GCM ciphertext of the private key bundle }
 *               iv: { type: string, description: base64 AES-GCM nonce (12 bytes) }
 *               salt: { type: string, description: base64 KDF salt (non-secret) }
 *               kdf:
 *                 type: object
 *                 required: [algorithm, memoryKiB, iterations, parallelism]
 *                 properties:
 *                   algorithm: { type: string, enum: [argon2id] }
 *                   memoryKiB: { type: integer }
 *                   iterations: { type: integer }
 *                   parallelism: { type: integer }
 *               version: { type: integer, enum: [1] }
 *     responses:
 *       200:
 *         description: Backup stored
 *       401:
 *         description: Unauthenticated
 *       422:
 *         description: Validation failed
 */
recoveryBackupRouter.put(
  '/',
  authenticate,
  validate({ body: putRecoveryBackupSchema }),
  asyncHandler(recoveryBackupController.put),
);

/**
 * @swagger
 * /e2ee/recovery/status:
 *   get:
 *     summary: Whether the caller has an active recovery backup (no blob returned)
 *     tags: [E2EE Recovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup status
 */
recoveryBackupRouter.get('/status', authenticate, asyncHandler(recoveryBackupController.status));

/**
 * @swagger
 * /e2ee/recovery:
 *   get:
 *     summary: Fetch the caller's encrypted recovery backup (for restore)
 *     tags: [E2EE Recovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Encrypted backup blob + KDF params
 *       404:
 *         description: No recovery backup exists
 */
recoveryBackupRouter.get('/', authenticate, asyncHandler(recoveryBackupController.get));

/**
 * @swagger
 * /e2ee/recovery:
 *   delete:
 *     summary: Disable (soft-delete) the caller's recovery backup
 *     tags: [E2EE Recovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup disabled
 */
recoveryBackupRouter.delete('/', authenticate, asyncHandler(recoveryBackupController.remove));
