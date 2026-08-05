import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/AppError.js';
import { authenticate } from './authenticate.js';
import * as tokenService from '../modules/auth/token.service.js';

function mockRes() {
  return {} as Response;
}

describe('authenticate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the user and calls next() for a valid Bearer token', () => {
    vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue({
      sub: 'u1',
      role: 'USER',
      deviceId: 'd1',
    } as never);
    const req = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    } as Request;
    const next = vi.fn() as NextFunction;

    authenticate(req, mockRes(), next);

    expect(req.user).toEqual({ id: 'u1', role: 'USER', deviceId: 'd1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a missing Authorization header', () => {
    const req = { headers: {} } as Request;
    const next = vi.fn() as NextFunction;

    authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('rejects a non-Bearer header', () => {
    const req = { headers: { authorization: 'Basic dXNlcg==' } } as Request;
    const next = vi.fn() as NextFunction;

    authenticate(req, mockRes(), next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('rejects an empty token', () => {
    const req = { headers: { authorization: 'Bearer   ' } } as Request;
    const next = vi.fn() as NextFunction;

    authenticate(req, mockRes(), next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('forwards verification failures to next()', () => {
    vi.spyOn(tokenService, 'verifyAccessToken').mockImplementation(() => {
      throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'expired');
    });
    const req = { headers: { authorization: 'Bearer expired.token' } } as Request;
    const next = vi.fn() as NextFunction;

    authenticate(req, mockRes(), next);

    expect((next.mock.calls[0][0] as AppError).code).toBe('INVALID_ACCESS_TOKEN');
  });
});
