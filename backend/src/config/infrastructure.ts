import { logger } from './logger.js';

/**
 * Infrastructure mode resolution + startup reporting.
 *
 * Redis (and the optional Docker-provided services behind it) is treated as
 * *gracefully optional* in development and *required* in production:
 *
 *   | NODE_ENV     | Redis default | Docker      | Enforcement                 |
 *   | ------------ | ------------- | ----------- | --------------------------- |
 *   | development  | off           | optional    | none — in-memory fallbacks  |
 *   | test         | off           | optional    | none                        |
 *   | staging      | on (recommend)| recommended | warn if disabled            |
 *   | production   | on (required) | required    | fail-fast if disabled       |
 *
 * The resolution/validation helpers are pure so they can be unit-tested without
 * booting the app; `logInfrastructureMode` is the single, non-spammy startup
 * summary (the noisy per-connection Redis errors are avoided by never opening a
 * client when Redis is disabled, and by `reconnectStrategy: false` when it is).
 */
export type NodeEnv = 'development' | 'test' | 'staging' | 'production';

/**
 * Resolve whether Redis should be used. An explicit `REDIS_ENABLED` always
 * wins; otherwise it defaults on for the production-like environments
 * (staging/production) and off for local development and tests.
 */
export function resolveRedisEnabled(nodeEnv: NodeEnv, raw: 'true' | 'false' | undefined): boolean {
  if (raw !== undefined) return raw === 'true';
  return nodeEnv === 'production' || nodeEnv === 'staging';
}

/**
 * Hard, fail-fast requirements per environment. Returns an error message when a
 * requirement is violated (production must have Redis), otherwise `null`.
 */
export function checkInfraRequirements(nodeEnv: NodeEnv, redisEnabled: boolean): string | null {
  if (nodeEnv === 'production' && !redisEnabled) {
    return 'REDIS_ENABLED must be true in production — Redis is required for cross-instance Socket.IO fan-out, presence, and pub/sub. Set REDIS_ENABLED=true and provide a reachable REDIS_URL.';
  }
  return null;
}

/**
 * One clear startup summary of the active infrastructure mode. Intentionally a
 * handful of explicit lines instead of repeated connection errors.
 */
export function logInfrastructureMode(opts: {
  nodeEnv: NodeEnv;
  redisEnabled: boolean;
  typesenseEnabled: boolean;
}): void {
  const { nodeEnv, redisEnabled, typesenseEnabled } = opts;

  logger.info(`✓ Running in ${nodeEnv} mode`);

  if (redisEnabled) {
    logger.info(
      '✓ Redis enabled — Socket.IO Redis adapter + Redis presence store (cross-instance)',
    );
  } else {
    logger.info('✓ Redis disabled by configuration');
    logger.info(
      '✓ Running with in-memory realtime adapter + in-memory presence (single-instance fan-out)',
    );
  }

  logger.info(
    typesenseEnabled
      ? '✓ Search enabled — Typesense'
      : '✓ Search disabled by configuration — logging fallback',
  );

  if (nodeEnv === 'development' || nodeEnv === 'test') {
    logger.info(
      '✓ Docker not required for this environment — run `docker compose up` only if you want local Redis/Typesense',
    );
  }

  if (nodeEnv === 'staging' && !redisEnabled) {
    logger.warn(
      'Redis is disabled in staging — enabling it is recommended for parity with production (cross-instance realtime/presence).',
    );
  }
}
