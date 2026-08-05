import type { QueryFilter } from 'mongoose';
import { UserModel, type UserDoc } from './user.model.js';

export interface CreateUserInput {
  email?: string;
  phone?: string;
  displayName: string;
  passwordHash: string;
}

export interface AvatarAsset {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

export interface SafeUser {
  id: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  displayName: string;
  bio: string;
  avatar: AvatarAsset | null;
  role: string;
  status: string;
  isVerified: boolean;
}

export function toSafeUser(user: UserDoc): SafeUser {
  const avatar = user.avatar;
  return {
    id: user._id.toString(),
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    bio: user.bio ?? '',
    avatar:
      avatar && typeof avatar.publicId === 'string' && avatar.publicId.length > 0
        ? {
            publicId: avatar.publicId,
            url: avatar.url ?? '',
            width: avatar.width ?? 0,
            height: avatar.height ?? 0,
          }
        : null,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
  };
}

export const userRepository = {
  async create(input: CreateUserInput): Promise<UserDoc> {
    return UserModel.create(input);
  },

  async findById(id: string): Promise<UserDoc | null> {
    return UserModel.findById(id);
  },

  async findOne(filter: QueryFilter<UserDoc>): Promise<UserDoc | null> {
    return UserModel.findOne(filter);
  },

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    const isEmail = identifier.includes('@');
    const filter: QueryFilter<UserDoc> = isEmail ? { email: identifier } : { phone: identifier };
    return UserModel.findOne(filter);
  },

  async findByIdentifierWithPassword(identifier: string): Promise<UserDoc | null> {
    const isEmail = identifier.includes('@');
    const filter: QueryFilter<UserDoc> = isEmail ? { email: identifier } : { phone: identifier };
    return UserModel.findOne(filter).select('+passwordHash');
  },

  async exists(identifier: string): Promise<boolean> {
    const isEmail = identifier.includes('@');
    const filter: QueryFilter<UserDoc> = isEmail ? { email: identifier } : { phone: identifier };
    const found = await UserModel.exists(filter);
    return found !== null;
  },

  async markVerified(id: string): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(id, { isVerified: true, status: 'VERIFIED' }, { new: true });
  },

  async findByIds(ids: string[]): Promise<UserDoc[]> {
    return UserModel.find({ _id: { $in: ids } });
  },

  async touchLastLogin(id: string): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { lastLoginAt: new Date() });
  },

  async updateProfile(
    id: string,
    updates: Partial<Pick<UserDoc, 'displayName' | 'bio'>>,
  ): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
  },

  async updateAvatar(id: string, avatar: AvatarAsset): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: { avatar } },
      { new: true, runValidators: true },
    );
  },
};
