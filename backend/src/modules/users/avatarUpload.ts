import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { isSupportedImage } from './mediaStorage.js';

const MAX_SIZE_BYTES = env.AVATAR_MAX_SIZE_MB * 1024 * 1024;

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  // This is a cheap, early rejection based on the client-supplied
  // `Content-Type` header only — it is NOT the security boundary and must
  // never be relied on alone (that header is trivially spoofable). Multer
  // invokes `fileFilter` before the upload stream is read into memory, so
  // `file.buffer` isn't available here yet; the authoritative content-sniffed
  // (magic-byte) check runs against the fully-buffered file in
  // `user.service.ts#updateAvatar` before the file ever reaches Cloudinary.
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImage(file.mimetype)) {
      cb(new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
});
