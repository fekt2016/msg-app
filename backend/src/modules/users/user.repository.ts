import { UserModel, type UserDoc } from '../auth/user.model.js';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Read-only "who can I chat with / contact-match" queries for the Users
 * module. Kept separate from `modules/auth/user.repository.ts` (owned by the
 * `authentication` agent) — these are directory-listing concerns, not auth
 * concerns, even though both read the same `User` collection/model.
 */
export const userDirectoryRepository = {
  async listChatUsers(
    excludeUserId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<UserDoc>> {
    const filter = {
      _id: { $ne: excludeUserId },
      isVerified: true,
      deletedAt: null,
    };
    const [items, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ displayName: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      UserModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, pageSize };
  },

  async findVerifiedByPhoneNumbers(phoneNumbers: string[]): Promise<UserDoc[]> {
    return UserModel.find({
      phone: { $in: phoneNumbers },
      isVerified: true,
      deletedAt: null,
    })
      .lean()
      .exec();
  },
};
