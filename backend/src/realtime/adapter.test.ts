import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config/logger.js', () => ({ logger }));

/**
 * A minimal stand-in for a `redis` v6 `RedisClientType` that lets each test
 * decide whether `connect()` succeeds or fails, and lets us grab the
 * registered `error` listener to simulate a mid-run disconnect.
 */
function makeFakeClient(opts: { failConnect?: boolean } = {}) {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const client = {
    isOpen: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return client;
    }),
    connect: vi.fn(async () => {
      if (opts.failConnect) {
        const err = new Error('ECONNREFUSED');
        throw err;
      }
      client.isOpen = true;
      return client;
    }),
    quit: vi.fn(async () => {
      client.isOpen = false;
    }),
    duplicate: vi.fn(() => makeFakeClient(opts)),
    emitError(err: unknown) {
      listeners.get('error')?.(err);
    },
  };
  return client;
}

type FakeClient = ReturnType<typeof makeFakeClient>;

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn<(...args: unknown[]) => FakeClient>(),
}));
vi.mock('redis', () => ({ createClient: createClientMock }));

import { buildRealtimeAdapter, InMemoryRealtimeAdapter, RedisRealtimeAdapter } from './adapter.js';
import { createRealtimeServer } from './server.js';
import { signAccessToken } from '../modules/auth/token.service.js';

function fakeIo(): Server {
  return { adapter: vi.fn() } as unknown as Server;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRealtimeAdapter (config-driven selection)', () => {
  it('returns the in-memory adapter when REDIS_ENABLED is false (test default) and never touches Redis', async () => {
    const adapter = buildRealtimeAdapter();
    expect(adapter).toBeInstanceOf(InMemoryRealtimeAdapter);

    const io = fakeIo();
    await expect(adapter.setup(io)).resolves.toBeUndefined();
    // No Redis client created, default in-memory adapter left in place.
    expect(createClientMock).not.toHaveBeenCalled();
    expect(io.adapter).not.toHaveBeenCalled();
  });
});

describe('RedisRealtimeAdapter (Redis unreachable)', () => {
  it('falls back to the in-memory adapter instead of rejecting when connect() fails', async () => {
    const pub = makeFakeClient({ failConnect: true });
    createClientMock.mockReturnValue(pub);

    const io = fakeIo();
    const adapter = new RedisRealtimeAdapter();

    await expect(adapter.setup(io)).resolves.toBeUndefined();

    // The default (in-memory) Socket.IO adapter must be left in place.
    expect(io.adapter).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/falling back to the in-memory adapter/),
    );
  });

  it('does not leave a dangling open connection when only the sub client fails', async () => {
    const pub = makeFakeClient({ failConnect: false });
    const sub = makeFakeClient({ failConnect: true });
    pub.duplicate = vi.fn(() => sub);
    createClientMock.mockReturnValue(pub);

    const io = fakeIo();
    const adapter = new RedisRealtimeAdapter();

    await expect(adapter.setup(io)).resolves.toBeUndefined();

    expect(io.adapter).not.toHaveBeenCalled();
    // pub connected successfully, so it must be quit rather than left open.
    expect(pub.quit).toHaveBeenCalled();
  });

  it('disconnect() is a safe no-op after a failed setup', async () => {
    const pub = makeFakeClient({ failConnect: true });
    createClientMock.mockReturnValue(pub);

    const adapter = new RedisRealtimeAdapter();
    await adapter.setup(fakeIo());

    await expect(adapter.disconnect?.()).resolves.toBeUndefined();
  });
});

describe('RedisRealtimeAdapter (Redis reachable)', () => {
  it('attaches the Redis adapter and registers error handlers on both clients', async () => {
    const pub = makeFakeClient();
    const sub = makeFakeClient();
    pub.duplicate = vi.fn(() => sub);
    createClientMock.mockReturnValue(pub);

    const io = fakeIo();
    const adapter = new RedisRealtimeAdapter();
    await adapter.setup(io);

    expect(io.adapter).toHaveBeenCalledTimes(1);
    expect(pub.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(sub.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('a mid-run "error" event on the pub client is logged, not thrown', async () => {
    const pub = makeFakeClient();
    const sub = makeFakeClient();
    pub.duplicate = vi.fn(() => sub);
    createClientMock.mockReturnValue(pub);

    const adapter = new RedisRealtimeAdapter();
    await adapter.setup(fakeIo());

    expect(() => pub.emitError(new Error('read ECONNRESET'))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/Redis pub client error/),
    );
  });

  it('a mid-run "error" event on the sub client is logged, not thrown', async () => {
    const pub = makeFakeClient();
    const sub = makeFakeClient();
    pub.duplicate = vi.fn(() => sub);
    createClientMock.mockReturnValue(pub);

    const adapter = new RedisRealtimeAdapter();
    await adapter.setup(fakeIo());

    expect(() => sub.emitError(new Error('read ECONNRESET'))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/Redis sub client error/),
    );
  });

  it('disconnect() quits both clients and is idempotent', async () => {
    const pub = makeFakeClient();
    const sub = makeFakeClient();
    pub.duplicate = vi.fn(() => sub);
    createClientMock.mockReturnValue(pub);

    const adapter = new RedisRealtimeAdapter();
    await adapter.setup(fakeIo());

    await adapter.disconnect?.();
    expect(pub.quit).toHaveBeenCalledTimes(1);
    expect(sub.quit).toHaveBeenCalledTimes(1);

    // Calling it again should not try to quit an already-closed client.
    await adapter.disconnect?.();
    expect(pub.quit).toHaveBeenCalledTimes(1);
    expect(sub.quit).toHaveBeenCalledTimes(1);
  });
});

describe('createRealtimeServer end-to-end (Redis unreachable at boot)', () => {
  it('boots into the in-memory fallback instead of crashing, and still serves socket connections', async () => {
    const pub = makeFakeClient({ failConnect: true });
    createClientMock.mockReturnValue(pub);

    const httpServer = createServer();

    // This is the historical bug: `adapter.setup()` used to reject on a
    // Redis outage, which made `createRealtimeServer()` — and therefore
    // `bootstrap()` in src/index.ts — reject and crash the process via
    // `process.exit(1)`. It must now resolve and boot in degraded mode.
    const realtime = await createRealtimeServer(httpServer, {
      adapter: new RedisRealtimeAdapter(),
    });

    const port = 4300 + Math.floor(Math.random() * 200);
    await new Promise<void>((resolve) => httpServer.listen(port, resolve));

    try {
      const socket = ioc(`http://localhost:${port}`, {
        path: '/socket.io',
        auth: {
          token: signAccessToken({ sub: 'user-1', role: 'USER', deviceId: 'device-1' }),
        },
        forceNew: true,
        reconnection: false,
        timeout: 3000,
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
      });

      expect(socket.connected).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/falling back to the in-memory adapter/),
      );

      socket.disconnect();
    } finally {
      await realtime.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
