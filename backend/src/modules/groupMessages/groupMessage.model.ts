import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const groupMessageSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    keyId: { type: Number, required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    timestamp: { type: Number, required: true },
  },
  { timestamps: true },
);

// Group history is queried per group, newest-first (deterministic tie-break).
groupMessageSchema.index({ groupId: 1, timestamp: -1, _id: -1 });

export type GroupMessageDoc = InferSchemaType<typeof groupMessageSchema> & { _id: Types.ObjectId };
export const GroupMessageModel: Model<GroupMessageDoc> = model<GroupMessageDoc>(
  'GroupMessage',
  groupMessageSchema,
);
