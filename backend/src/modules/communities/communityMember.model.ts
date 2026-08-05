import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const MEMBER_ROLES = ['OWNER', 'MODERATOR', 'MEMBER'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

const communityMemberSchema = new Schema(
  {
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'MEMBER' },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

communityMemberSchema.index({ communityId: 1, userId: 1 }, { unique: true });
communityMemberSchema.index({ communityId: 1, role: 1 });
communityMemberSchema.index({ userId: 1 });

export type CommunityMemberDoc = InferSchemaType<typeof communityMemberSchema> & {
  _id: Types.ObjectId;
};
export const CommunityMemberModel: Model<CommunityMemberDoc> = model<CommunityMemberDoc>(
  'CommunityMember',
  communityMemberSchema,
);
