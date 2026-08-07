import { AppError } from '../../errors/AppError.js';
import { groupMessageRepository, type StoredGroupMessage } from './groupMessage.repository.js';
import { groupRepository } from '../groups/group.repository.js';

export interface StoreGroupMessageInput {
  groupId: string;
  senderId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export const groupMessageService = {
  /**
   * Persists an E2EE group message. Ciphertext only — the server never holds
   * plaintext (CLAUDE.md §5). Gated on membership so a non-member's ciphertext
   * can never be stored even if the relay path were bypassed.
   */
  async storeMessage(input: StoreGroupMessageInput): Promise<StoredGroupMessage> {
    const member = await groupRepository.findMember(input.groupId, input.senderId);
    if (!member) {
      throw new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group');
    }
    const doc = await groupMessageRepository.create(input);
    return {
      id: doc._id.toString(),
      groupId: doc.groupId.toString(),
      senderId: doc.senderId.toString(),
      keyId: doc.keyId,
      ciphertext: doc.ciphertext,
      iv: doc.iv,
      timestamp: doc.timestamp,
    };
  },

  /**
   * Lists a group's message history, newest first, paginated. Only members can
   * read history (private group); the group must still exist (not soft-deleted).
   * Per ADR 0004 the history is scoped to the caller's `joinedAt` — a member
   * cannot read messages sent before they joined (forward-only). On rejoin the
   * membership row carries the latest `joinedAt`, so the window is the most
   * recent join.
   */
  async listGroupMessages(viewerId: string, groupId: string, page: number, pageSize: number) {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    const member = await groupRepository.findMember(groupId, viewerId);
    if (!member) {
      throw new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group');
    }
    return groupMessageRepository.listByGroup(groupId, page, pageSize, member.joinedAt);
  },
};
