import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../errors/AppError.js';
import { userRepository, toSafeUser } from './user.repository.js';
import { otpRepository } from './otp.repository.js';
import { sessionRepository } from './session.repository.js';
import { generateOtpCode, hashOtpCode, otpProvider } from './otpProvider.js';
import {
  accessTokenExpirySeconds,
  generateJti,
  hashRefreshToken,
  refreshTokenExpirySeconds,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPair,
} from './token.service.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import type { OtpPurpose } from './otpCode.model.js';
import type { UserRole } from './user.model.js';

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  identifier: string;
  password: string;
  displayName: string;
}

export interface VerifyOtpInput {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
  deviceId: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
  deviceId: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken: string;
}

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return isEmail(trimmed) ? trimmed.toLowerCase() : normalizePhoneNumber(trimmed);
}

function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

async function assertIdentifierAvailable(identifier: string): Promise<void> {
  if (await userRepository.exists(identifier)) {
    throw new AppError(409, 'IDENTIFIER_TAKEN', 'An account with this email/phone already exists');
  }
}

async function sendOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  const windowStart = new Date(Date.now() - env.OTP_RATE_LIMIT_WINDOW_MS);
  const recent = await otpRepository.countRecent(identifier, purpose, windowStart);
  if (recent >= env.OTP_RATE_LIMIT_MAX) {
    throw new AppError(
      429,
      'OTP_RATE_LIMITED',
      'Too many verification codes requested. Try again later.',
    );
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_IN_MINUTES * 60_000);
  await otpRepository.create({
    identifier,
    purpose,
    codeHash: hashOtpCode(code),
    expiresAt,
  });

  await otpProvider.send({ identifier, code, purpose });
  logger.info({ identifier, purpose }, 'OTP issued');
}

export const authService = {
  async register(input: RegisterInput): Promise<{ userId: string }> {
    const identifier = normalizeIdentifier(input.identifier);
    await assertIdentifierAvailable(identifier);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const userData = isEmail(identifier)
      ? { email: identifier, displayName: input.displayName, passwordHash }
      : { phone: identifier, displayName: input.displayName, passwordHash };

    const user = await userRepository.create(userData);
    await sendOtp(identifier, 'VERIFY');

    return { userId: user._id.toString() };
  },

  async resendOtp(input: { identifier: string; purpose: OtpPurpose }): Promise<void> {
    const identifier = normalizeIdentifier(input.identifier);
    // A VERIFY OTP only makes sense for accounts that are not yet verified.
    // This guard must apply to every identifier type (email and phone alike),
    // otherwise an already-verified account can re-trigger VERIFY sends indefinitely.
    if (input.purpose === 'VERIFY') {
      const user = await userRepository.findByIdentifier(identifier);
      if (user && user.isVerified) {
        // Silent no-op: never disclose verification status as a side channel
        // of a resend request (ADR 0002). Do not send an OTP, do not create
        // an OTP record, and do not throw — the caller sees the same
        // 200 {sent:true} as every other case.
        return;
      }
    }
    await sendOtp(identifier, input.purpose);
  },

  async verifyOtp(
    input: VerifyOtpInput,
  ): Promise<{ user: ReturnType<typeof toSafeUser> } & TokenPair> {
    const identifier = normalizeIdentifier(input.identifier);
    const otp = await otpRepository.findLatest(identifier, input.purpose);

    if (!otp) {
      throw new AppError(400, 'OTP_NOT_FOUND', 'No verification code found. Request a new one.');
    }
    if (otp.expiresAt < new Date()) {
      await otpRepository.deleteById(otp._id.toString());
      throw new AppError(400, 'OTP_EXPIRED', 'Verification code has expired. Request a new one.');
    }
    if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
      await otpRepository.deleteById(otp._id.toString());
      throw new AppError(
        429,
        'OTP_ATTEMPTS_EXCEEDED',
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (otp.codeHash !== hashOtpCode(input.code)) {
      const attempts = otp.attempts + 1;
      if (attempts >= env.OTP_MAX_ATTEMPTS) {
        await otpRepository.deleteById(otp._id.toString());
        throw new AppError(
          429,
          'OTP_ATTEMPTS_EXCEEDED',
          'Too many incorrect attempts. Request a new code.',
        );
      }
      await otpRepository.incrementAttempts(otp._id.toString());
      throw new AppError(400, 'OTP_INVALID', 'Incorrect verification code');
    }

    await otpRepository.deleteById(otp._id.toString());

    let user = await userRepository.findByIdentifier(identifier);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (input.purpose === 'VERIFY') {
      user = await userRepository.markVerified(user._id.toString());
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }
    }

    await userRepository.touchLastLogin(user._id.toString());
    const tokens = await createSession(user._id.toString(), user.role, input.deviceId);
    return { user: toSafeUser(user), ...tokens };
  },

  async login(input: LoginInput): Promise<{ user: ReturnType<typeof toSafeUser> } & TokenPair> {
    const identifier = normalizeIdentifier(input.identifier);
    const user = await userRepository.findByIdentifierWithPassword(identifier);

    if (!user || user.deletedAt) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    if (!(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    if (!user.isVerified) {
      throw new AppError(403, 'ACCOUNT_NOT_VERIFIED', 'Account is not verified');
    }

    await userRepository.touchLastLogin(user._id.toString());
    const tokens = await createSession(user._id.toString(), user.role, input.deviceId);
    return { user: toSafeUser(user), ...tokens };
  },

  async refresh(input: RefreshInput): Promise<TokenPair> {
    const payload = verifyRefreshToken(input.refreshToken);
    const session = await sessionRepository.findByJti(payload.jti);

    if (!session) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not recognised');
    }

    if (session.revokedAt) {
      // Reuse of a rotated token — revoke the whole family and force re-login.
      await sessionRepository.revokeFamily(session.userId.toString(), session.deviceId);
      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSED',
        'Session has been revoked. Please log in again.',
      );
    }

    if (session.expiresAt < new Date()) {
      await sessionRepository.revokeByJti(payload.jti);
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired');
    }

    const user = await userRepository.findById(session.userId.toString());
    if (!user || user.deletedAt) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session user no longer exists');
    }

    await sessionRepository.revokeByJti(payload.jti);
    const tokens = await createSession(user._id.toString(), user.role, session.deviceId);
    return tokens;
  },

  async logout(input: LogoutInput): Promise<void> {
    const payload = verifyRefreshToken(input.refreshToken);
    await sessionRepository.revokeByJti(payload.jti);
    logger.info({ userId: payload.sub, deviceId: payload.deviceId }, 'User logged out');
  },
};

async function createSession(userId: string, role: UserRole, deviceId: string): Promise<TokenPair> {
  const jti = generateJti();
  const refreshToken = signRefreshToken({ sub: userId, deviceId, jti });
  const expiresAt = new Date(Date.now() + refreshTokenExpirySeconds() * 1000);

  await sessionRepository.create({
    userId,
    deviceId,
    jti,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt,
  });

  const accessToken = signAccessToken({ sub: userId, role, deviceId });
  return {
    accessToken,
    refreshToken,
    expiresIn: accessTokenExpirySeconds(),
  };
}
