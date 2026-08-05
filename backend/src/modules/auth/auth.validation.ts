import { z } from 'zod';

const identifierSchema = z
  .string()
  .trim()
  .min(3, 'Identifier is required')
  .max(254, 'Identifier is too long');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const deviceIdSchema = z
  .string()
  .trim()
  .min(1, 'Device id is required')
  .max(128, 'Device id is too long');

export const registerSchema = z
  .object({
    identifier: identifierSchema,
    password: passwordSchema,
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .max(50, 'Display name is too long'),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    identifier: identifierSchema,
    purpose: z.enum(['VERIFY', 'RESET', 'LOGIN']),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Code must be a 6-digit number'),
    deviceId: deviceIdSchema,
  })
  .strict();

export const resendOtpSchema = z
  .object({
    identifier: identifierSchema,
    purpose: z.enum(['VERIFY', 'RESET', 'LOGIN']),
  })
  .strict();

export const loginSchema = z
  .object({
    identifier: identifierSchema,
    password: passwordSchema,
    deviceId: deviceIdSchema,
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  })
  .strict();

export type RegisterBody = z.infer<typeof registerSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type ResendOtpBody = z.infer<typeof resendOtpSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type LogoutBody = z.infer<typeof logoutSchema>;
