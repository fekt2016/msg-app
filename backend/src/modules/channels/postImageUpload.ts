import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { isSupportedImage } from '../users/mediaStorage.js';

// Reuses the avatar size ceiling for now — a dedicated POST_IMAGE_MAX_SIZE_MB
// env var is a follow-up if post images need a larger budget than avatars.
const MAX_SIZE_BYTES = env.AVATAR_MAX_SIZE_MB * 1024 * 1024;

export const postImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  // Cheap early rejection on the client-supplied Content-Type header only —
  // NOT the security boundary. The authoritative magic-byte check runs on the
  // buffered file in channelPostService.addPostImage before Cloudinary.
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImage(file.mimetype)) {
      cb(new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
});
