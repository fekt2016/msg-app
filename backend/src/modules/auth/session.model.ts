import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    jti: { type: String, required: true, unique: true },
    refreshTokenHash: { type: String, required: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sessionSchema.index({ userId: 1 });
sessionSchema.index({ deviceId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index(
  { revokedAt: 1 },
  { partialFilterExpression: { revokedAt: { $exists: true } } },
);

export type SessionDoc = InferSchemaType<typeof sessionSchema> & {
  _id: Types.ObjectId;
};

export const SessionModel: Model<SessionDoc> = model<SessionDoc>('Session', sessionSchema);
