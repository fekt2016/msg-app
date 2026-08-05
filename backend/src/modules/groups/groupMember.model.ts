import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const GROUP_MEMBER_ROLES = ['OWNER', 'MEMBER'] as const;

export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

const groupMemberSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: GROUP_MEMBER_ROLES, default: 'MEMBER' },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1 });

export type GroupMemberDoc = InferSchemaType<typeof groupMemberSchema> & { _id: Types.ObjectId };
export const GroupMemberModel: Model<GroupMemberDoc> = model<GroupMemberDoc>(
  'GroupMember',
  groupMemberSchema,
);
