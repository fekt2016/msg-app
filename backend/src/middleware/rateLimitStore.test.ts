import { createClient, type RedisClientType } from 'redis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config/logger.js', () => ({ logger }));

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    incr: vi.fn(async () => 1),
    pExpire: vi.fn(async () => 1),
    decr: vi.fn(async () => 1),
    del: vi.fn(async () => 1),
    quit: vi.fn(async () => 'OK'),
  })),
}));

import { buildRateLimitStore, RedisRateLimitStore } from './rateLimitStore.js';

function makeFakeClient() {
  const incr = vi.fn<() => Promise<number>>();
  const pExpire = vi.fn<() => Promise<number>>();
  const decr = vi.fn<() => Promise<number>>();
  const del = vi.fn<() => Promise<number>>();
  const quit = vi.fn<() => Promise<string>>().mockResolvedValue('OK');
  const client = {
    isOpen: true,
    incr,
    pExpire,
    decr,
    del,
    quit,
    on: vi.fn(),
  } as unknown as RedisClientType;
  return { client, incr, pExpire, decr, del, quit };
}

describe('RedisRateLimitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a shared (non-local) store', () => {
    const { client } = makeFakeClient();
    expect(new RedisRateLimitStore(1000, client).localKeys).toBe(false);
  });

  it('increments in Redis, setting the window TTL only on the first hit', async () => {
    const { client, incr, pExpire } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    incr.mockResolvedValueOnce(1);
    const first = await store.increment('203.0.113.7');
    expect(first.totalHits).toBe(1);
    expect(first.resetTime).toBeInstanceOf(Date);
    expect(incr).toHaveBeenCalledWith('eaz:rl:203.0.113.7');
    expect(pExpire).toHaveBeenCalledWith('eaz:rl:203.0.113.7', 1000);

    incr.mockResolvedValueOnce(2);
    const second = await store.increment('203.0.113.7');
    expect(second.totalHits).toBe(2);
    expect(pExpire).toHaveBeenCalledTimes(1);
  });

  it('uses the windowMs supplied by init(options)', async () => {
    const { client, incr, pExpire } = makeFakeClient();
    const store = new RedisRateLimitStore(0, client);

    await store.init({ windowMs: 5000 } as never);
    incr.mockResolvedValueOnce(1);
    await store.increment('203.0.113.7');
    expect(pExpire).toHaveBeenCalledWith('eaz:rl:203.0.113.7', 5000);
  });

  it('decrements in Redis and deletes the key when it reaches zero', async () => {
    const { client, decr, del } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    decr.mockResolvedValueOnce(1);
    await store.decrement('203.0.113.7');
    expect(del).not.toHaveBeenCalled();

    decr.mockResolvedValueOnce(0);
    await store.decrement('203.0.113.7');
    expect(del).toHaveBeenCalledWith('eaz:rl:203.0.113.7');
  });

  it('resets a key by deleting it from Redis', async () => {
    const { client, del } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    await store.resetKey('203.0.113.7');
    expect(del).toHaveBeenCalledWith('eaz:rl:203.0.113.7');
  });

  it('logs once and keeps limiting in-memory when Redis commands fail', async () => {
    const { client, incr, pExpire, quit } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    incr.mockRejectedValueOnce(new Error('connection refused'));
    const first = await store.increment('203.0.113.7');
    expect(first.totalHits).toBe(1);
    expect(quit).toHaveBeenCalled();

    const second = await store.increment('203.0.113.7');
    expect(second.totalHits).toBe(2);
    expect(pExpire).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0][1])).toMatch(/falling back to in-memory/);
  });

  it('decrements and resets against the in-memory fallback after degradation', async () => {
    const { client, incr, decr } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    incr.mockRejectedValue(new Error('down'));
    await store.increment('203.0.113.7');

    decr.mockRejectedValueOnce(new Error('down'));
    await store.decrement('203.0.113.7');

    await store.resetKey('203.0.113.7');
    const again = await store.increment('203.0.113.7');
    expect(again.totalHits).toBe(1);
  });

  it('closes the Redis connection on shutdown', async () => {
    const { client, quit } = makeFakeClient();
    const store = new RedisRateLimitStore(1000, client);

    await store.shutdown();
    expect(quit).toHaveBeenCalled();
  });
});

describe('RedisRateLimitStore shared client', () => {
  it('creates one shared client with an error listener, connects, and reuses it for later stores', async () => {
    const mockedCreateClient = vi.mocked(createClient);

    const storeA = new RedisRateLimitStore(1000);
    const storeB = new RedisRateLimitStore(3600_000);

    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
    expect(mockedCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.any(String) }),
    );
    const client = mockedCreateClient.mock.results[0].value as {
      on: (...args: unknown[]) => unknown;
      connect: () => Promise<void>;
    };
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(client.connect).toHaveBeenCalled();

    await expect(storeA.increment('203.0.113.7')).resolves.toEqual({
      totalHits: 1,
      resetTime: expect.any(Date),
    });
    await expect(storeB.increment('198.51.100.4')).resolves.toEqual({
      totalHits: 1,
      resetTime: expect.any(Date),
    });
  });
});

describe('buildRateLimitStore', () => {
  it('returns undefined when Redis is disabled (default in dev/test), keeping the in-memory store', () => {
    expect(buildRateLimitStore(900_000)).toBeUndefined();
  });
});
