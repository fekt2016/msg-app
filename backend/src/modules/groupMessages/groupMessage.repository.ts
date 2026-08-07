import { GroupMessageModel, type GroupMessageDoc } from './groupMessage.model.js';

export interface StoredGroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StoreGroupMessageInput {
  groupId: string;
  senderId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

function toStoredGroupMessage(doc: GroupMessageDoc): StoredGroupMessage {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId.toString(),
    senderId: doc.senderId.toString(),
    keyId: doc.keyId,
    ciphertext: doc.ciphertext,
    iv: doc.iv,
    timestamp: doc.timestamp,
  };
}

export const groupMessageRepository = {
  async create(input: StoreGroupMessageInput): Promise<GroupMessageDoc> {
    return GroupMessageModel.create(input);
  },

  /**
   * Lists the newest-first page of a group's history, scoped to messages the
   * caller is allowed to see. `since` is the caller's `group_members.joinedAt`:
   * per ADR 0004 (forward-only group history) a member never sees messages
   * created before they joined. Ordering and the cutoff both use the
   * server-assigned `createdAt`, never the forgeable client `timestamp`. Group
   * history is append-only (CLAUDE.md §9 exceptions), so members can replay the
   * thread from their join point.
   */
  async listByGroup(
    groupId: string,
    page: number,
    pageSize: number,
    since: Date,
  ): Promise<Paginated<StoredGroupMessage>> {
    const filter = { groupId, createdAt: { $gte: since } };
    const [docs, total] = await Promise.all([
      GroupMessageModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      GroupMessageModel.countDocuments(filter),
    ]);

    return {
      items: docs.map(toStoredGroupMessage),
      total,
      page,
      pageSize,
    };
  },
};
