import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const COMMUNITY_VISIBILITY = ['PUBLIC', 'PRIVATE'] as const;

export type CommunityVisibility = (typeof COMMUNITY_VISIBILITY)[number];

const communitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    slug: { type: String, required: true, trim: true, unique: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    avatar: {
      publicId: { type: String },
      url: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    visibility: { type: String, enum: COMMUNITY_VISIBILITY, default: 'PUBLIC' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

communitySchema.index({ visibility: 1, deletedAt: 1, memberCount: -1 });
communitySchema.index({ ownerId: 1, deletedAt: 1 });

export type CommunityDoc = InferSchemaType<typeof communitySchema> & { _id: Types.ObjectId };
export const CommunityModel: Model<CommunityDoc> = model<CommunityDoc>(
  'Community',
  communitySchema,
);
