import { Types } from 'mongoose';
import { ChannelModel, type ChannelDoc, type ChannelVisibility } from './channel.model.js';
import {
  ChannelSubscriberModel,
  type ChannelRole,
  type ChannelSubscriberDoc,
} from './channelSubscriber.model.js';
import { userRepository } from '../auth/user.repository.js';

export interface CreateChannelInput {
  name: string;
  slug: string;
  description?: string;
  visibility: ChannelVisibility;
  ownerId: string;
}

export interface ChannelSubscriberRow {
  channelId: string;
  userId: string;
  role: ChannelRole;
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

function toSubscriberRow(
  subscriber: ChannelSubscriberDoc & { displayName?: string; avatarUrl?: string | null },
): ChannelSubscriberRow {
  return {
    channelId: subscriber.channelId.toString(),
    userId: subscriber.userId.toString(),
    role: subscriber.role,
    joinedAt: subscriber.joinedAt,
    displayName: subscriber.displayName ?? 'Unknown',
    avatarUrl: subscriber.avatarUrl ?? null,
  };
}

export const channelRepository = {
  async create(input: CreateChannelInput): Promise<ChannelDoc> {
    return ChannelModel.create(input);
  },

  async findById(id: string): Promise<ChannelDoc | null> {
    return ChannelModel.findById(id);
  },

  async findBySlug(slug: string): Promise<ChannelDoc | null> {
    return ChannelModel.findOne({ slug });
  },

  async findByIds(ids: string[]): Promise<ChannelDoc[]> {
    return ChannelModel.find({ _id: { $in: ids }, deletedAt: null });
  },

  async findByIdOrSlug(identifier: string): Promise<ChannelDoc | null> {
    const filter = isObjectId(identifier)
      ? { _id: identifier }
      : { slug: identifier.toLowerCase() };
    return ChannelModel.findOne(filter);
  },

  async findVisible(page: number, pageSize: number): Promise<Paginated<ChannelDoc>> {
    const filter = { visibility: 'PUBLIC' as const, deletedAt: null };
    const [items, total] = await Promise.all([
      ChannelModel.find(filter)
        .sort({ subscriberCount: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      ChannelModel.countDocuments(filter),
    ]);
    return { items, total, page, pageSize };
  },

  async update(
    id: string,
    updates: Partial<Pick<ChannelDoc, 'name' | 'slug' | 'description' | 'avatar' | 'visibility'>>,
  ): Promise<ChannelDoc | null> {
    return ChannelModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );
  },

  async softDelete(id: string): Promise<ChannelDoc | null> {
    return ChannelModel.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true });
  },

  async incrementSubscriberCount(id: string, delta: 1 | -1): Promise<void> {
    await ChannelModel.updateOne({ _id: id }, { $inc: { subscriberCount: delta } });
  },

  async findSubscriber(channelId: string, userId: string): Promise<ChannelSubscriberDoc | null> {
    return ChannelSubscriberModel.findOne({ channelId, userId });
  },

  async findSubscriptions(channelIds: string[], userId: string): Promise<ChannelSubscriberDoc[]> {
    if (channelIds.length === 0) {
      return [];
    }
    return ChannelSubscriberModel.find({ channelId: { $in: channelIds }, userId });
  },

  async addSubscriber(
    channelId: string,
    userId: string,
    role: ChannelRole,
  ): Promise<ChannelSubscriberDoc> {
    return ChannelSubscriberModel.create({ channelId, userId, role });
  },

  async removeSubscriber(channelId: string, userId: string): Promise<void> {
    await ChannelSubscriberModel.deleteOne({ channelId, userId });
  },

  async updateSubscriberRole(
    channelId: string,
    userId: string,
    role: ChannelRole,
  ): Promise<ChannelSubscriberDoc | null> {
    return ChannelSubscriberModel.findOneAndUpdate(
      { channelId, userId },
      { $set: { role } },
      { new: true, runValidators: true },
    );
  },

  async countSubscribers(channelId: string): Promise<number> {
    return ChannelSubscriberModel.countDocuments({ channelId });
  },

  async listSubscribers(
    channelId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<ChannelSubscriberRow>> {
    const [subscribers, total] = await Promise.all([
      ChannelSubscriberModel.find({ channelId })
        .sort({ role: 1, joinedAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      ChannelSubscriberModel.countDocuments({ channelId }),
    ]);

    const userIds = subscribers.map((s) => s.userId.toString());
    const found = await userRepository.findByIds(userIds);
    const users = new Map(found.map((u) => [u._id.toString(), u]));

    const items = subscribers.map((subscriber) => {
      const user = users.get(subscriber.userId.toString());
      return toSubscriberRow({
        ...subscriber.toObject(),
        displayName: user?.displayName,
        avatarUrl: user?.avatar?.url ?? null,
      });
    });

    return { items, total, page, pageSize };
  },

  async listSubscriptionsForUser(userId: string): Promise<ChannelSubscriberDoc[]> {
    return ChannelSubscriberModel.find({ userId });
  },
};

function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value) && value.length === 24;
}
