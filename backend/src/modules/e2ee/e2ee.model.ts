import { Schema, model, type InferSchemaType, type Model, type Types } from 'mongoose';

export interface PreKeyRecord {
  keyId: number;
  publicKey: string;
}

export interface SignedPreKeyRecord {
  keyId: number;
  publicKey: string;
  signature: string;
}

export interface IdentityKeyRecord {
  /** ECDH P-256 public key (raw, base64) — used for key agreement. */
  publicKey: string;
  /** ECDSA P-256 public key (raw, base64) — verifies signed-pre-key signatures. */
  signingPublicKey: string;
}

export interface OneTimePreKeyRecord {
  keyId: number;
  publicKey: string;
}

const preKeySchema = new Schema<PreKeyRecord>({
  keyId: { type: Number, required: true },
  publicKey: { type: String, required: true },
});

const signedPreKeySchema = new Schema<SignedPreKeyRecord>({
  keyId: { type: Number, required: true },
  publicKey: { type: String, required: true },
  signature: { type: String, required: true },
});

// Public keys only. Private key material is generated and held exclusively
// on-device and must never be stored server-side.
const identityKeySchema = new Schema<IdentityKeyRecord>({
  publicKey: { type: String, required: true },
  signingPublicKey: { type: String, required: true },
});

const oneTimePreKeySchema = new Schema<OneTimePreKeyRecord>({
  keyId: { type: Number, required: true },
  publicKey: { type: String, required: true },
});

const e2eeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    identityKey: identityKeySchema,
    signedPreKey: signedPreKeySchema,
    preKeys: [preKeySchema],
    oneTimePreKeys: [oneTimePreKeySchema],
    lastKeyRotationAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

e2eeSchema.index({ userId: 1 }, { unique: true });

export type E2eeDoc = InferSchemaType<typeof e2eeSchema> & { _id: Types.ObjectId };
export const E2eeModel: Model<E2eeDoc> = model<E2eeDoc>('E2ee', e2eeSchema);
