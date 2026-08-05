import { Router } from 'express';
import { authController } from './auth.controller.js';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from './auth.validation.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const authRouter: Router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthTokens:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *         expiresIn: { type: integer, description: 'Access token TTL in seconds' }
 *     SafeUser:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         email: { type: string, nullable: true }
 *         phone: { type: string, nullable: true }
 *         displayName: { type: string }
 *         role: { type: string }
 *         status: { type: string }
 *         isVerified: { type: boolean }
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password, displayName]
 *             properties:
 *               identifier: { type: string, description: 'Email or E.164 phone number' }
 *               password: { type: string, format: password, minLength: 8 }
 *               displayName: { type: string, minLength: 1, maxLength: 50 }
 *     responses:
 *       201:
 *         description: Account created; an OTP has been issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId: { type: string }
 *       409:
 *         description: Identifier already taken
 *       422:
 *         description: Validation failed
 */
authRouter.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Re-issue a verification code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, purpose]
 *             properties:
 *               identifier: { type: string }
 *               purpose: { type: string, enum: [VERIFY, RESET, LOGIN] }
 *     responses:
 *       200:
 *         description: OTP re-issued
 *       429:
 *         description: Rate limited
 */
authRouter.post(
  '/resend-otp',
  validate({ body: resendOtpSchema }),
  asyncHandler(authController.resendOtp),
);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify a code and (for VERIFY) activate the account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, purpose, code, deviceId]
 *             properties:
 *               identifier: { type: string }
 *               purpose: { type: string, enum: [VERIFY, RESET, LOGIN] }
 *               code: { type: string, pattern: '^[0-9]{6}$' }
 *               deviceId: { type: string }
 *     responses:
 *       200:
 *         description: Verified; tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/SafeUser' }
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     expiresIn: { type: integer }
 */
authRouter.post(
  '/verify-otp',
  validate({ body: verifyOtpSchema }),
  asyncHandler(authController.verifyOtp),
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in with credentials
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password, deviceId]
 *             properties:
 *               identifier: { type: string }
 *               password: { type: string, format: password }
 *               deviceId: { type: string }
 *     responses:
 *       200:
 *         description: Logged in; tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/SafeUser' }
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     expiresIn: { type: integer }
 *       401:
 *         description: Invalid credentials
 */
authRouter.post('/login', validate({ body: loginSchema }), asyncHandler(authController.login));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair issued
 *       401:
 *         description: Invalid, expired, or reused refresh token
 */
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh),
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke the current session
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Session revoked
 */
authRouter.post('/logout', validate({ body: logoutSchema }), asyncHandler(authController.logout));

export default authRouter;
