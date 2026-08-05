import { ConversationMessageModel, type MessageDoc } from './message.model.js';

export interface StoredMessage {
  id: string;
  senderId: string;
  recipientId: string;
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

export interface StoreMessageInput {
  senderId: string;
  recipientId: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

function toStoredMessage(doc: MessageDoc): StoredMessage {
  return {
    id: doc._id.toString(),
    senderId: doc.senderId.toString(),
    recipientId: doc.recipientId.toString(),
    ciphertext: doc.ciphertext,
    iv: doc.iv,
    timestamp: doc.timestamp,
  };
}

export const messageRepository = {
  async create(input: StoreMessageInput): Promise<MessageDoc> {
    return ConversationMessageModel.create(input);
  },

  /**
   * Lists the newest-first page of the 1:1 conversation between `userA` and
   * `userB`. Messages are never soft-deleted — 1:1 history is append-only
   * (CLAUDE.md §9 exceptions), so the caller can always replay the thread.
   */
  async listConversation(
    userA: string,
    userB: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<StoredMessage>> {
    const filter = {
      $or: [
        { senderId: userA, recipientId: userB },
        { senderId: userB, recipientId: userA },
      ],
    };
    const [docs, total] = await Promise.all([
      ConversationMessageModel.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      ConversationMessageModel.countDocuments(filter),
    ]);

    return {
      items: docs.map(toStoredMessage),
      total,
      page,
      pageSize,
    };
  },
};
