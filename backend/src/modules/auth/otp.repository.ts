import { OtpCodeModel, type OtpPurpose } from './otpCode.model.js';

export interface CreateOtpInput {
  identifier: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
}

export const otpRepository = {
  async create(input: CreateOtpInput) {
    return OtpCodeModel.create(input);
  },

  async findLatest(identifier: string, purpose: OtpPurpose) {
    return OtpCodeModel.findOne({ identifier, purpose }).sort({ createdAt: -1 });
  },

  async countRecent(identifier: string, purpose: OtpPurpose, windowStart: Date): Promise<number> {
    return OtpCodeModel.countDocuments({ identifier, purpose, createdAt: { $gte: windowStart } });
  },

  async deleteById(id: string): Promise<void> {
    await OtpCodeModel.deleteOne({ _id: id });
  },

  async incrementAttempts(id: string): Promise<void> {
    await OtpCodeModel.updateOne({ _id: id }, { $inc: { attempts: 1 } });
  },
};
