import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => {
  const env = {
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    AVATAR_MAX_SIZE_MB: 5,
  };
  return { env };
});

vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(() => {
        throw new Error('should be replaced per-test');
      }),
      destroy: vi.fn(),
    },
  },
}));

import {
  buildMediaStorage,
  isSupportedImage,
  mediaStorage,
  sniffImageMimeType,
  sniffVideoMimeType,
  sniffStoryMedia,
} from './mediaStorage.js';

function ftyp(brand: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(brand, 'ascii'),
    Buffer.alloc(12),
  ]);
}
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const VALID_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

beforeEach(() => {
  vi.clearAllMocks();
  env.CLOUDINARY_CLOUD_NAME = '';
  env.CLOUDINARY_API_KEY = '';
  env.CLOUDINARY_API_SECRET = '';
});

describe('isSupportedImage', () => {
  it('accepts jpeg, png and webp', () => {
    expect(isSupportedImage('image/jpeg')).toBe(true);
    expect(isSupportedImage('image/png')).toBe(true);
    expect(isSupportedImage('image/webp')).toBe(true);
  });

  it('rejects other types', () => {
    expect(isSupportedImage('text/plain')).toBe(false);
    expect(isSupportedImage('image/gif')).toBe(false);
  });
});

describe('sniffVideoMimeType', () => {
  it('accepts common MP4 brands (isom, mp41, mp42, avc1, M4V )', () => {
    for (const brand of ['isom', 'mp41', 'mp42', 'avc1', 'M4V ']) {
      expect(sniffVideoMimeType(ftyp(brand))).toBe('video/mp4');
    }
  });

  it('accepts QuickTime (qt  ) and WebM (EBML)', () => {
    expect(sniffVideoMimeType(ftyp('qt  '))).toBe('video/quicktime');
    expect(sniffVideoMimeType(WEBM_HEADER)).toBe('video/webm');
  });

  it('rejects a still-image ISO-BMFF brand (heic) — fails closed, not video', () => {
    expect(sniffVideoMimeType(ftyp('heic'))).toBeNull();
    expect(sniffVideoMimeType(ftyp('avif'))).toBeNull();
  });

  it('rejects a spoofed/non-video payload', () => {
    expect(sniffVideoMimeType(Buffer.from('not a video at all, honest'))).toBeNull();
    expect(sniffVideoMimeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('sniffStoryMedia', () => {
  it('classifies images and videos, and rejects everything else', () => {
    expect(sniffStoryMedia(VALID_PNG)?.resourceType).toBe('IMAGE');
    expect(sniffStoryMedia(ftyp('mp41'))?.resourceType).toBe('VIDEO');
    expect(sniffStoryMedia(Buffer.from('nope'))).toBeNull();
  });
});

describe('sniffImageMimeType', () => {
  it('detects a genuine JPEG from its magic bytes', () => {
    expect(sniffImageMimeType(VALID_JPEG)).toBe('image/jpeg');
  });

  it('detects a genuine PNG from its magic bytes', () => {
    expect(sniffImageMimeType(VALID_PNG)).toBe('image/png');
  });

  it('detects a genuine WebP from its RIFF/WEBP magic bytes', () => {
    expect(sniffImageMimeType(VALID_WEBP)).toBe('image/webp');
  });

  it('returns null for a spoofed upload — plain text bytes claiming to be an image', () => {
    const spoofedBuffer = Buffer.from('this is not an image, just plain text pretending to be one');
    expect(sniffImageMimeType(spoofedBuffer)).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for a truncated/malformed signature', () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMimeType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe('mediaStorage (dev fallback)', () => {
  it('falls back to the logging provider when Cloudinary is not configured', async () => {
    const asset = await mediaStorage.uploadAvatar({
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: 'avatar.png',
    });

    expect(asset.publicId).toMatch(/^dev-/);
    expect(asset.url).toBe('');
  });

  it('does not delete when Cloudinary is not configured', async () => {
    await expect(mediaStorage.deleteByPublicId('dev-123')).resolves.toBeUndefined();
  });
});

describe('mediaStorage (Cloudinary)', () => {
  beforeEach(() => {
    env.CLOUDINARY_CLOUD_NAME = 'eaz';
    env.CLOUDINARY_API_KEY = 'key';
    env.CLOUDINARY_API_SECRET = 'secret';
  });

  it('uploads via Cloudinary and returns the asset', async () => {
    const storage = buildMediaStorage();
    const { v2: cloudinary } = await import('cloudinary');
    const uploader = cloudinary.uploader as unknown as {
      upload_stream: (
        options: unknown,
        cb: (error: unknown, result: unknown) => void,
      ) => { end: (data: unknown) => void };
      destroy: ReturnType<typeof vi.fn>;
    };

    uploader.upload_stream.mockImplementation((_options, cb) => {
      cb(null, {
        public_id: 'eaz/avatars/abc',
        secure_url: 'https://res.cloudinary.com/eaz/abc',
        width: 512,
        height: 512,
      });
      return { end: vi.fn() };
    });

    const asset = await storage.uploadAvatar({
      buffer: Buffer.from('image'),
      mimetype: 'image/jpeg',
      originalname: 'a.jpg',
    });

    expect(asset).toEqual({
      publicId: 'eaz/avatars/abc',
      url: 'https://res.cloudinary.com/eaz/abc',
      width: 512,
      height: 512,
    });
    expect(cloudinary.config).toHaveBeenCalledWith(
      expect.objectContaining({ cloud_name: 'eaz', api_key: 'key', api_secret: 'secret' }),
    );
  });

  it('maps a Cloudinary upload error to UPLOAD_FAILED', async () => {
    const storage = buildMediaStorage();
    const { v2: cloudinary } = await import('cloudinary');
    const uploader = cloudinary.uploader as unknown as {
      upload_stream: (options: unknown, cb: (error: unknown) => void) => { end: () => void };
    };

    uploader.upload_stream.mockImplementation((_options, cb) => {
      cb({ message: 'boom' }, null);
      return { end: vi.fn() };
    });

    await expect(
      storage.uploadAvatar({
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        originalname: 'a.png',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_FAILED', statusCode: 502 });
  });

  it('maps a missing result to UPLOAD_FAILED', async () => {
    const storage = buildMediaStorage();
    const { v2: cloudinary } = await import('cloudinary');
    const uploader = cloudinary.uploader as unknown as {
      upload_stream: (
        options: unknown,
        cb: (error: unknown, result: unknown) => void,
      ) => { end: () => void };
    };

    uploader.upload_stream.mockImplementation((_options, cb) => {
      cb(null, null);
      return { end: vi.fn() };
    });

    await expect(
      storage.uploadAvatar({
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        originalname: 'a.png',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
  });

  it('deletes an asset by public id', async () => {
    const storage = buildMediaStorage();
    const { v2: cloudinary } = await import('cloudinary');
    const uploader = cloudinary.uploader as unknown as { destroy: ReturnType<typeof vi.fn> };
    uploader.destroy.mockResolvedValue({ result: 'ok' });

    await storage.deleteByPublicId('eaz/avatars/abc');

    expect(uploader.destroy).toHaveBeenCalledWith('eaz/avatars/abc');
  });
});
