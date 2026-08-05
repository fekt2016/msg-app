import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('./logger.js', () => ({ logger }));

import {
  checkInfraRequirements,
  logInfrastructureMode,
  resolveRedisEnabled,
} from './infrastructure.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveRedisEnabled', () => {
  it('defaults Redis off in development and test', () => {
    expect(resolveRedisEnabled('development', undefined)).toBe(false);
    expect(resolveRedisEnabled('test', undefined)).toBe(false);
  });

  it('defaults Redis on in staging and production', () => {
    expect(resolveRedisEnabled('staging', undefined)).toBe(true);
    expect(resolveRedisEnabled('production', undefined)).toBe(true);
  });

  it('an explicit flag always wins over the environment default', () => {
    expect(resolveRedisEnabled('development', 'true')).toBe(true);
    expect(resolveRedisEnabled('production', 'false')).toBe(false);
    expect(resolveRedisEnabled('staging', 'false')).toBe(false);
  });
});

describe('checkInfraRequirements', () => {
  it('rejects production without Redis', () => {
    expect(checkInfraRequirements('production', false)).toMatch(
      /REDIS_ENABLED must be true in production/,
    );
  });

  it('allows production with Redis', () => {
    expect(checkInfraRequirements('production', true)).toBeNull();
  });

  it('never blocks non-production environments, with or without Redis', () => {
    expect(checkInfraRequirements('development', false)).toBeNull();
    expect(checkInfraRequirements('staging', false)).toBeNull();
    expect(checkInfraRequirements('test', false)).toBeNull();
  });
});

describe('logInfrastructureMode', () => {
  it('reports the disabled-Redis + no-Docker mode for development', () => {
    logInfrastructureMode({ nodeEnv: 'development', redisEnabled: false, typesenseEnabled: false });

    const messages = logger.info.mock.calls.map((c) => c[0]);
    expect(messages).toContain('✓ Running in development mode');
    expect(messages).toContain('✓ Redis disabled by configuration');
    expect(messages.some((m) => /in-memory realtime adapter/.test(m))).toBe(true);
    expect(messages.some((m) => /Docker not required/.test(m))).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reports the enabled-Redis mode for production and does not log the Docker-optional note', () => {
    logInfrastructureMode({ nodeEnv: 'production', redisEnabled: true, typesenseEnabled: true });

    const messages = logger.info.mock.calls.map((c) => c[0]);
    expect(messages).toContain('✓ Running in production mode');
    expect(messages.some((m) => /Redis enabled/.test(m))).toBe(true);
    expect(messages.some((m) => /Search enabled/.test(m))).toBe(true);
    expect(messages.some((m) => /Docker not required/.test(m))).toBe(false);
  });

  it('warns when Redis is disabled in staging (recommended but not required)', () => {
    logInfrastructureMode({ nodeEnv: 'staging', redisEnabled: false, typesenseEnabled: false });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/Redis is disabled in staging/));
  });
});
