import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export const PUSH_PLATFORMS = ['android', 'ios', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

const pushDeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The client device id (expo-application). One push registration per device.
    deviceId: { type: String, required: true },
    pushToken: { type: String, required: true },
    platform: { type: String, enum: PUSH_PLATFORMS, required: true },
    appVersion: { type: String, default: '' },
  },
  { timestamps: true },
);

// One registration row per device — re-registering (new user/token on the same
// device) replaces it. `{userId}` drives the per-user token lookup.
pushDeviceSchema.index({ deviceId: 1 }, { unique: true });
pushDeviceSchema.index({ userId: 1 });

export type PushDeviceDoc = InferSchemaType<typeof pushDeviceSchema> & { _id: Types.ObjectId };
export const PushDeviceModel: Model<PushDeviceDoc> = model<PushDeviceDoc>(
  'PushDevice',
  pushDeviceSchema,
);
