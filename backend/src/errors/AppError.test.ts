import { describe, expect, it } from 'vitest';
import { AppError } from './AppError.js';

describe('AppError', () => {
  it('carries HTTP metadata and is operational by default', () => {
    const err = new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');

    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('PRODUCT_NOT_FOUND');
    expect(err.message).toBe('Product not found');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('attaches validation details', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = new AppError(422, 'VALIDATION_ERROR', 'Invalid input', { details });

    expect(err.details).toEqual(details);
  });
});
