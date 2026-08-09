import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { isSupportedImage, isSupportedVideoMime } from '../users/mediaStorage.js';

const MAX_SIZE_BYTES = env.STORY_MEDIA_MAX_SIZE_MB * 1024 * 1024;

export const storyMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  // Cheap early rejection on the client-supplied Content-Type header only —
  // NOT the security boundary. The authoritative magic-byte sniff runs on the
  // buffered file in storyService.create before Cloudinary.
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImage(file.mimetype) && !isSupportedVideoMime(file.mimetype)) {
      cb(
        new AppError(
          422,
          'INVALID_FILE_TYPE',
          'Only JPEG, PNG, WebP images or MP4/MOV/WebM videos are allowed',
        ),
      );
      return;
    }
    cb(null, true);
  },
});
