import {
  GroupSenderKeyModel,
  type GroupSenderKeyDoc,
  type SenderKeyEnvelope,
} from './groupSenderKey.model.js';

export interface SenderKeyEnvelopeRecord {
  recipientId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  createdAt: Date;
}

export const groupSenderKeyRepository = {
  async find(groupId: string, senderId: string): Promise<GroupSenderKeyDoc | null> {
    return GroupSenderKeyModel.findOne({ groupId, senderId }).exec();
  },

  async upsertEnvelopes(
    groupId: string,
    senderId: string,
    envelopes: SenderKeyEnvelope[],
  ): Promise<GroupSenderKeyDoc> {
    const recipientIds = envelopes.map((e) => e.recipientId);
    const existing = await GroupSenderKeyModel.findOne({ groupId, senderId }).exec();

    if (existing) {
      const stored = existing.envelopes
        .filter((e) => !recipientIds.includes(e.recipientId))
        .map((e) => ({
          recipientId: e.recipientId,
          keyId: e.keyId,
          ciphertext: e.ciphertext,
          iv: e.iv,
          createdAt: e.createdAt ?? new Date(),
        }));
      const incoming = envelopes.map((e) => ({
        recipientId: e.recipientId,
        keyId: e.keyId,
        ciphertext: e.ciphertext,
        iv: e.iv,
        createdAt: e.createdAt ?? new Date(),
      }));
      const merged = stored.concat(incoming);
      const updated = await GroupSenderKeyModel.findOneAndUpdate(
        { groupId, senderId },
        { $set: { envelopes: merged } },
        { new: true },
      ).exec();
      if (updated) {
        return updated;
      }
    }

    return GroupSenderKeyModel.findOneAndUpdate(
      { groupId, senderId },
      { $setOnInsert: { envelopes }, groupId, senderId },
      { upsert: true, new: true },
    ).exec();
  },

  async findEnvelopeForRecipient(
    groupId: string,
    senderId: string,
    recipientId: string,
  ): Promise<SenderKeyEnvelopeRecord | null> {
    const doc = await GroupSenderKeyModel.findOne({ groupId, senderId }).exec();
    if (!doc) {
      return null;
    }
    const envelope = doc.envelopes.find((e) => e.recipientId === recipientId);
    if (!envelope) {
      return null;
    }
    return {
      recipientId: envelope.recipientId,
      keyId: envelope.keyId,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      createdAt: envelope.createdAt ?? new Date(),
    };
  },

  async listSendersForRecipient(
    groupId: string,
    recipientId: string,
  ): Promise<Array<{ senderId: string; keyId: number; updatedAt: Date }>> {
    const docs = await GroupSenderKeyModel.find({
      groupId,
      'envelopes.recipientId': recipientId,
    })
      .select('senderId envelopes updatedAt')
      .exec();
    return docs
      .map((doc) => {
        const envelope = doc.envelopes.find((e) => e.recipientId === recipientId);
        if (!envelope) {
          return null;
        }
        return {
          senderId: doc.senderId.toString(),
          keyId: envelope.keyId,
          updatedAt: doc.updatedAt,
        };
      })
      .filter(
        (item): item is { senderId: string; keyId: number; updatedAt: Date } => item !== null,
      );
  },

  async deleteSenderKey(groupId: string, senderId: string): Promise<void> {
    await GroupSenderKeyModel.deleteOne({ groupId, senderId }).exec();
  },

  async deleteByGroup(groupId: string): Promise<void> {
    await GroupSenderKeyModel.deleteMany({ groupId }).exec();
  },
};
