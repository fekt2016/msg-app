import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/AppError.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Request['query'];
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params) as Request['params'];
        Object.defineProperty(req, 'params', { value: parsed, writable: true, configurable: true });
      }
      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      const details = formatZodError(err);
      next(new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', { details }));
    }
  };
}

function formatZodError(err: unknown): unknown[] {
  if (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  ) {
    return (err as { issues: Array<{ path: (string | number)[]; message: string }> }).issues.map(
      (issue) => ({ field: issue.path.join('.'), message: issue.message }),
    );
  }
  return [];
}
