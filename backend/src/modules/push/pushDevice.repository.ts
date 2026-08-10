import { PushDeviceModel, type PushDeviceDoc } from './pushDevice.model.js';

export interface UpsertDeviceInput {
  userId: string;
  deviceId: string;
  pushToken: string;
  platform: PushDeviceDoc['platform'];
  appVersion?: string;
}

export const pushDeviceRepository = {
  /**
   * Register (or re-register) a device. Keyed by `deviceId` so a device that
   * switches user or refreshes its token replaces the prior row rather than
   * accumulating duplicates.
   */
  async upsertByDeviceId(input: UpsertDeviceInput): Promise<PushDeviceDoc> {
    return PushDeviceModel.findOneAndUpdate(
      { deviceId: input.deviceId },
      {
        userId: input.userId,
        pushToken: input.pushToken,
        platform: input.platform,
        appVersion: input.appVersion ?? '',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  },

  async listByUserId(userId: string): Promise<PushDeviceDoc[]> {
    return PushDeviceModel.find({ userId }).lean();
  },

  async listTokensByUserId(userId: string): Promise<string[]> {
    const devices = await PushDeviceModel.find({ userId }, { pushToken: 1 }).lean();
    return devices.map((d) => d.pushToken);
  },

  /**
   * Scoped delete: a device can only be unregistered by the user who owns its
   * current registration, so a leaked deviceId can't deregister someone else.
   * Returns whether a row was removed.
   */
  async deleteByDeviceIdForUser(deviceId: string, userId: string): Promise<boolean> {
    const result = await PushDeviceModel.deleteOne({ deviceId, userId });
    return result.deletedCount > 0;
  },
};
