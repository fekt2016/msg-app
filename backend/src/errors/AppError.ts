export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: unknown[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { details?: unknown[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = options?.details;
  }
}
