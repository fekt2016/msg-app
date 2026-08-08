import { describe, expect, it } from 'vitest';
import { decodePostCursor, encodePostCursor } from './postCursor.js';

const INVALID = expect.objectContaining({ code: 'INVALID_CURSOR' });

describe('postCursor', () => {
  it('round-trips a cursor through base64url encoding', () => {
    const cursor = {
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      postId: '664f1c2b8f1b2c001f000001',
    };
    const encoded = encodePostCursor(cursor);
    expect(encoded).not.toContain('=');
    expect(decodePostCursor(encoded)).toEqual(cursor);
  });

  it('rejects a non-base64 payload', () => {
    expect(() => decodePostCursor('!!!not-json!!!')).toThrowError(INVALID);
  });

  it('rejects a JSON payload without a valid ObjectId post id', () => {
    const bad = Buffer.from(
      JSON.stringify({ c: '2026-01-02T00:00:00.000Z', i: 'not-an-id' }),
    ).toString('base64url');
    expect(() => decodePostCursor(bad)).toThrowError(INVALID);
  });

  it('rejects a JSON payload with an invalid date', () => {
    const bad = Buffer.from(
      JSON.stringify({ c: 'not-a-date', i: '664f1c2b8f1b2c001f000001' }),
    ).toString('base64url');
    expect(() => decodePostCursor(bad)).toThrowError(INVALID);
  });

  it('rejects a JSON payload missing either field', () => {
    const bad = Buffer.from(JSON.stringify({ c: '2026-01-02T00:00:00.000Z' })).toString(
      'base64url',
    );
    expect(() => decodePostCursor(bad)).toThrowError(INVALID);
  });
});
