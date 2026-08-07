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
   * Lists the newest-first page of a group's history. Group history is
   * append-only (CLAUDE.md §9 exceptions), so members can replay the thread.
   */
  async listByGroup(
    groupId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<StoredGroupMessage>> {
    const filter = { groupId };
    const [docs, total] = await Promise.all([
      GroupMessageModel.find(filter)
        .sort({ timestamp: -1, _id: -1 })
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
