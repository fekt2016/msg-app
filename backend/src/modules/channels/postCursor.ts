import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError.js';

/**
 * Net-new cursor-pagination infra (documented deviation from the offset
 * page/pageSize `meta` shape): the post feed is append-heavy and high-volume,
 * so it pages with an opaque cursor rather than `{page, pageSize}`. The cursor
 * is `base64url(JSON { c: createdAt ISO, i: postId })` and the feed sorts by
 * `{createdAt: -1, _id: -1}` with the cursor encoded as a compound
 * `$or` on those two fields — a deterministic secondary sort so pages never
 * skip or duplicate rows.
 */
export interface PostCursor {
  createdAt: Date;
  postId: string;
}

export function encodePostCursor(cursor: PostCursor): string {
  return Buffer.from(
    JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.postId }),
  ).toString('base64url');
}

export function decodePostCursor(value: string): PostCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      c?: unknown;
      i?: unknown;
    };
    if (typeof parsed.c === 'string' && typeof parsed.i === 'string') {
      const createdAt = new Date(parsed.c);
      if (!Number.isNaN(createdAt.getTime()) && Types.ObjectId.isValid(parsed.i)) {
        return { createdAt, postId: parsed.i };
      }
    }
  } catch {
    // fall through to the invalid-cursor error
  }
  throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
}
