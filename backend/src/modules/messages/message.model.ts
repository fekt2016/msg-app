import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const messageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    timestamp: { type: Number, required: true },
  },
  { timestamps: true },
);

// Both conversation directions are queried via $or, so each direction gets an
// index on (participant, peer, timestamp) to serve the newest-first history.
messageSchema.index({ senderId: 1, recipientId: 1, timestamp: -1 });
messageSchema.index({ recipientId: 1, senderId: 1, timestamp: -1 });

export type MessageDoc = InferSchemaType<typeof messageSchema> & { _id: Types.ObjectId };
export const ConversationMessageModel: Model<MessageDoc> = model<MessageDoc>(
  'ConversationMessage',
  messageSchema,
);
