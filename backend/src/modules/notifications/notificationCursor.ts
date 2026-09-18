import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError.js';

/**
 * Opaque cursor for the notification feed (mirrors the channel-post cursor):
 * `base64url(JSON { c: createdAt ISO, i: notificationId })`, decoded back into
 * a compound `$or` on `{createdAt, _id}` — a deterministic secondary sort so
 * cursor pages never skip or duplicate rows (ROADMAP §8).
 */
export interface NotificationCursor {
  createdAt: Date;
  notificationId: string;
}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.notificationId }),
  ).toString('base64url');
}

export function decodeNotificationCursor(value: string): NotificationCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      c?: unknown;
      i?: unknown;
    };
    if (typeof parsed.c === 'string' && typeof parsed.i === 'string') {
      const createdAt = new Date(parsed.c);
      if (!Number.isNaN(createdAt.getTime()) && Types.ObjectId.isValid(parsed.i)) {
        return { createdAt, notificationId: parsed.i };
      }
    }
  } catch {
    // fall through to the invalid-cursor error
  }
  throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
}
