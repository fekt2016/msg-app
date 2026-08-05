import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import type { AppError } from '../errors/AppError.js';
import { authorize } from './authorize.js';

function mockReq(user?: { id: string; role: string; deviceId: string }) {
  return { user } as Request;
}

describe('authorize', () => {
  it('allows a matching role', () => {
    const next = vi.fn() as NextFunction;
    authorize('ADMIN', 'USER')(
      mockReq({ id: 'u1', role: 'ADMIN', deviceId: 'd1' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('forbids a non-matching role', () => {
    const next = vi.fn() as NextFunction;
    authorize('ADMIN')(mockReq({ id: 'u1', role: 'USER', deviceId: 'd1' }), {} as Response, next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('requires authentication when no user is attached', () => {
    const next = vi.fn() as NextFunction;
    authorize('ADMIN')(mockReq(), {} as Response, next);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHENTICATED');
  });
});
