import { userRepository, toSafeUser, type SafeUser } from '../auth/user.repository.js';
import { userDirectoryRepository } from './user.repository.js';
import {
  isSupportedImage,
  mediaStorage,
  sniffImageMimeType,
  type UploadableFile,
} from './mediaStorage.js';
import { AppError } from '../../errors/AppError.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import type { UpdateProfileBody } from './user.validation.js';

export { normalizePhoneNumber };

export interface PaginatedUsers {
  items: SafeUser[];
  total: number;
  page: number;
  pageSize: number;
}

export const userService = {
  async getProfile(userId: string): Promise<SafeUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return toSafeUser(user);
  },

  async listChatUsers(userId: string, page: number, pageSize: number): Promise<PaginatedUsers> {
    const result = await userDirectoryRepository.listChatUsers(userId, page, pageSize);
    return {
      items: result.items.map(toSafeUser),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },

  async matchContacts(phoneNumbers: string[]): Promise<SafeUser[]> {
    const candidates = [...new Set(phoneNumbers.map(normalizePhoneNumber))].filter(
      (n) => n.length > 0,
    );
    if (candidates.length === 0) {
      return [];
    }
    const users = await userDirectoryRepository.findVerifiedByPhoneNumbers(candidates);
    return users.map(toSafeUser);
  },

  async updateProfile(userId: string, body: UpdateProfileBody): Promise<SafeUser> {
    const user = await userRepository.updateProfile(userId, body);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return toSafeUser(user);
  },

  async updateAvatar(userId: string, file: UploadableFile): Promise<SafeUser> {
    if (!isSupportedImage(file.mimetype)) {
      throw new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed');
    }

    // Authoritative check: sniff the real file bytes rather than trusting the
    // client-supplied Content-Type/mimetype header, which is trivially
    // spoofable (CLAUDE.md §11). This must pass before anything reaches
    // Cloudinary.
    if (!sniffImageMimeType(file.buffer)) {
      throw new AppError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed');
    }

    const current = await userRepository.findById(userId);
    if (!current) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const previousPublicId = current.avatar?.publicId;

    const asset = await mediaStorage.uploadAvatar(file);

    const updated = await userRepository.updateAvatar(userId, asset);
    if (!updated) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (previousPublicId) {
      await mediaStorage.deleteByPublicId(previousPublicId).catch(() => {
        // Best-effort cleanup — a failure here must not fail the request.
      });
    }

    return toSafeUser(updated);
  },
};
