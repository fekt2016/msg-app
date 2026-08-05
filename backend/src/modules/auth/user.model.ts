import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const USER_ROLES = ['USER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as const;
export const ACCOUNT_STATUSES = ['PENDING', 'VERIFIED', 'SUSPENDED', 'CLOSED'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const userSchema = new Schema(
  {
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    bio: { type: String, trim: true, maxlength: 160, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'USER' },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'PENDING' },
    isVerified: { type: Boolean, default: false },
    recoveryKeyHash: { type: String, sparse: true },
    avatar: {
      publicId: { type: String },
      url: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    settings: {
      locale: { type: String, default: 'en' },
      currency: { type: String, default: 'GHS' },
      theme: { type: String, default: 'light' },
    },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ status: 1, deletedAt: 1 });
userSchema.index({ createdAt: 1 });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel: Model<UserDoc> = model<UserDoc>('User', userSchema);
