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

export interface MediaStorage {
  uploadAvatar(file: UploadableFile): Promise<AvatarAsset>;
  uploadPostImage(file: UploadableFile): Promise<PostImageAsset>;
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
