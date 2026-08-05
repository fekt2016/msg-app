import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors/AppError.js';
import {
  accessTokenExpirySeconds,
  generateJti,
  hashRefreshToken,
  refreshTokenExpirySeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './token.service.js';

describe('token.service', () => {
  it('round-trips an access token', () => {
    const token = signAccessToken({ sub: 'u1', role: 'USER', deviceId: 'd1' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('USER');
    expect(payload.deviceId).toBe('d1');
  });

  it('round-trips a refresh token', () => {
    const token = signRefreshToken({ sub: 'u1', deviceId: 'd1', jti: 'j1' });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.deviceId).toBe('d1');
    expect(payload.jti).toBe('j1');
  });

  it('rejects an access token signed with the wrong secret', () => {
    const token = signRefreshToken({ sub: 'u1', deviceId: 'd1', jti: 'j1' });
    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });

  it('throws AppError(401) for a garbage access token', () => {
    try {
      verifyAccessToken('not-a-jwt');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
      expect((err as AppError).code).toBe('INVALID_ACCESS_TOKEN');
    }
  });

  it('throws AppError(401) for a garbage refresh token', () => {
    expect(() => verifyRefreshToken('garbage')).toThrow(/invalid or expired/);
  });

  it('hashes refresh tokens with sha256', () => {
    const hash = hashRefreshToken('my-token');
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe('my-token');
  });

  it('generates unique jtis', () => {
    expect(generateJti()).not.toBe(generateJti());
  });

  it('computes expiry seconds from the env string', () => {
    expect(accessTokenExpirySeconds()).toBeGreaterThan(0);
    expect(refreshTokenExpirySeconds()).toBeGreaterThan(0);
  });

  it('falls back to defaults for malformed expiry env strings', async () => {
    const env = (await import('../../config/env.js')).env;
    const originalAccess = env.JWT_ACCESS_EXPIRES_IN;
    const originalRefresh = env.JWT_REFRESH_EXPIRES_IN;
    env.JWT_ACCESS_EXPIRES_IN = 'forever';
    env.JWT_REFRESH_EXPIRES_IN = 'forever';
    try {
      expect(accessTokenExpirySeconds()).toBe(900);
      expect(refreshTokenExpirySeconds()).toBe(604800);
    } finally {
      env.JWT_ACCESS_EXPIRES_IN = originalAccess;
      env.JWT_REFRESH_EXPIRES_IN = originalRefresh;
    }
  });
});
