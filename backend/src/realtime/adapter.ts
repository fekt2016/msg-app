import type { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface RealtimeAdapter {
  setup(io: Server): Promise<void>;
  /**
   * Releases any Redis connections held by the adapter. Optional because
   * test doubles (e.g. a no-op adapter) don't hold any resources to release.
   * Safe to call even when `setup()` fell back to in-memory (no-op then).
   */
  disconnect?(): Promise<void>;
}

/**
 * Redis pub/sub adapter for horizontal scaling — multiple backend instances
 * share realtime events through one Redis instance.
 *
 * `setup()` never rejects because of Redis: a connection failure at startup
 * is logged and the adapter falls back to Socket.IO's built-in in-memory
 * adapter (single-instance fan-out only — fine for local dev without
 * docker and for the test suite, mirroring the fallback pattern already
 * used for the OTP / media providers and for `presence.ts`). Both clients
 * also register an `error` listener so a *mid-run* disconnect (Redis
 * restarts, network blip, etc.) is logged rather than crashing the process
 * — Node kills a process on an unhandled EventEmitter `error` with no
 * listener. Reconnection is disabled (`reconnectStrategy: false`) so a lost
 * connection degrades once to local-only fan-out instead of retrying
 * forever in the background.
 */
class RedisRealtimeAdapter implements RealtimeAdapter {
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;

  async setup(io: Server): Promise<void> {
    const url = env.REDIS_URL;
    const pubClient = createClient({ url, socket: { reconnectStrategy: false } });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      logger.warn(
        { err },
        'Redis pub client error — Socket.IO realtime adapter running degraded (local-instance fan-out only)',
      );
    });
    subClient.on('error', (err) => {
      logger.warn(
        { err },
        'Redis sub client error — Socket.IO realtime adapter running degraded (local-instance fan-out only)',
      );
    });

    try {
      await pubClient.connect();
      await subClient.connect();
    } catch (err) {
      logger.warn(
        { err },
        'Redis unreachable — Socket.IO realtime adapter falling back to the in-memory adapter (single-instance fan-out only)',
      );
      await closeQuietly(pubClient);
      await closeQuietly(subClient);
      return;
    }

    this.pubClient = pubClient;
    this.subClient = subClient;
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter attached');
  }

  async disconnect(): Promise<void> {
    await Promise.all([closeQuietly(this.pubClient), closeQuietly(this.subClient)]);
    this.pubClient = null;
    this.subClient = null;
  }
}

async function closeQuietly(client: RedisClientType | null): Promise<void> {
  if (!client?.isOpen) return;
  await client.quit().catch(() => undefined);
}

/**
 * No-op adapter used when Redis is disabled by configuration
 * (`REDIS_ENABLED=false`, the default in development/test). Socket.IO already
 * uses its built-in in-memory adapter, so there is nothing to attach and — by
 * design — no Redis client is ever created (hence no connection attempts and
 * no connection-error logs). Single-instance fan-out only.
 */
export class InMemoryRealtimeAdapter implements RealtimeAdapter {
  async setup(_io: Server): Promise<void> {
    // Intentionally empty: the default in-memory adapter is already in place.
    // The single, clear startup message is emitted by logInfrastructureMode().
  }
}

export { RedisRealtimeAdapter };

/**
 * Selects the realtime adapter from configuration: the Redis adapter when
 * `REDIS_ENABLED` is true, otherwise the in-memory adapter. Callers may still
 * inject their own adapter (e.g. tests) via `createRealtimeServer`.
 */
export function buildRealtimeAdapter(): RealtimeAdapter {
  return env.REDIS_ENABLED ? new RedisRealtimeAdapter() : new InMemoryRealtimeAdapter();
}
