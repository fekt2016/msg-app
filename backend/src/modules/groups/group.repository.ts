import { GroupModel, type GroupDoc } from './group.model.js';
import {
  GroupMemberModel,
  type GroupMemberDoc,
  type GroupMemberRole,
} from './groupMember.model.js';
import { userRepository } from '../auth/user.repository.js';

export interface CreateGroupInput {
  name: string;
  ownerId: string;
}

export interface GroupMemberRow {
  groupId: string;
  userId: string;
  role: GroupMemberRole;
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
  member: GroupMemberDoc & { displayName?: string; avatarUrl?: string | null },
): GroupMemberRow {
  return {
    groupId: member.groupId.toString(),
    userId: member.userId.toString(),
    role: member.role,
    joinedAt: member.joinedAt,
    displayName: member.displayName ?? 'Unknown',
    avatarUrl: member.avatarUrl ?? null,
  };
}

export const groupRepository = {
  async create(input: CreateGroupInput): Promise<GroupDoc> {
    return GroupModel.create(input);
  },

  async findById(id: string): Promise<GroupDoc | null> {
    return GroupModel.findOne({ _id: id, deletedAt: null });
  },

  async softDelete(id: string): Promise<GroupDoc | null> {
    return GroupModel.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true });
  },

  async incrementMemberCount(id: string, delta: number): Promise<void> {
    await GroupModel.updateOne({ _id: id }, { $inc: { memberCount: delta } });
  },

  async addMember(groupId: string, userId: string, role: GroupMemberRole): Promise<GroupMemberDoc> {
    return GroupMemberModel.create({ groupId, userId, role });
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await GroupMemberModel.deleteOne({ groupId, userId });
  },

  async findMember(groupId: string, userId: string): Promise<GroupMemberDoc | null> {
    return GroupMemberModel.findOne({ groupId, userId });
  },

  /**
   * Authoritative membership check for a group — the single source of truth for
   * both the E2EE sender-key authorization (`groupKeyService`) and the realtime
   * room-join gate. `false` for a soft-deleted group's would-be members is not
   * enforced here (membership rows are removed on delete); callers that need the
   * group to still exist should load it separately.
   */
  async isMember(groupId: string, userId: string): Promise<boolean> {
    const doc = await GroupMemberModel.findOne({ groupId, userId }).select('_id').lean().exec();
    return doc !== null;
  },

  async listMemberIds(groupId: string): Promise<string[]> {
    const docs = await GroupMemberModel.find({ groupId }).select('userId').lean().exec();
    return docs.map((d) => d.userId.toString());
  },

  async listGroupsForUser(userId: string): Promise<GroupDoc[]> {
    const memberships = await GroupMemberModel.find({ userId }).select('groupId').lean().exec();
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) {
      return [];
    }
    return GroupModel.find({ _id: { $in: groupIds }, deletedAt: null }).sort({ updatedAt: -1 });
  },

  async listMembers(
    groupId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<GroupMemberRow>> {
    const [members, total] = await Promise.all([
      GroupMemberModel.find({ groupId })
        .sort({ role: 1, joinedAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      GroupMemberModel.countDocuments({ groupId }),
    ]);

    const userIds = members.map((m) => m.userId.toString());
    const users = await userRepository.findByIds(userIds);
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    const items = members.map((member) => {
      const user = byId.get(member.userId.toString());
      return toMemberRow({
        ...member.toObject(),
        displayName: user?.displayName,
        avatarUrl: user?.avatar?.url ?? null,
      });
    });

    return { items, total, page, pageSize };
  },
};
