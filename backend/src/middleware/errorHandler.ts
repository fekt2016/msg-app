import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? [],
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong',
      details: [],
    },
  });
}
