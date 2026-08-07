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

// Group history is queried per group, newest-first, scoped to the caller's
// join time. Ordering + the `joinedAt` cutoff both use the server-assigned
// `createdAt` (not the client-supplied `timestamp`, which is forgeable — a
// member could otherwise pin/hide messages or leak pre-join history past the
// ADR 0004 forward-only boundary). `_id` is the deterministic tie-break.
groupMessageSchema.index({ groupId: 1, createdAt: -1, _id: -1 });

export type GroupMessageDoc = InferSchemaType<typeof groupMessageSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
export const GroupMessageModel: Model<GroupMessageDoc> = model<GroupMessageDoc>(
  'GroupMessage',
  groupMessageSchema,
);
