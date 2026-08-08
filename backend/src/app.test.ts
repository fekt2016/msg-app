import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, resolveTrustProxy } from './app.js';

const app = createApp();

describe('resolveTrustProxy', () => {
  it('treats false/empty as no trust (safe default)', () => {
    expect(resolveTrustProxy('false')).toBe(false);
    expect(resolveTrustProxy('')).toBe(false);
  });

  it('parses true and integer hop counts', () => {
    expect(resolveTrustProxy('true')).toBe(true);
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
  });

  it('passes presets/subnets through as strings', () => {
    expect(resolveTrustProxy('loopback')).toBe('loopback');
    expect(resolveTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });
});

describe('app', () => {
  it('responds to the health check', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('returns a standardized envelope for thrown AppErrors', async () => {
    const res = await request(app).get('/api/v1/error-test');

    expect(res.status).toBe(418);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'TEAPOT',
        message: 'Demonstration of the centralized error handler',
        details: [],
      },
    });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('serves the OpenAPI docs', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
