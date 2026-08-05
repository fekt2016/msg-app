import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const OTP_PURPOSES = ['VERIFY', 'RESET', 'LOGIN'] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const otpCodeSchema = new Schema(
  {
    identifier: { type: String, required: true, trim: true, lowercase: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

otpCodeSchema.index({ identifier: 1, purpose: 1, createdAt: 1 });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpCodeDoc = InferSchemaType<typeof otpCodeSchema> & {
  _id: Types.ObjectId;
};

export const OtpCodeModel: Model<OtpCodeDoc> = model<OtpCodeDoc>('OtpCode', otpCodeSchema);
