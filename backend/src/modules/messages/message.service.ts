import { AppError } from '../../errors/AppError.js';
import { messageRepository, type StoredMessage } from './message.repository.js';
import { userRepository } from '../auth/user.repository.js';

export interface StoreMessageInput {
  senderId: string;
  recipientId: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export const messageService = {
  /**
   * Persists a 1:1 E2EE message. Ciphertext only — the server never sees
   * plaintext (CLAUDE.md §5); it stores and serves the encrypted body so both
   * participants can replay history on any of their devices.
   */
  async storeMessage(input: StoreMessageInput): Promise<StoredMessage> {
    if (input.senderId === input.recipientId) {
      throw new AppError(422, 'CANNOT_MESSAGE_SELF', 'You cannot message yourself');
    }
    const [sender, recipient] = await Promise.all([
      userRepository.findById(input.senderId),
      userRepository.findById(input.recipientId),
    ]);
    if (!sender || !recipient) {
      throw new AppError(422, 'UNKNOWN_USER', 'One or both participants do not exist');
    }
    const doc = await messageRepository.create(input);
    return {
      id: doc._id.toString(),
      senderId: doc.senderId.toString(),
      recipientId: doc.recipientId.toString(),
      ciphertext: doc.ciphertext,
      iv: doc.iv,
      timestamp: doc.timestamp,
    };
  },

  async listConversation(
    viewerId: string,
    otherUserId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: StoredMessage[]; total: number; page: number; pageSize: number }> {
    const other = await userRepository.findById(otherUserId);
    if (!other) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return messageRepository.listConversation(viewerId, otherUserId, page, pageSize);
  },
};
