import { AppError } from '../../errors/AppError.js';
import { communityRepository } from './community.repository.js';
import type { MemberRole } from './communityMember.model.js';
import { searchProvider } from '../search/typesense.js';
import { communityEventBus } from '../../realtime/communityEvents.js';
import { logger } from '../../config/logger.js';
import type { CommunityDoc } from './community.model.js';

export interface SafeCommunity {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar: { publicId: string; url: string; width: number; height: number } | null;
  visibility: string;
  ownerId: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityWithMembership extends SafeCommunity {
  isMember: boolean;
  role: MemberRole | null;
}

const COMMUNITY_INDEX = 'communities';

function toSafeCommunity(community: CommunityDoc): SafeCommunity {
  const avatar = community.avatar;
  return {
    id: community._id.toString(),
    name: community.name,
    slug: community.slug,
    description: community.description ?? '',
    avatar:
      avatar && typeof avatar.publicId === 'string' && avatar.publicId.length > 0
        ? {
            publicId: avatar.publicId,
            url: avatar.url ?? '',
            width: avatar.width ?? 0,
            height: avatar.height ?? 0,
          }
        : null,
    visibility: community.visibility,
    ownerId: community.ownerId.toString(),
    memberCount: community.memberCount,
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
  };
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const baseSlug = toSlug(base) || 'community';
  let candidate = baseSlug;
  let suffix = 1;
  for (;;) {
    const existing = await communityRepository.findBySlug(candidate);
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export const communityService = {
  async create(
    userId: string,
    input: { name: string; description?: string; visibility?: 'PUBLIC' | 'PRIVATE' },
  ) {
    const slug = await ensureUniqueSlug(input.name);
    const community = await communityRepository.create({
      name: input.name,
      slug,
      description: input.description ?? '',
      visibility: input.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
      ownerId: userId,
    });

    await communityRepository.addMember(community._id.toString(), userId, 'OWNER');
    await communityRepository.incrementMemberCount(community._id.toString(), 1);

    await searchProvider.createCollection({
      name: COMMUNITY_INDEX,
      defaultSortingField: 'createdAt',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'visibility', type: 'string', facet: true },
        { name: 'memberCount', type: 'int32', sort: true },
        { name: 'createdAt', type: 'int64', sort: true },
      ],
    });
    await searchProvider.upsertDocuments(COMMUNITY_INDEX, [toSearchDoc(community)]);

    return { community: toSafeCommunity(community), role: 'OWNER' as const };
  },

  async list(
    page: number,
    pageSize: number,
    query?: string,
  ): Promise<{ items: SafeCommunity[]; total: number; page: number; pageSize: number }> {
    if (query && query.trim().length > 0) {
      return this.search(query, page, pageSize);
    }
    const result = await communityRepository.findVisible(page, pageSize);
    return {
      items: result.items.map(toSafeCommunity),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },

  async search(
    query: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: SafeCommunity[]; total: number; page: number; pageSize: number }> {
    try {
      const result = await searchProvider.search(COMMUNITY_INDEX, {
        q: query,
        queryBy: 'name,description,slug',
        filterBy: 'visibility:PUBLIC',
        sortBy: 'memberCount:desc',
        page,
        perPage: pageSize,
      });
      const ids = result.hits.map((hit) => hit.document.id);
      const communities = await communityRepository.findByIds(ids);
      const byId = new Map(communities.map((c) => [c._id.toString(), toSafeCommunity(c)]));
      const items = ids.map((id) => byId.get(id)).filter((c): c is SafeCommunity => Boolean(c));
      return { items, total: result.found, page: result.page, pageSize: result.perPage };
    } catch (err) {
      logger.warn({ err }, 'community search failed; falling back to database listing');
      const result = await communityRepository.findVisible(page, pageSize);
      return {
        items: result.items.map(toSafeCommunity),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    }
  },

  async getByIdOrSlug(identifier: string, viewerId?: string): Promise<CommunityWithMembership> {
    const community = await communityRepository.findByIdOrSlug(identifier);
    if (!community || community.deletedAt) {
      throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'Community not found');
    }

    let role: MemberRole | null = null;
    if (viewerId) {
      const member = await communityRepository.findMember(community._id.toString(), viewerId);
      role = member?.role ?? null;
    }

    if (community.visibility === 'PRIVATE' && role === null) {
      throw new AppError(403, 'PRIVATE_COMMUNITY', 'This community is private');
    }

    return { ...toSafeCommunity(community), isMember: role !== null, role };
  },

  async update(
    userId: string,
    identifier: string,
    input: { name?: string; description?: string; visibility?: 'PUBLIC' | 'PRIVATE' },
  ): Promise<SafeCommunity> {
    const community = await this.getForAdmin(identifier, userId, 'UPDATE');
    const updates: {
      name?: string;
      description?: string;
      visibility?: 'PUBLIC' | 'PRIVATE';
      slug?: string;
    } = {};
    if (input.name !== undefined && input.name !== community.name) {
      updates.name = input.name;
      updates.slug = await ensureUniqueSlug(input.name);
    }
    if (input.description !== undefined) updates.description = input.description;
    if (input.visibility !== undefined) updates.visibility = input.visibility;

    const updated = await communityRepository.update(community.id, updates);
    if (!updated) {
      throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'Community not found');
    }
    await searchProvider.upsertDocuments(COMMUNITY_INDEX, [toSearchDoc(updated)]);
    return toSafeCommunity(updated);
  },

  async softDelete(userId: string, identifier: string): Promise<void> {
    const community = await this.getForAdmin(identifier, userId, 'DELETE');
    await communityRepository.softDelete(community.id);
    await searchProvider.deleteDocument(COMMUNITY_INDEX, community.id);
  },

  async join(userId: string, identifier: string): Promise<CommunityWithMembership> {
    const community = await this.getByIdOrSlug(identifier, userId);
    const existing = await communityRepository.findMember(community.id, userId);
    if (existing) {
      return { ...community, isMember: true, role: existing.role };
    }
    await communityRepository.addMember(community.id, userId, 'MEMBER');
    await communityRepository.incrementMemberCount(community.id, 1);
    communityEventBus.emitMemberJoined(community.id, userId, 'MEMBER');
    return { ...community, isMember: true, role: 'MEMBER', memberCount: community.memberCount + 1 };
  },

  async leave(userId: string, identifier: string): Promise<CommunityWithMembership> {
    const community = await this.getByIdOrSlug(identifier, userId);
    const existing = await communityRepository.findMember(community.id, userId);
    if (!existing) {
      return { ...community, isMember: false, role: null };
    }
    if (existing.role === 'OWNER') {
      throw new AppError(
        400,
        'OWNER_CANNOT_LEAVE',
        'The owner cannot leave; transfer ownership or delete the community',
      );
    }
    await communityRepository.removeMember(community.id, userId);
    await communityRepository.incrementMemberCount(community.id, -1);
    communityEventBus.emitMemberLeft(community.id, userId);
    return {
      ...community,
      isMember: false,
      role: null,
      memberCount: Math.max(0, community.memberCount - 1),
    };
  },

  async updateRole(
    actorId: string,
    identifier: string,
    targetUserId: string,
    role: MemberRole,
  ): Promise<void> {
    const community = await this.getForAdmin(identifier, actorId, 'UPDATE');
    if (role === 'OWNER') {
      throw new AppError(
        400,
        'CANNOT_ASSIGN_OWNER',
        'Ownership can only be transferred explicitly',
      );
    }
    const target = await communityRepository.findMember(community.id, targetUserId);
    if (!target) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this community');
    }
    if (target.role === 'OWNER') {
      throw new AppError(400, 'CANNOT_MODIFY_OWNER', 'The owner role cannot be changed');
    }
    await communityRepository.updateMemberRole(community.id, targetUserId, role);
    communityEventBus.emitRoleUpdated(community.id, targetUserId, role);
  },

  async listMembers(
    identifier: string,
    viewerId: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const community = await this.getByIdOrSlug(identifier, viewerId);
    const result = await communityRepository.listMembers(community.id, page, pageSize);
    return {
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },

  async getForAdmin(
    identifier: string,
    userId: string,
    action: 'UPDATE' | 'DELETE',
  ): Promise<SafeCommunity> {
    const community = await communityRepository.findByIdOrSlug(identifier);
    if (!community || community.deletedAt) {
      throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'Community not found');
    }
    const member = await communityRepository.findMember(community._id.toString(), userId);
    const canManage = member && (member.role === 'OWNER' || member.role === 'MODERATOR');
    if (!canManage) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to manage this community');
    }
    if (action === 'DELETE' && member.role !== 'OWNER') {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can delete this community');
    }
    return toSafeCommunity(community);
  },
};

function toSearchDoc(community: CommunityDoc) {
  return {
    id: community._id.toString(),
    name: community.name,
    description: community.description ?? '',
    slug: community.slug,
    visibility: community.visibility,
    memberCount: community.memberCount,
    createdAt: Math.floor(community.createdAt.getTime() / 1000),
  };
}
