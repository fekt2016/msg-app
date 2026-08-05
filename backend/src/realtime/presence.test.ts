import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config/logger.js', () => ({ logger }));

/**
 * A minimal stand-in for a `redis` v6 `RedisClientType` that lets the test
 * grab the registered `error` listener to simulate a mid-run disconnect,
 * mirroring the fake client in `adapter.test.ts`.
 */
function makeFakeClient() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const client = {
    isOpen: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return client;
    }),
    connect: vi.fn(async () => {
      client.isOpen = true;
      return client;
    }),
    quit: vi.fn(async () => {
      client.isOpen = false;
    }),
    hIncrBy: vi.fn(async () => 1),
    hDel: vi.fn(async () => 1),
    hGetAll: vi.fn(async () => ({})),
    emitError(err: unknown) {
      listeners.get('error')?.(err);
    },
  };
  return client;
}

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));
vi.mock('redis', () => ({ createClient: createClientMock }));

const { MemoryPresenceStore, RedisPresenceStore, presenceStore } = await import('./presence.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MemoryPresenceStore', () => {
  it('counts multiple connections per user', async () => {
    const store = new MemoryPresenceStore();

    expect(await store.addConnection('u1')).toBe(1);
    expect(await store.addConnection('u1')).toBe(2);
    expect(await store.getOnlineUserIds()).toEqual(['u1']);
  });

  it('reports offline only when the last connection is removed', async () => {
    const store = new MemoryPresenceStore();

    await store.addConnection('u1');
    await store.addConnection('u1');
    expect(await store.removeConnection('u1')).toBe(1);
    expect(await store.getOnlineUserIds()).toEqual(['u1']);

    expect(await store.removeConnection('u1')).toBe(0);
    expect(await store.getOnlineUserIds()).toEqual([]);
  });

  it('handles removing a connection that never existed', async () => {
    const store = new MemoryPresenceStore();
    expect(await store.removeConnection('ghost')).toBe(0);
    expect(await store.getOnlineUserIds()).toEqual([]);
  });

  it('tracks multiple users independently', async () => {
    const store = new MemoryPresenceStore();

    await store.addConnection('a');
    await store.addConnection('b');
    await store.removeConnection('a');

    expect(await store.getOnlineUserIds().then((ids) => ids.sort())).toEqual(['b']);
  });
});

describe('buildPresenceStore (config-driven selection)', () => {
  it('the exported singleton is the in-memory store when REDIS_ENABLED is false (test default)', () => {
    expect(presenceStore).toBeInstanceOf(MemoryPresenceStore);
  });
});

describe('RedisPresenceStore (Redis reachable)', () => {
  it('connects with reconnectStrategy disabled, registers an error handler, and a mid-run "error" event is logged, not thrown', async () => {
    const client = makeFakeClient();
    createClientMock.mockReturnValue(client);

    const store = new RedisPresenceStore();
    await store.addConnection('user-1');

    expect(createClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ socket: { reconnectStrategy: false } }),
    );
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));

    expect(() => client.emitError(new Error('read ECONNRESET'))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/Redis presence client error/),
    );

    await store.disconnect?.();
  });
});
