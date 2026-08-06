import { Types } from 'mongoose';
import { CommunityModel, type CommunityDoc } from './community.model.js';
import {
  CommunityMemberModel,
  type CommunityMemberDoc,
  type MemberRole,
} from './communityMember.model.js';
import { userRepository } from '../auth/user.repository.js';

export interface CreateCommunityInput {
  name: string;
  slug: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  ownerId: string;
}

export interface CommunityMemberRow {
  communityId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  displayName: string;
  avatarUrl: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function toMemberRow(
  member: CommunityMemberDoc & { displayName?: string; avatarUrl?: string | null },
): CommunityMemberRow {
  return {
    communityId: member.communityId.toString(),
    userId: member.userId.toString(),
    role: member.role,
    joinedAt: member.joinedAt,
    displayName: member.displayName ?? 'Unknown',
    avatarUrl: member.avatarUrl ?? null,
  };
}

export const communityRepository = {
  async create(input: CreateCommunityInput): Promise<CommunityDoc> {
    return CommunityModel.create(input);
  },

  async findById(id: string): Promise<CommunityDoc | null> {
    return CommunityModel.findById(id);
  },

  async findBySlug(slug: string): Promise<CommunityDoc | null> {
    return CommunityModel.findOne({ slug });
  },

  async findByIds(ids: string[]): Promise<CommunityDoc[]> {
    return CommunityModel.find({ _id: { $in: ids }, deletedAt: null });
  },

  async findByIdOrSlug(identifier: string): Promise<CommunityDoc | null> {
    const filter = isObjectId(identifier)
      ? { _id: identifier }
      : { slug: identifier.toLowerCase() };
    return CommunityModel.findOne(filter);
  },

  async findVisible(page: number, pageSize: number): Promise<Paginated<CommunityDoc>> {
    const filter = { visibility: 'PUBLIC' as const, deletedAt: null };
    const [items, total] = await Promise.all([
      CommunityModel.find(filter)
        .sort({ memberCount: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      CommunityModel.countDocuments(filter),
    ]);
    return { items, total, page, pageSize };
  },

  async update(
    id: string,
    updates: Partial<Pick<CommunityDoc, 'name' | 'slug' | 'description' | 'avatar' | 'visibility'>>,
  ): Promise<CommunityDoc | null> {
    return CommunityModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );
  },

  async softDelete(id: string): Promise<CommunityDoc | null> {
    return CommunityModel.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true });
  },

  async incrementMemberCount(id: string, delta: 1 | -1): Promise<void> {
    await CommunityModel.updateOne({ _id: id }, { $inc: { memberCount: delta } });
  },

  async findMember(communityId: string, userId: string): Promise<CommunityMemberDoc | null> {
    return CommunityMemberModel.findOne({ communityId, userId });
  },

  async addMember(
    communityId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CommunityMemberDoc> {
    return CommunityMemberModel.create({ communityId, userId, role });
  },

  async removeMember(communityId: string, userId: string): Promise<void> {
    await CommunityMemberModel.deleteOne({ communityId, userId });
  },

  async updateMemberRole(
    communityId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CommunityMemberDoc | null> {
    return CommunityMemberModel.findOneAndUpdate(
      { communityId, userId },
      { $set: { role } },
      { new: true, runValidators: true },
    );
  },

  async countMembers(communityId: string): Promise<number> {
    return CommunityMemberModel.countDocuments({ communityId });
  },

  async listMembers(
    communityId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<CommunityMemberRow>> {
    const [members, total] = await Promise.all([
      CommunityMemberModel.find({ communityId })
        .sort({ role: 1, joinedAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      CommunityMemberModel.countDocuments({ communityId }),
    ]);

    const userIds = members.map((m) => m.userId.toString());
    const found = await userRepository.findByIds(userIds);
    const users = new Map(found.map((u) => [u._id.toString(), u]));

    const items = members.map((member) => {
      const user = users.get(member.userId.toString());
      return toMemberRow({
        ...member.toObject(),
        displayName: user?.displayName,
        avatarUrl: user?.avatar?.url ?? null,
      });
    });

    return { items, total, page, pageSize };
  },

  async listMembershipsForUser(userId: string): Promise<CommunityMemberDoc[]> {
    return CommunityMemberModel.find({ userId });
  },
};

function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value) && value.length === 24;
}
