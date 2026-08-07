import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const KEY_PREFIX = 'eaz:rl:';

interface MemoryEntry {
  hits: number;
  resetAt: number;
}

let sharedClient: RedisClientType | null = null;

function getSharedClient(): RedisClientType | null {
  if (sharedClient) return sharedClient;
  const client = createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: false } });
  client.on('error', (err) => {
    logger.warn(
      { err },
      'Redis rate-limit client error — rate limiting falling back to in-memory (single-instance only)',
    );
  });
  sharedClient = client;
  void client.connect().catch(() => undefined);
  return client;
}

/**
 * Redis-backed fixed-window rate-limit store so limits hold across multiple
 * backend instances — the same graceful-degradation philosophy as the Socket.IO
 * Redis adapter (`src/realtime/adapter.ts`), never fail-open and never crash:
 *
 * - Redis is optional by configuration (`buildRateLimitStore` returns `undefined`
 *   when `REDIS_ENABLED` is off, so express-rate-limit uses its default in-memory
 *   store — the local-dev and test path; vitest pins `REDIS_ENABLED=false`).
 * - If Redis is unreachable, queued commands reject and each store logs once,
 *   switches to a local in-memory window (single-instance only) and keeps
 *   limiting instead of letting everything through.
 * - An `error` listener prevents the unhandled EventEmitter `error` that would
 *   otherwise kill the process, and `reconnectStrategy: false` degrades once
 *   rather than retrying forever in the background.
 *
 * One instance per limiter — express-rate-limit throws `ERR_ERL_STORE_REUSE`
 * when a single instance is shared — and one `windowMs` per instance, because
 * the fixed-window TTL must be that limiter's own window.
 */
export class RedisRateLimitStore implements Store {
  localKeys = false;

  private windowMs: number;
  private client: RedisClientType | null;
  private degraded = false;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(windowMs: number, client: RedisClientType | null = getSharedClient()) {
    this.windowMs = windowMs;
    this.client = client;
  }

  async init(options: Options): Promise<void> {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (!this.degraded && this.client) {
      try {
        const fullKey = KEY_PREFIX + key;
        const totalHits = await this.client.incr(fullKey);
        if (totalHits === 1) {
          await this.client.pExpire(fullKey, this.windowMs);
        }
        return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
      } catch (err) {
        this.degrade(err);
      }
    }
    return this.incrementMemory(key);
  }

  async decrement(key: string): Promise<void> {
    if (!this.degraded && this.client) {
      try {
        const fullKey = KEY_PREFIX + key;
        const hits = await this.client.decr(fullKey);
        if (hits <= 0) {
          await this.client.del(fullKey);
        }
        return;
      } catch (err) {
        this.degrade(err);
      }
    }
    const entry = this.memory.get(key);
    if (entry && Date.now() < entry.resetAt) {
      entry.hits -= 1;
      if (entry.hits <= 0) {
        this.memory.delete(key);
      }
    }
  }

  async resetKey(key: string): Promise<void> {
    if (!this.degraded && this.client) {
      try {
        await this.client.del(KEY_PREFIX + key);
        return;
      } catch (err) {
        this.degrade(err);
      }
    }
    this.memory.delete(key);
  }

  async shutdown(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit().catch(() => undefined);
    }
    this.client = null;
  }

  private incrementMemory(key: string): IncrementResponse {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || now >= entry.resetAt) {
      this.memory.set(key, { hits: 1, resetAt: now + this.windowMs });
      return { totalHits: 1, resetTime: new Date(now + this.windowMs) };
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }

  private degrade(err: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    logger.warn(
      { err },
      'Redis rate-limit store error — rate limiting falling back to in-memory (single-instance only)',
    );
    if (this.client?.isOpen) {
      void this.client.quit().catch(() => undefined);
    }
    this.client = null;
  }
}

/**
 * Selects the rate-limit store from configuration: a Redis-backed store when
 * `REDIS_ENABLED` is true (one fresh instance per limiter), otherwise
 * `undefined` so express-rate-limit keeps its default in-memory store — the
 * local-dev and test-suite path.
 */
export function buildRateLimitStore(windowMs: number): Store | undefined {
  return env.REDIS_ENABLED ? new RedisRateLimitStore(windowMs) : undefined;
}
