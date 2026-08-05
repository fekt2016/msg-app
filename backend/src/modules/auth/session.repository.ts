import { SessionModel } from './session.model.js';

export interface CreateSessionInput {
  userId: string;
  deviceId: string;
  jti: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export const sessionRepository = {
  async create(input: CreateSessionInput) {
    return SessionModel.create(input);
  },

  async findByJti(jti: string) {
    return SessionModel.findOne({ jti });
  },

  async revokeByJti(jti: string): Promise<void> {
    await SessionModel.updateOne({ jti }, { revokedAt: new Date() });
  },

  async revokeFamily(userId: string, deviceId: string): Promise<void> {
    await SessionModel.updateMany({ userId, deviceId, revokedAt: null }, { revokedAt: new Date() });
  },

  async touch(jti: string): Promise<void> {
    await SessionModel.updateOne({ jti }, { lastUsedAt: new Date() });
  },
};
