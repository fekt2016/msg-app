import { describe, expect, it } from 'vitest';
import { env } from './env.js';

describe('env', () => {
  it('parses valid environment variables', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.APP_NAME).toBe('Eaz Community');
    expect(env.APP_PORT).toBeTypeOf('number');
    expect(env.MONGODB_URL).toContain('eaz_community_test');
    expect(env.RATE_LIMIT_MAX).toBe(100);
  });
});
