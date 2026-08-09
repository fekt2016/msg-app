import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../errors/AppError.js';
import type { AvatarAsset } from '../auth/user.repository.js';

export interface UploadableFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface PostImageAsset {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

export interface StoryMediaAsset {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  resourceType: 'IMAGE' | 'VIDEO';
  durationMs?: number;
}

export interface MediaStorage {
  uploadAvatar(file: UploadableFile): Promise<AvatarAsset>;
  uploadPostImage(file: UploadableFile): Promise<PostImageAsset>;
  uploadStoryMedia(file: UploadableFile): Promise<StoryMediaAsset>;
  deleteByPublicId(publicId: string): Promise<void>;
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isSupportedImage(mimetype: string): boolean {
  return SUPPORTED_IMAGE_TYPES.has(mimetype);
}

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Magic-byte (content-sniffing) signatures for the three supported image
 * types. `multer`'s memoryStorage only makes the full file buffer available
 * once the upload stream has been fully consumed (i.e. after `fileFilter`
 * has already run), so this check runs against the assembled buffer in the
 * service layer rather than in `avatarUpload.ts`'s `fileFilter` — see
 * `user.service.ts#updateAvatar`. It is the authoritative type check; the
 * `Content-Type`/`mimetype` header is client-supplied and never trusted
 * alone (CLAUDE.md §11).
 */
const MAGIC_BYTE_SIGNATURES: Record<SupportedImageMimeType, (buffer: Buffer) => boolean> = {
  'image/jpeg': (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) =>
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a,
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP',
};

/**
 * Detects the actual image type from the file's magic bytes, ignoring the
 * client-supplied `Content-Type` entirely. Returns `null` when the bytes
 * don't match any supported signature (including a spoofed header on a
 * non-image or malformed payload).
 */
export function sniffImageMimeType(buffer: Buffer): SupportedImageMimeType | null {
  for (const mimetype of Object.keys(MAGIC_BYTE_SIGNATURES) as SupportedImageMimeType[]) {
    if (MAGIC_BYTE_SIGNATURES[mimetype](buffer)) {
      return mimetype;
    }
  }
  return null;
}

export const SUPPORTED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export type SupportedVideoMimeType = (typeof SUPPORTED_VIDEO_MIME_TYPES)[number];

export function isSupportedVideoMime(mimetype: string): mimetype is SupportedVideoMimeType {
  return (SUPPORTED_VIDEO_MIME_TYPES as readonly string[]).includes(mimetype);
}

/**
 * ISO Base Media File Format (MP4/MOV) video major brands. An explicit allowlist
 * (fail-closed — a `ftyp` box is still required) but broad enough to accept the
 * brands real-world encoders emit. Deliberately EXCLUDES image/audio `ftyp`
 * brands (`heic`, `mif1`, `avif`, `M4A `) so a still-image or audio container in
 * an ISO-BMFF wrapper is never accepted as video.
 */
const MP4_VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'mp71',
  'avc1',
  'mmp4',
  'M4V ',
  'dash',
  'MSNV',
  '3gp4',
  '3gp5',
]);

/**
 * Detects the actual video type from the file's magic bytes, ignoring the
 * client-supplied `Content-Type`. Returns `null` when the bytes don't match any
 * supported signature (including a spoofed header on a non-video payload). The
 * authoritative type check for story media; `Content-Type` is never trusted
 * alone (CLAUDE.md §11).
 */
export function sniffVideoMimeType(buffer: Buffer): SupportedVideoMimeType | null {
  // WebM (and Matroska) share the EBML header. Cloudinary is authoritative on
  // the stored resource type, so treating a rare MKV as webm here is harmless.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }
  // ISO-BMFF: require the `ftyp` box (fail-closed), then a known video brand.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'qt  ') return 'video/quicktime';
    if (MP4_VIDEO_BRANDS.has(brand)) return 'video/mp4';
  }
  return null;
}

/**
 * Detects whether a buffer is a supported image or video, returning the
 * server-detected media resource type. The authoritative gate for story media.
 */
export function sniffStoryMedia(buffer: Buffer): {
  resourceType: 'IMAGE' | 'VIDEO';
  mimetype: SupportedImageMimeType | SupportedVideoMimeType;
} | null {
  const image = sniffImageMimeType(buffer);
  if (image) {
    return { resourceType: 'IMAGE', mimetype: image };
  }
  const video = sniffVideoMimeType(buffer);
  if (video) {
    return { resourceType: 'VIDEO', mimetype: video };
  }
  return null;
}

/**
 * Uploads avatars to Cloudinary (secure, transient, resize to a square).
 * Uses `cloudinary.v2.uploader.upload_stream` via the callback API wrapped
 * in a Promise so we can validate the result and surface provider errors as
 * AppErrors.
 */
class CloudinaryMediaStorage implements MediaStorage {
  async uploadAvatar(file: UploadableFile): Promise<AvatarAsset> {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new AppError(
        500,
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }

    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });

    const asset = await new Promise<AvatarAsset>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'eaz-community/avatars',
          overwrite: true,
          transformation: [{ width: 512, height: 512, crop: 'fill' }],
        },
        (error, result) => {
          if (error) {
            reject(
              new AppError(502, 'UPLOAD_FAILED', 'Image upload failed', {
                details: [error.message],
              }),
            );
            return;
          }
          if (!result || !result.public_id) {
            reject(new AppError(502, 'UPLOAD_FAILED', 'Image upload returned no result'));
            return;
          }
          resolve({
            publicId: result.public_id,
            url: result.secure_url,
            width: result.width ?? 512,
            height: result.height ?? 512,
          });
        },
      );
      stream.on('error', (error: Error) => {
        reject(
          new AppError(502, 'UPLOAD_FAILED', 'Image upload stream failed', {
            details: [error.message],
          }),
        );
      });
      stream.end(file.buffer);
    });

    logger.info({ publicId: asset.publicId }, 'Avatar uploaded to Cloudinary');
    return asset;
  }

  /**
   * Uploads channel-post images to Cloudinary. Unlike `uploadAvatar` there is
   * no square crop — only a width cap so delivery stays light; aspect ratio is
   * preserved. Folder `eaz-community/channel-posts`.
   */
  async uploadPostImage(file: UploadableFile): Promise<PostImageAsset> {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new AppError(
        500,
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }

    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });

    const asset = await new Promise<PostImageAsset>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'eaz-community/channel-posts',
          overwrite: false,
          transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) {
            reject(
              new AppError(502, 'UPLOAD_FAILED', 'Image upload failed', {
                details: [error.message],
              }),
            );
            return;
          }
          if (!result || !result.public_id) {
            reject(new AppError(502, 'UPLOAD_FAILED', 'Image upload returned no result'));
            return;
          }
          resolve({
            publicId: result.public_id,
            url: result.secure_url,
            width: result.width ?? 1600,
            height: result.height ?? 900,
          });
        },
      );
      stream.on('error', (error: Error) => {
        reject(
          new AppError(502, 'UPLOAD_FAILED', 'Image upload stream failed', {
            details: [error.message],
          }),
        );
      });
      stream.end(file.buffer);
    });

    logger.info({ publicId: asset.publicId }, 'Post image uploaded to Cloudinary');
    return asset;
  }

  /**
   * Uploads story media (image or video) to Cloudinary. `resource_type: 'auto'`
   * lets Cloudinary detect image vs. video; the width cap keeps delivery light
   * and preserves aspect ratio. Folder `eaz-community/stories`.
   */
  async uploadStoryMedia(file: UploadableFile): Promise<StoryMediaAsset> {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new AppError(
        500,
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }

    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });

    const asset = await new Promise<StoryMediaAsset>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'eaz-community/stories',
          resource_type: 'auto',
          overwrite: false,
          transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) {
            reject(
              new AppError(502, 'UPLOAD_FAILED', 'Story media upload failed', {
                details: [error.message],
              }),
            );
            return;
          }
          if (!result || !result.public_id) {
            reject(new AppError(502, 'UPLOAD_FAILED', 'Story media upload returned no result'));
            return;
          }
          const isVideo = result.resource_type === 'video';
          resolve({
            publicId: result.public_id,
            url: result.secure_url,
            width: result.width ?? 0,
            height: result.height ?? 0,
            resourceType: isVideo ? 'VIDEO' : 'IMAGE',
            // Cloudinary reports `duration` in seconds; the field is stored in ms.
            durationMs:
              isVideo && typeof result.duration === 'number'
                ? Math.round(result.duration * 1000)
                : undefined,
          });
        },
      );
      stream.on('error', (error: Error) => {
        reject(
          new AppError(502, 'UPLOAD_FAILED', 'Story media upload stream failed', {
            details: [error.message],
          }),
        );
      });
      stream.end(file.buffer);
    });

    logger.info(
      { publicId: asset.publicId, resourceType: asset.resourceType },
      'Story media uploaded to Cloudinary',
    );
    return asset;
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    const { v2: cloudinary } = await import('cloudinary');
    await cloudinary.uploader.destroy(publicId);
  }
}

/**
 * Dev/test fallback used when Cloudinary credentials are absent (mirrors the
 * logging OTP provider). Never returns a usable URL — the stored avatar is
 * marked with a placeholder so callers can tell no real asset exists.
 */
class LoggingMediaStorage implements MediaStorage {
  async uploadAvatar(file: UploadableFile): Promise<AvatarAsset> {
    logger.info(
      { name: file.originalname, size: file.buffer.length, type: file.mimetype },
      '[STORAGE] Avatar upload skipped — Cloudinary not configured',
    );
    return {
      publicId: `dev-${Date.now()}`,
      url: '',
      width: 0,
      height: 0,
    };
  }

  async uploadPostImage(file: UploadableFile): Promise<PostImageAsset> {
    logger.info(
      { name: file.originalname, size: file.buffer.length, type: file.mimetype },
      '[STORAGE] Post image upload skipped — Cloudinary not configured',
    );
    return {
      publicId: `dev-${Date.now()}`,
      url: '',
      width: 0,
      height: 0,
    };
  }

  async uploadStoryMedia(file: UploadableFile): Promise<StoryMediaAsset> {
    logger.info(
      { name: file.originalname, size: file.buffer.length, type: file.mimetype },
      '[STORAGE] Story media upload skipped — Cloudinary not configured',
    );
    return {
      publicId: `dev-${Date.now()}`,
      url: '',
      width: 0,
      height: 0,
      resourceType: 'IMAGE',
    };
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    logger.info({ publicId }, '[STORAGE] Avatar delete skipped — Cloudinary not configured');
  }
}

export function buildMediaStorage(): MediaStorage {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return new CloudinaryMediaStorage();
  }
  return new LoggingMediaStorage();
}

export const mediaStorage: MediaStorage = buildMediaStorage();
