import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface PushMessage {
  /** Expo push tokens (ExponentPushToken[...]) of the recipient's devices. */
  tokens: string[];
  title: string;
  body: string;
  /** Opaque data delivered to the app for deep-linking (e.g. chat id). */
  data?: Record<string, unknown>;
}

export interface PushProvider {
  send(message: PushMessage): Promise<void>;
}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Delivers notifications through Expo's push service. Notifications are
 * best-effort: a delivery failure is logged, never thrown, so it can never
 * break the realtime message flow that triggers it.
 */
class ExpoPushProvider implements PushProvider {
  async send(message: PushMessage): Promise<void> {
    const tokens = message.tokens.filter((t) => t.startsWith('ExponentPushToken'));
    if (tokens.length === 0) {
      return;
    }

    const payload = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      sound: 'default' as const,
      ...(message.data ? { data: message.data } : {}),
    }));

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, tokenCount: tokens.length },
        'Expo push delivery returned a non-2xx status',
      );
    }
  }
}

/**
 * Dev/test/CI fallback used when PUSH_ENABLED is off: logs the notification
 * instead of sending it, so local dev never requires Expo connectivity.
 */
class LoggingPushProvider implements PushProvider {
  async send(message: PushMessage): Promise<void> {
    logger.info(
      { tokenCount: message.tokens.length, title: message.title },
      `[PUSH] ${message.title}: ${message.body}`,
    );
  }
}

function buildProvider(): PushProvider {
  if (env.PUSH_ENABLED) {
    return new ExpoPushProvider();
  }
  return new LoggingPushProvider();
}

export const pushProvider: PushProvider = buildProvider();
