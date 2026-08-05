import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import type { UserRole } from './user.model.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  deviceId: string;
}

export interface RefreshTokenPayload {
  sub: string;
  deviceId: string;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ALGORITHM = 'HS256';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] }) as AccessTokenPayload;
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: [ALGORITHM],
    }) as RefreshTokenPayload;
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateJti(): string {
  return crypto.randomUUID();
}

export function accessTokenExpirySeconds(): number {
  const match = env.JWT_ACCESS_EXPIRES_IN.match(/^(\d+)(m|h|d)$/);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const seconds = unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * seconds;
}

export function refreshTokenExpirySeconds(): number {
  const match = env.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)(m|h|d)$/);
  if (!match) return 604800;
  const value = Number(match[1]);
  const unit = match[2];
  const seconds = unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * seconds;
}
