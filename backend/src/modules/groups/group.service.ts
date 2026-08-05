import { AppError } from '../../errors/AppError.js';
import { groupRepository } from './group.repository.js';
import { userRepository } from '../auth/user.repository.js';
import { groupKeyService } from '../e2ee/groupKey.service.js';
import { groupEventBus } from '../../realtime/groupEvents.js';
import { GROUP_MAX_MEMBERS } from './group.model.js';
import type { GroupDoc } from './group.model.js';
import type { GroupMemberRole } from './groupMember.model.js';

export interface SafeGroup {
  id: string;
  name: string;
  avatar: { publicId: string; url: string; width: number; height: number } | null;
  ownerId: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupWithRole extends SafeGroup {
  role: GroupMemberRole;
}

function toSafeGroup(group: GroupDoc): SafeGroup {
  const avatar = group.avatar;
  return {
    id: group._id.toString(),
    name: group.name,
    avatar:
      avatar && typeof avatar.publicId === 'string' && avatar.publicId.length > 0
        ? {
            publicId: avatar.publicId,
            url: avatar.url ?? '',
            width: avatar.width ?? 0,
            height: avatar.height ?? 0,
          }
        : null,
    ownerId: group.ownerId.toString(),
    memberCount: group.memberCount,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

async function assertExistingUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const found = await userRepository.findByIds(userIds);
  const foundIds = new Set(found.map((u) => u._id.toString()));
  const unknown = userIds.filter((id) => !foundIds.has(id));
  if (unknown.length > 0) {
    throw new AppError(422, 'UNKNOWN_MEMBER', 'One or more members do not exist');
  }
}

export const groupService = {
  async create(
    ownerId: string,
    input: { name: string; memberIds?: string[] },
  ): Promise<GroupWithRole> {
    const invitees = [...new Set(input.memberIds ?? [])].filter((id) => id !== ownerId);
    if (invitees.length + 1 > GROUP_MAX_MEMBERS) {
      throw new AppError(
        422,
        'GROUP_TOO_LARGE',
        `A group cannot exceed ${GROUP_MAX_MEMBERS} members`,
      );
    }
    await assertExistingUsers(invitees);

    const group = await groupRepository.create({ name: input.name, ownerId });
    const groupId = group._id.toString();

    await groupRepository.addMember(groupId, ownerId, 'OWNER');
    for (const memberId of invitees) {
      await groupRepository.addMember(groupId, memberId, 'MEMBER');
    }
    const memberCount = invitees.length + 1;
    await groupRepository.incrementMemberCount(groupId, memberCount);

    for (const memberId of invitees) {
      groupEventBus.emitMemberJoined(groupId, memberId);
    }

    return { ...toSafeGroup(group), memberCount, role: 'OWNER' };
  },

  async listMine(userId: string): Promise<GroupWithRole[]> {
    const groups = await groupRepository.listGroupsForUser(userId);
    const rows = await Promise.all(
      groups.map(async (group) => {
        const member = await groupRepository.findMember(group._id.toString(), userId);
        return { ...toSafeGroup(group), role: (member?.role ?? 'MEMBER') as GroupMemberRole };
      }),
    );
    return rows;
  },

  async getForMember(userId: string, groupId: string): Promise<GroupWithRole> {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    const member = await groupRepository.findMember(groupId, userId);
    if (!member) {
      throw new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group');
    }
    return { ...toSafeGroup(group), role: member.role };
  },

  async listMembers(userId: string, groupId: string, page: number, pageSize: number) {
    // Membership is required to view the roster (private group).
    await this.getForMember(userId, groupId);
    return groupRepository.listMembers(groupId, page, pageSize);
  },

  async addMembers(
    actorId: string,
    groupId: string,
    memberIds: string[],
  ): Promise<{ added: string[] }> {
    const group = await this.assertOwner(actorId, groupId);
    const candidates = [...new Set(memberIds)].filter((id) => id !== group.ownerId);
    await assertExistingUsers(candidates);

    const added: string[] = [];
    for (const memberId of candidates) {
      const existing = await groupRepository.findMember(groupId, memberId);
      if (existing) {
        continue;
      }
      if (group.memberCount + added.length + 1 > GROUP_MAX_MEMBERS) {
        throw new AppError(
          422,
          'GROUP_TOO_LARGE',
          `A group cannot exceed ${GROUP_MAX_MEMBERS} members`,
        );
      }
      await groupRepository.addMember(groupId, memberId, 'MEMBER');
      added.push(memberId);
    }
    if (added.length > 0) {
      await groupRepository.incrementMemberCount(groupId, added.length);
      for (const memberId of added) {
        groupEventBus.emitMemberJoined(groupId, memberId);
      }
    }
    return { added };
  },

  async removeMember(actorId: string, groupId: string, targetUserId: string): Promise<void> {
    const group = await this.assertOwner(actorId, groupId);
    if (targetUserId === group.ownerId) {
      throw new AppError(400, 'CANNOT_REMOVE_OWNER', 'The owner cannot be removed');
    }
    const member = await groupRepository.findMember(groupId, targetUserId);
    if (!member) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this group');
    }
    await groupRepository.removeMember(groupId, targetUserId);
    await groupRepository.incrementMemberCount(groupId, -1);
    await groupKeyService.purgeMember(groupId, targetUserId);
    groupEventBus.emitMemberLeft(groupId, targetUserId);
  },

  async leave(userId: string, groupId: string): Promise<void> {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    const member = await groupRepository.findMember(groupId, userId);
    if (!member) {
      throw new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group');
    }
    if (member.role === 'OWNER') {
      throw new AppError(
        400,
        'OWNER_CANNOT_LEAVE',
        'The owner cannot leave; delete the group instead',
      );
    }
    await groupRepository.removeMember(groupId, userId);
    await groupRepository.incrementMemberCount(groupId, -1);
    await groupKeyService.purgeMember(groupId, userId);
    groupEventBus.emitMemberLeft(groupId, userId);
  },

  async softDelete(actorId: string, groupId: string): Promise<void> {
    await this.assertOwner(actorId, groupId);
    const memberIds = await groupRepository.listMemberIds(groupId);
    await groupRepository.softDelete(groupId);
    for (const memberId of memberIds) {
      await groupRepository.removeMember(groupId, memberId);
    }
    await groupKeyService.purgeGroup(groupId);
    groupEventBus.emitDeleted(groupId, memberIds);
  },

  async assertOwner(userId: string, groupId: string): Promise<SafeGroup> {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    if (group.ownerId.toString() !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the group owner can perform this action');
    }
    return toSafeGroup(group);
  },
};
