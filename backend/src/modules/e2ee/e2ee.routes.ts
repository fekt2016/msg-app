import { Router, type Router as ExpressRouter } from 'express';
import { e2eeController } from './e2ee.controller.js';
import {
  publicKeyBundleSchema,
  preKeyUploadSchema,
  messageEnvelopeSchema,
  rotateSignedPreKeySchema,
  rotateOneTimePreKeysSchema,
  consumeOneTimePreKeysSchema,
} from './e2ee.validation.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';

export const e2eeRouter: ExpressRouter = Router();

/**
 * @swagger
 * tags:
 *   name: E2EE
 *   description: End-to-end encryption key management and message relay
 */

/**
 * @swagger
 * /e2ee/keys:
 *   post:
 *     summary: Upload the caller's PUBLIC E2EE key bundle
 *     description: >
 *       Keys are generated on-device. The client uploads public keys only —
 *       identity public key, identity signing public key, a signed pre-key with
 *       a real signature, and pre-key/one-time-pre-key public keys. The server
 *       never receives or stores any private key material.
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identityKey, signedPreKey, preKeys, oneTimePreKeys]
 *             properties:
 *               identityKey:
 *                 type: object
 *                 required: [publicKey, signingPublicKey]
 *                 properties:
 *                   publicKey: { type: string }
 *                   signingPublicKey: { type: string }
 *               signedPreKey:
 *                 type: object
 *                 required: [keyId, publicKey, signature]
 *                 properties:
 *                   keyId: { type: integer }
 *                   publicKey: { type: string }
 *                   signature: { type: string }
 *               preKeys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     keyId: { type: integer }
 *                     publicKey: { type: string }
 *               oneTimePreKeys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     keyId: { type: integer }
 *                     publicKey: { type: string }
 *     responses:
 *       201:
 *         description: Public key bundle stored
 *       401:
 *         description: Unauthenticated
 */
e2eeRouter.post(
  '/keys',
  authenticate,
  validate({ body: publicKeyBundleSchema }),
  asyncHandler(e2eeController.uploadPublicKeys),
);

/**
 * @swagger
 * /e2ee/keys/{userId}:
 *   get:
 *     summary: Get a user's E2EE key bundle (public keys only)
 *     tags: [E2EE]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID to fetch keys for
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Key bundle retrieved
 *       404:
 *         description: Keys not found
 */
e2eeRouter.get('/keys/:userId', authenticate, asyncHandler(e2eeController.getKeyBundle));

/**
 * @swagger
 * /e2ee/keys/signed-pre-key:
 *   put:
 *     summary: Rotate signed pre-key
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signed pre-key rotated
 */
e2eeRouter.put(
  '/keys/signed-pre-key',
  authenticate,
  validate({ body: rotateSignedPreKeySchema }),
  asyncHandler(e2eeController.rotateSignedPreKey),
);

/**
 * @swagger
 * /e2ee/keys/one-time-pre-keys:
 *   put:
 *     summary: Rotate one-time pre-keys
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: One-time pre-keys rotated
 */
e2eeRouter.put(
  '/keys/one-time-pre-keys',
  authenticate,
  validate({ body: rotateOneTimePreKeysSchema }),
  asyncHandler(e2eeController.rotateOneTimePreKeys),
);

/**
 * @swagger
 * /e2ee/keys/pre-keys:
 *   put:
 *     summary: Store pre-keys
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preKeys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     keyId: { type: integer }
 *                     publicKey: { type: string }
 *     responses:
 *       200:
 *         description: Pre-keys stored
 */
e2eeRouter.put(
  '/keys/pre-keys',
  authenticate,
  validate({ body: preKeyUploadSchema }),
  asyncHandler(e2eeController.storePreKeys),
);

/**
 * @swagger
 * /e2ee/keys/one-time-pre-keys/consume:
 *   post:
 *     summary: Consume one-time pre-keys after use
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: One-time pre-keys consumed
 */
e2eeRouter.post(
  '/keys/one-time-pre-keys/consume',
  authenticate,
  validate({ body: consumeOneTimePreKeysSchema }),
  asyncHandler(e2eeController.consumeOneTimePreKeys),
);

/**
 * @swagger
 * /e2ee/messages:
 *   post:
 *     summary: Send an encrypted message (ciphertext relay)
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientId: { type: string }
 *               ciphertext: { type: string }
 *               timestamp: { type: integer }
 *     responses:
 *       200:
 *         description: Message relayed
 */
e2eeRouter.post(
  '/messages',
  authenticate,
  validate({ body: messageEnvelopeSchema }),
  asyncHandler(e2eeController.sendMessage),
);

/**
 * @swagger
 * /e2ee/keys:
 *   delete:
 *     summary: Delete E2EE keys (account deletion or key reset)
 *     tags: [E2EE]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Keys deleted
 */
e2eeRouter.delete('/keys', authenticate, asyncHandler(e2eeController.deleteKeys));
