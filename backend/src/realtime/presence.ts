import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const CONNECTIONS_KEY = 'eaz:presence:connections';

/**
 * Tracks how many socket connections each user currently holds, so a user is
 * only reported offline when *every* device has disconnected.
 *
 * Redis-backed for cross-instance presence; falls back to an in-memory map
 * when Redis is unreachable (local dev without docker, and the test suite).
 * The client registers an `error` listener so a *mid-run* disconnect (Redis
 * restarts, network blip, etc.) is logged rather than crashing the process
 * — Node kills a process on an unhandled EventEmitter `error` with no
 * listener (see the matching fix in `adapter.ts`). Reconnection is disabled
 * (`reconnectStrategy: false`) so a lost connection degrades once instead of
 * retrying forever in the background.
 */
export interface PresenceStore {
  addConnection(userId: string): Promise<number>;
  removeConnection(userId: string): Promise<number>;
  getOnlineUserIds(): Promise<string[]>;
  /**
   * Releases any Redis connection held by the store. Optional because the
   * in-memory store holds no resources to release.
   */
  disconnect?(): Promise<void>;
}

class RedisPresenceStore implements PresenceStore {
  private client: RedisClientType | null = null;
  private connected = false;
  // In-flight connection attempt, shared by concurrent first callers so a
  // burst of connections at startup doesn't each create (and orphan) their
  // own Redis client.
  private connecting: Promise<RedisClientType | null> | null = null;

  private async getClient(): Promise<RedisClientType | null> {
    if (this.connected) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        const client = createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: false } });
        client.on('error', (err) => {
          logger.warn({ err }, 'Redis presence client error — presence running degraded');
        });
        await client.connect();
        this.client = client;
        this.connected = true;
        return client;
      } catch (err) {
        logger.warn({ err }, 'Redis unavailable — presence falling back to in-memory');
        this.connected = false;
        return null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  async addConnection(userId: string): Promise<number> {
    const client = await this.getClient();
    if (!client) return memoryStore.addConnection(userId);
    return client.hIncrBy(CONNECTIONS_KEY, userId, 1);
  }

  async removeConnection(userId: string): Promise<number> {
    const client = await this.getClient();
    if (!client) return memoryStore.removeConnection(userId);
    const remaining = await client.hIncrBy(CONNECTIONS_KEY, userId, -1);
    if (remaining <= 0) {
      await client.hDel(CONNECTIONS_KEY, userId);
      return 0;
    }
    return remaining;
  }

  async getOnlineUserIds(): Promise<string[]> {
    const client = await this.getClient();
    if (!client) return memoryStore.getOnlineUserIds();
    const entries = await client.hGetAll(CONNECTIONS_KEY);
    return Object.entries(entries)
      .filter(([, count]) => Number(count) > 0)
      .map(([userId]) => userId);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
      this.connected = false;
    }
  }
}

class MemoryPresenceStore implements PresenceStore {
  private connections = new Map<string, number>();

  async addConnection(userId: string): Promise<number> {
    const next = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, next);
    return next;
  }

  async removeConnection(userId: string): Promise<number> {
    const current = this.connections.get(userId) ?? 0;
    const next = current - 1;
    if (next <= 0) {
      this.connections.delete(userId);
      return 0;
    }
    this.connections.set(userId, next);
    return next;
  }

  async getOnlineUserIds(): Promise<string[]> {
    return [...this.connections.keys()];
  }
}

const memoryStore = new MemoryPresenceStore();

/**
 * Selects the presence store from configuration: the Redis-backed store when
 * `REDIS_ENABLED` is true (cross-instance presence), otherwise the in-memory
 * store (single-instance). When Redis is disabled no Redis client is ever
 * created, so there are no connection attempts or connection-error logs.
 */
export function buildPresenceStore(): PresenceStore {
  return env.REDIS_ENABLED ? new RedisPresenceStore() : new MemoryPresenceStore();
}

export const presenceStore: PresenceStore = buildPresenceStore();
export { MemoryPresenceStore, RedisPresenceStore };
