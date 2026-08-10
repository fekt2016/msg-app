import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force the Expo provider path regardless of the ambient env.
vi.mock('../../config/env.js', () => ({ env: { PUSH_ENABLED: true } }));

describe('ExpoPushProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts one Expo message per token with title, body and data', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { pushProvider } = await import('./push.provider.js');

    await pushProvider.send({
      tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      title: 'New message',
      body: 'hi',
      data: { type: 'chat:message' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const payload = JSON.parse(options.body);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      title: 'New message',
      body: 'hi',
      sound: 'default',
      data: { type: 'chat:message' },
    });
  });

  it('drops tokens that are not Expo push tokens and skips the call when none remain', async () => {
    const { pushProvider } = await import('./push.provider.js');

    await pushProvider.send({ tokens: ['garbage', 'fcm:xyz'], title: 't', body: 'b' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when Expo returns a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    const { pushProvider } = await import('./push.provider.js');

    await expect(
      pushProvider.send({ tokens: ['ExponentPushToken[a]'], title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
  });
});
