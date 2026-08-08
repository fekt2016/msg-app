import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../errors/AppError.js';
import { channelRepository } from './channel.repository.js';
import { channelEventBus } from '../../realtime/channelEvents.js';
import type { ChannelRole } from './channelSubscriber.model.js';
import type { InviteRole } from './channelInvite.model.js';
import type { ChannelInviteDoc } from './channelInvite.model.js';
import type { ChannelDoc, ChannelVisibility } from './channel.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface SafeChannel {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar: { publicId: string; url: string; width: number; height: number } | null;
  visibility: ChannelVisibility;
  ownerId: string;
  subscriberCount: number;
  postCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelWithSubscription extends SafeChannel {
  isSubscribed: boolean;
  role: ChannelRole | null;
}

function toSafeChannel(channel: ChannelDoc): SafeChannel {
  const avatar = channel.avatar;
  return {
    id: channel._id.toString(),
    name: channel.name,
    slug: channel.slug,
    description: channel.description ?? '',
    avatar:
      avatar && typeof avatar.publicId === 'string' && avatar.publicId.length > 0
        ? {
            publicId: avatar.publicId,
            url: avatar.url ?? '',
            width: avatar.width ?? 0,
            height: avatar.height ?? 0,
          }
        : null,
    visibility: channel.visibility,
    ownerId: channel.ownerId.toString(),
    subscriberCount: channel.subscriberCount,
    postCount: channel.postCount,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
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
  const baseSlug = toSlug(base) || 'channel';
  let candidate = baseSlug;
  let suffix = 1;
  for (;;) {
    const existing = await channelRepository.findBySlug(candidate);
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export const channelService = {
  async create(
    userId: string,
    input: { name: string; description?: string; visibility?: 'PUBLIC' | 'PRIVATE' },
  ) {
    const slug = await ensureUniqueSlug(input.name);
    const channel = await channelRepository.create({
      name: input.name,
      slug,
      description: input.description ?? '',
      visibility: input.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
      ownerId: userId,
    });

    await channelRepository.addSubscriber(channel._id.toString(), userId, 'OWNER');
    await channelRepository.incrementSubscriberCount(channel._id.toString(), 1);

    return { channel: toSafeChannel(channel), role: 'OWNER' as const };
  },

  async list(
    page: number,
    pageSize: number,
    viewerId?: string,
  ): Promise<{ items: ChannelWithSubscription[]; total: number; page: number; pageSize: number }> {
    const result = await channelRepository.findVisible(page, pageSize);
    return enrichWithSubscription(result.items, viewerId, result);
  },

  async listMine(
    userId: string,
  ): Promise<{ items: ChannelWithSubscription[]; total: number; page: number; pageSize: number }> {
    const subscriptions = await channelRepository.listSubscriptionsForUser(userId);
    const channelIds = subscriptions.map((s) => s.channelId.toString());
    const channels = await channelRepository.findByIds(channelIds);
    const byId = new Map(channels.map((c) => [c._id.toString(), c]));
    const roleById = new Map(
      subscriptions
        .filter((s) => byId.has(s.channelId.toString()))
        .map((s) => [s.channelId.toString(), s.role]),
    );
    const items = [...byId.values()].map((channel) => ({
      ...toSafeChannel(channel),
      isSubscribed: true,
      role: roleById.get(channel._id.toString()) ?? ('SUBSCRIBER' as const),
    }));
    return { items, total: items.length, page: 1, pageSize: items.length };
  },

  async getByIdOrSlug(identifier: string, viewerId?: string): Promise<ChannelWithSubscription> {
    const channel = await this.getChannel(identifier, viewerId);
    return channel;
  },

  async update(
    userId: string,
    identifier: string,
    input: { name?: string; description?: string; visibility?: 'PUBLIC' | 'PRIVATE' },
  ): Promise<SafeChannel> {
    const channel = await this.getForAdmin(identifier, userId, 'UPDATE');
    const updates: {
      name?: string;
      description?: string;
      visibility?: 'PUBLIC' | 'PRIVATE';
      slug?: string;
    } = {};
    if (input.name !== undefined && input.name !== channel.name) {
      updates.name = input.name;
      updates.slug = await ensureUniqueSlug(input.name);
    }
    if (input.description !== undefined) updates.description = input.description;
    if (input.visibility !== undefined) updates.visibility = input.visibility;

    const updated = await channelRepository.update(channel.id, updates);
    if (!updated) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }
    return toSafeChannel(updated);
  },

  async softDelete(userId: string, identifier: string): Promise<void> {
    const channel = await this.getForAdmin(identifier, userId, 'DELETE');
    const subscriberIds = await channelRepository.listSubscriberIds(channel.id);
    await channelRepository.softDelete(channel.id);
    channelEventBus.emitDeleted(channel.id, subscriberIds);
  },

  async subscribe(userId: string, identifier: string): Promise<ChannelWithSubscription> {
    const channel = await this.getChannel(identifier, userId);
    if (channel.visibility === 'PRIVATE') {
      throw new AppError(
        403,
        'PRIVATE_CHANNEL',
        'This channel is private — join via an invite or a join request',
      );
    }
    const existing = await channelRepository.findSubscriber(channel.id, userId);
    if (existing) {
      return { ...channel, isSubscribed: true, role: existing.role };
    }
    await channelRepository.addSubscriber(channel.id, userId, 'SUBSCRIBER');
    await channelRepository.incrementSubscriberCount(channel.id, 1);
    channelEventBus.emitSubscriberJoined(channel.id, userId, 'SUBSCRIBER');
    return {
      ...channel,
      isSubscribed: true,
      role: 'SUBSCRIBER',
      subscriberCount: channel.subscriberCount + 1,
    };
  },

  async unsubscribe(userId: string, identifier: string): Promise<ChannelWithSubscription> {
    const channel = await this.getChannel(identifier, userId);
    const existing = await channelRepository.findSubscriber(channel.id, userId);
    if (!existing) {
      return { ...channel, isSubscribed: false, role: null };
    }
    if (existing.role === 'OWNER') {
      throw new AppError(
        400,
        'OWNER_CANNOT_UNSUBSCRIBE',
        'The owner cannot unsubscribe; transfer ownership or delete the channel',
      );
    }
    await channelRepository.removeSubscriber(channel.id, userId);
    await channelRepository.incrementSubscriberCount(channel.id, -1);
    channelEventBus.emitSubscriberLeft(channel.id, userId);
    return {
      ...channel,
      isSubscribed: false,
      role: null,
      subscriberCount: Math.max(0, channel.subscriberCount - 1),
    };
  },

  async updateSubscriberRole(
    actorId: string,
    identifier: string,
    targetUserId: string,
    role: ChannelRole,
  ): Promise<void> {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    if (role === 'OWNER') {
      throw new AppError(
        400,
        'CANNOT_ASSIGN_OWNER',
        'Ownership can only be transferred explicitly',
      );
    }
    const target = await channelRepository.findSubscriber(channel.id, targetUserId);
    if (!target) {
      throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'User is not a subscriber of this channel');
    }
    if (target.role === 'OWNER') {
      throw new AppError(400, 'CANNOT_MODIFY_OWNER', 'The owner role cannot be changed');
    }
    await channelRepository.updateSubscriberRole(channel.id, targetUserId, role);
    channelEventBus.emitSubscriberRole(channel.id, targetUserId, role);
  },

  async listSubscribers(
    identifier: string,
    viewerId: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const channel = await this.getChannel(identifier, viewerId);
    const result = await channelRepository.listSubscribers(channel.id, page, pageSize);
    return {
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },

  async createInvite(
    actorId: string,
    identifier: string,
    input: { role?: InviteRole; expiresInDays?: number; maxUses?: number },
  ) {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    const expiresInDays = Math.min(Math.max(input.expiresInDays ?? 7, 1), 30);
    const token = randomBytes(32).toString('base64url');
    const invite = await channelRepository.createInvite({
      channelId: channel.id,
      createdBy: actorId,
      tokenHash: sha256(token),
      role: input.role === 'ADMIN' ? 'ADMIN' : 'SUBSCRIBER',
      expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
      maxUses: Math.min(Math.max(input.maxUses ?? 1, 1), 1000),
    });
    return { token, invite: toSafeInvite(invite) };
  },

  async listInvites(actorId: string, identifier: string) {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    const invites = await channelRepository.listActiveInvites(channel.id);
    return { items: invites.map(toSafeInvite) };
  },

  async revokeInvite(actorId: string, identifier: string, inviteId: string): Promise<void> {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    const invite = await channelRepository.revokeInvite(inviteId);
    if (!invite || invite.channelId.toString() !== channel.id) {
      throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite not found');
    }
  },

  async previewInvite(token: string) {
    const invite = await this.assertValidInvite(token);
    const channel = await channelRepository.findById(invite.channelId.toString());
    if (!channel || channel.deletedAt) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }
    return {
      channelName: channel.name,
      channelSlug: channel.slug,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },

  async joinViaInvite(userId: string, token: string) {
    const invite = await this.assertValidInvite(token);
    const channel = await channelRepository.findById(invite.channelId.toString());
    if (!channel || channel.deletedAt) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }
    const channelId = channel._id.toString();
    const existing = await channelRepository.findSubscriber(channelId, userId);
    if (existing) {
      let upgraded = false;
      if (invite.role === 'ADMIN' && existing.role === 'SUBSCRIBER') {
        await channelRepository.updateSubscriberRole(channelId, userId, 'ADMIN');
        upgraded = true;
      }
      return {
        channel: toSafeChannel(channel),
        role: existing.role,
        joined: false,
        upgraded,
      };
    }
    await channelRepository.addSubscriber(channelId, userId, invite.role);
    await channelRepository.incrementSubscriberCount(channelId, 1);
    await channelRepository.incrementInviteUsed(invite._id.toString());
    channelEventBus.emitSubscriberJoined(channelId, userId, invite.role);
    return {
      channel: toSafeChannel(channel),
      role: invite.role,
      joined: true,
      upgraded: false,
    };
  },

  async createJoinRequest(userId: string, identifier: string) {
    const channel = await this.getChannelEntity(identifier);
    if (channel.visibility === 'PUBLIC') {
      throw new AppError(
        400,
        'PUBLIC_CHANNEL_OPEN',
        'This channel is public — subscribe directly instead',
      );
    }
    const channelId = channel._id.toString();
    const existing = await channelRepository.findSubscriber(channelId, userId);
    if (existing) {
      throw new AppError(409, 'ALREADY_SUBSCRIBED', 'You are already a subscriber of this channel');
    }
    const pending = await channelRepository.findLiveJoinRequest(channelId, userId);
    if (pending) {
      throw new AppError(409, 'REQUEST_PENDING', 'You already have a pending join request');
    }
    await channelRepository.createJoinRequest(channelId, userId);
  },

  async listJoinRequests(
    actorId: string,
    identifier: string,
    status: 'PENDING' | 'APPROVED' | 'DENIED',
    page: number,
    pageSize: number,
  ) {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    const result = await channelRepository.listJoinRequests(channel.id, status, page, pageSize);
    return {
      items: result.items.map(({ request, displayName, avatarUrl }) => ({
        userId: request.userId.toString(),
        role: request.role,
        status: request.status,
        createdAt: request.createdAt,
        decidedAt: request.decidedAt,
        decidedBy: request.decidedBy ? request.decidedBy.toString() : null,
        displayName,
        avatarUrl,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },

  async decideJoinRequest(
    actorId: string,
    identifier: string,
    targetUserId: string,
    action: 'APPROVE' | 'DENY',
  ) {
    const channel = await this.getForAdmin(identifier, actorId, 'UPDATE');
    const request = await channelRepository.findLiveJoinRequest(channel.id, targetUserId);
    if (!request) {
      throw new AppError(404, 'REQUEST_NOT_FOUND', 'No pending join request for this user');
    }
    if (action === 'APPROVE') {
      const existing = await channelRepository.findSubscriber(channel.id, targetUserId);
      if (existing) {
        throw new AppError(
          409,
          'ALREADY_SUBSCRIBED',
          'User is already a subscriber of this channel',
        );
      }
      await channelRepository.addSubscriber(channel.id, targetUserId, 'SUBSCRIBER');
      await channelRepository.incrementSubscriberCount(channel.id, 1);
      channelEventBus.emitSubscriberJoined(channel.id, targetUserId, 'SUBSCRIBER');
    }
    const status = action === 'APPROVE' ? 'APPROVED' : 'DENIED';
    await channelRepository.setJoinRequestStatus(channel.id, targetUserId, status, actorId);
  },

  /**
   * Fetches a channel without the S1 visibility gate. Only used by
   * request-to-join — the requester is by definition not (yet) a subscriber,
   * so `getChannel` would 403 them before they could even ask to join.
   */
  async getChannelEntity(identifier: string): Promise<ChannelDoc> {
    const channel = await channelRepository.findByIdOrSlug(identifier);
    if (!channel || channel.deletedAt) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }
    return channel;
  },

  async assertValidInvite(token: string): Promise<ChannelInviteDoc> {
    const invite = await channelRepository.findInviteByTokenHash(sha256(token));
    if (!invite) {
      throw new AppError(404, 'INVITE_INVALID', 'Invite not found or no longer valid');
    }
    if (invite.revokedAt) {
      throw new AppError(410, 'INVITE_GONE', 'This invite has been revoked');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new AppError(410, 'INVITE_GONE', 'This invite has expired');
    }
    if (invite.usedCount >= invite.maxUses) {
      throw new AppError(410, 'INVITE_GONE', 'This invite has been used up');
    }
    return invite;
  },

  /**
   * Shared S1 gate (Communities lesson): every read of a PRIVATE channel —
   * detail, subscriber list, and (from CH2) the post feed — goes through this
   * helper so no read path can bypass the visibility check. A PRIVATE channel
   * is only visible to a subscriber; everyone else gets 403, never content.
   */
  async getChannel(identifier: string, viewerId?: string): Promise<ChannelWithSubscription> {
    const channel = await channelRepository.findByIdOrSlug(identifier);
    if (!channel || channel.deletedAt) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }

    let role: ChannelRole | null = null;
    if (viewerId) {
      const subscriber = await channelRepository.findSubscriber(channel._id.toString(), viewerId);
      role = subscriber?.role ?? null;
    }

    if (channel.visibility === 'PRIVATE' && role === null) {
      throw new AppError(403, 'PRIVATE_CHANNEL', 'This channel is private');
    }

    return { ...toSafeChannel(channel), isSubscribed: role !== null, role };
  },

  async getForAdmin(
    identifier: string,
    userId: string,
    action: 'UPDATE' | 'DELETE',
  ): Promise<SafeChannel> {
    const channel = await channelRepository.findByIdOrSlug(identifier);
    if (!channel || channel.deletedAt) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }
    const subscriber = await channelRepository.findSubscriber(channel._id.toString(), userId);
    const canManage = subscriber && (subscriber.role === 'OWNER' || subscriber.role === 'ADMIN');
    if (!canManage) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to manage this channel');
    }
    if (action === 'DELETE' && subscriber!.role !== 'OWNER') {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can delete this channel');
    }
    return toSafeChannel(channel);
  },
};

async function enrichWithSubscription(
  channels: ChannelDoc[],
  viewerId: string | undefined,
  paginated: { total: number; page: number; pageSize: number },
): Promise<{ items: ChannelWithSubscription[]; total: number; page: number; pageSize: number }> {
  if (!viewerId || channels.length === 0) {
    return {
      ...paginated,
      items: channels.map((c) => ({ ...toSafeChannel(c), isSubscribed: false, role: null })),
    };
  }
  const subscriptions = await channelRepository.findSubscriptions(
    channels.map((c) => c._id.toString()),
    viewerId,
  );
  const roleByChannelId = new Map(subscriptions.map((s) => [s.channelId.toString(), s.role]));
  return {
    ...paginated,
    items: channels.map((c) => ({
      ...toSafeChannel(c),
      isSubscribed: roleByChannelId.has(c._id.toString()),
      role: roleByChannelId.get(c._id.toString()) ?? null,
    })),
  };
}

function toSafeInvite(invite: ChannelInviteDoc) {
  return {
    id: invite._id.toString(),
    channelId: invite.channelId.toString(),
    createdBy: invite.createdBy.toString(),
    role: invite.role,
    expiresAt: invite.expiresAt,
    usedCount: invite.usedCount,
    maxUses: invite.maxUses,
    revokedAt: invite.revokedAt,
    createdAt: invite.createdAt,
  };
}
