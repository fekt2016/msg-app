import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export interface SenderKeyEnvelope {
  recipientId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  createdAt?: Date;
}

export const GROUP_SENDER_KEY_MAX_ENVELOPES = 500;
export const GROUP_ID_MAX_LENGTH = 128;

const senderKeyEnvelopeSchema = new Schema<SenderKeyEnvelope>(
  {
    recipientId: { type: String, required: true },
    keyId: { type: Number, required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupSenderKeySchema = new Schema(
  {
    groupId: { type: String, required: true, trim: true, maxlength: GROUP_ID_MAX_LENGTH },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    envelopes: [senderKeyEnvelopeSchema],
  },
  { timestamps: true },
);

groupSenderKeySchema.index({ groupId: 1, senderId: 1 }, { unique: true });
groupSenderKeySchema.index({ groupId: 1, 'envelopes.recipientId': 1 });

export type GroupSenderKeyDoc = InferSchemaType<typeof groupSenderKeySchema> & {
  _id: Types.ObjectId;
};
export const GroupSenderKeyModel: Model<GroupSenderKeyDoc> = model<GroupSenderKeyDoc>(
  'GroupSenderKey',
  groupSenderKeySchema,
);
