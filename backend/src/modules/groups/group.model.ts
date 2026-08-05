import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const GROUP_NAME_MAX_LENGTH = 100;
export const GROUP_MAX_MEMBERS = 256;

const groupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: GROUP_NAME_MAX_LENGTH,
    },
    avatar: {
      publicId: { type: String },
      url: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

groupSchema.index({ ownerId: 1, deletedAt: 1 });

export type GroupDoc = InferSchemaType<typeof groupSchema> & { _id: Types.ObjectId };
export const GroupModel: Model<GroupDoc> = model<GroupDoc>('Group', groupSchema);
