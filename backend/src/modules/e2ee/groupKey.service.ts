import { AppError } from '../../errors/AppError.js';
import { logger } from '../../config/logger.js';
import { groupSenderKeyRepository } from './groupSenderKey.repository.js';
import type { SenderKeyEnvelopeBody } from './groupKey.validation.js';
import { groupRepository } from '../groups/group.repository.js';

export interface SenderKeyEnvelopeOutput {
  recipientId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  createdAt: Date;
}

export interface SenderKeySummary {
  senderId: string;
  keyId: number;
  updatedAt: Date;
}

export const groupKeyService = {
  /**
   * Stores a member's own sender-key envelopes for a group. Each envelope is the
   * sender key (Signal-style Sender Key) encrypted pairwise (AES-GCM over an ECDH
   * shared secret) for a single recipient. The server stores ciphertext only and
   * never sees the sender key in plaintext.
   *
   * The authenticated user is always the sender of their own key — envelopes
   * claiming another sender are rejected at the controller boundary.
   *
   * Authorization: the caller must be a member of the group, and every recipient
   * they address must be a member too. Membership is resolved against the
   * authoritative `group_members` collection (`groupRepository`), so `groupId` is
   * a real Group `_id` — this closes the former bootstrap/TOCTOU gap where a
   * brand-new group had no membership source of truth and its first sender was
   * allowed through unchecked. A non-member is rejected before any key is stored,
   * and a sender key is never distributed to anyone outside the group.
   */
  async uploadSenderKeys(
    groupId: string,
    senderId: string,
    envelopes: SenderKeyEnvelopeBody[],
  ): Promise<SenderKeyEnvelopeOutput[]> {
    const memberIds = new Set(await groupRepository.listMemberIds(groupId));
    if (!memberIds.has(senderId)) {
      throw new AppError(403, 'NOT_GROUP_MEMBER', 'You are not a member of this group');
    }

    const deduped = new Map<string, SenderKeyEnvelopeBody>();
    for (const envelope of envelopes) {
      if (envelope.recipientId === senderId) {
        throw new AppError(
          422,
          'SELF_RECIPIENT',
          'A sender key envelope cannot target the sender themselves',
        );
      }
      deduped.set(envelope.recipientId, envelope);
    }

    const nonMember = [...deduped.keys()].find((id) => !memberIds.has(id));
    if (nonMember) {
      throw new AppError(
        422,
        'UNKNOWN_RECIPIENT',
        'One or more recipients are not members of this group',
      );
    }

    const recipientIds = [...deduped.keys()];
    await groupSenderKeyRepository.upsertEnvelopes(groupId, senderId, [...deduped.values()]);

    logger.info(
      { groupId, senderId, count: recipientIds.length },
      'Group sender-key envelopes stored',
    );
    return [...deduped.values()].map((e) => ({
      recipientId: e.recipientId,
      keyId: e.keyId,
      ciphertext: e.ciphertext,
      iv: e.iv,
      createdAt: new Date(),
    }));
  },

  /**
   * Returns the envelope addressed to the given recipient (the caller). A caller
   * can only ever receive sender keys that were explicitly encrypted for them.
   */
  async getSenderKey(
    groupId: string,
    senderId: string,
    recipientId: string,
  ): Promise<SenderKeyEnvelopeOutput> {
    const envelope = await groupSenderKeyRepository.findEnvelopeForRecipient(
      groupId,
      senderId,
      recipientId,
    );
    if (!envelope) {
      throw new AppError(404, 'SENDER_KEY_NOT_FOUND', 'No sender key envelope for this recipient');
    }
    return envelope;
  },

  async listSenderKeys(groupId: string, recipientId: string): Promise<SenderKeySummary[]> {
    return groupSenderKeyRepository.listSendersForRecipient(groupId, recipientId);
  },

  async deleteSenderKey(groupId: string, senderId: string): Promise<void> {
    await groupSenderKeyRepository.deleteSenderKey(groupId, senderId);
    logger.info({ groupId, senderId }, 'Group sender key deleted');
  },
};
