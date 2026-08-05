import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import type { UserRole } from '../modules/auth/user.model.js';

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}
