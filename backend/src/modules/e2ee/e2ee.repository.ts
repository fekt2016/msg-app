import { E2eeModel, type E2eeDoc } from './e2ee.model.js';
import type {
  PreKeyRecord,
  SignedPreKeyRecord,
  IdentityKeyRecord,
  OneTimePreKeyRecord,
} from './e2ee.model.js';

export interface E2eeKeys {
  identityKey: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
  preKeys: PreKeyRecord[];
  oneTimePreKeys: OneTimePreKeyRecord[];
}

export const e2eeRepository = {
  async findByUserId(userId: string): Promise<E2eeDoc | null> {
    return E2eeModel.findOne({ userId }).lean().exec();
  },

  async create(userId: string, keys: E2eeKeys): Promise<E2eeDoc> {
    return E2eeModel.create({
      userId,
      identityKey: keys.identityKey,
      signedPreKey: keys.signedPreKey,
      preKeys: keys.preKeys,
      oneTimePreKeys: keys.oneTimePreKeys,
    });
  },

  async upsert(userId: string, keys: Partial<E2eeKeys>): Promise<E2eeDoc> {
    return E2eeModel.findOneAndUpdate(
      { userId },
      { $set: keys, lastKeyRotationAt: new Date() },
      { upsert: true, new: true },
    ).exec();
  },

  async updatePreKeys(userId: string, preKeys: PreKeyRecord[]): Promise<E2eeDoc | null> {
    return E2eeModel.findOneAndUpdate({ userId }, { $set: { preKeys } }, { new: true }).exec();
  },

  async updateOneTimePreKeys(
    userId: string,
    oneTimePreKeys: OneTimePreKeyRecord[],
  ): Promise<E2eeDoc | null> {
    return E2eeModel.findOneAndUpdate(
      { userId },
      { $set: { oneTimePreKeys } },
      { new: true },
    ).exec();
  },

  async updateSignedPreKey(
    userId: string,
    signedPreKey: SignedPreKeyRecord,
  ): Promise<E2eeDoc | null> {
    return E2eeModel.findOneAndUpdate({ userId }, { $set: { signedPreKey } }, { new: true }).exec();
  },

  async consumeOneTimePreKeys(userId: string, keyIds: number[]): Promise<E2eeDoc | null> {
    return E2eeModel.findOneAndUpdate(
      { userId },
      { $pull: { oneTimePreKeys: { keyId: { $in: keyIds } } } },
      { new: true },
    ).exec();
  },

  async deleteByUserId(userId: string): Promise<void> {
    await E2eeModel.deleteOne({ userId }).exec();
  },
};
