import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { verifyAccessToken, type AccessTokenPayload } from '../modules/auth/token.service.js';

export interface AuthenticatedUser {
  id: string;
  role: AccessTokenPayload['role'];
  deviceId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, deviceId: payload.deviceId };
    next();
  } catch (err) {
    next(err);
  }
}
