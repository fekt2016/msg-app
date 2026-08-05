import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as userRepositoryModule from './user.repository.js';
import * as otpRepositoryModule from './otp.repository.js';
import * as sessionRepositoryModule from './session.repository.js';
import * as otpProviderModule from './otpProvider.js';
import * as tokenServiceModule from './token.service.js';

vi.mock('./user.repository.js', () => ({
  toSafeUser: vi.fn((user) => ({
    id: user._id.toString(),
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
  })),
  userRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdentifier: vi.fn(),
    findByIdentifierWithPassword: vi.fn(),
    exists: vi.fn(),
    markVerified: vi.fn(),
    touchLastLogin: vi.fn(),
  },
}));

vi.mock('./otp.repository.js', () => ({
  otpRepository: {
    create: vi.fn(),
    findLatest: vi.fn(),
    countRecent: vi.fn(),
    deleteById: vi.fn(),
    incrementAttempts: vi.fn(),
  },
}));

vi.mock('./session.repository.js', () => ({
  sessionRepository: {
    create: vi.fn(),
    findByJti: vi.fn(),
    revokeByJti: vi.fn(),
    revokeFamily: vi.fn(),
    touch: vi.fn(),
  },
}));

vi.mock('./otpProvider.js', () => ({
  generateOtpCode: vi.fn(() => '123456'),
  hashOtpCode: vi.fn((code: string) => `hashed-${code}`),
  otpProvider: { send: vi.fn() },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(() => Promise.resolve(true)),
    hash: vi.fn(() => Promise.resolve('hashed-password')),
  },
}));

vi.mock('./token.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof tokenServiceModule>();
  return {
    ...actual,
    signAccessToken: vi.fn(() => 'access-token'),
    signRefreshToken: vi.fn(() => 'refresh-token'),
    generateJti: vi.fn(() => 'jti-1'),
  };
});

const userRepository = vi.mocked(userRepositoryModule.userRepository);
const otpRepository = vi.mocked(otpRepositoryModule.otpRepository);
const sessionRepository = vi.mocked(sessionRepositoryModule.sessionRepository);
const otpProvider = vi.mocked(otpProviderModule.otpProvider);
const tokenService = vi.mocked(tokenServiceModule);

function fakeUser(overrides: Partial<{ isVerified: boolean; email: string; phone: string }> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'test@example.com',
    phone: undefined,
    displayName: 'Test User',
    role: 'USER',
    status: 'PENDING',
    isVerified: false,
    deletedAt: null,
    passwordHash: 'hash',
    ...overrides,
  } as never;
}

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/auth/register', () => {
  it('creates a user and issues an OTP', async () => {
    userRepository.exists.mockResolvedValue(false);
    userRepository.create.mockResolvedValue(fakeUser());

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ identifier: 'test@example.com', password: 'password123', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('user-1');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', displayName: 'Test User' }),
    );
    expect(otpRepository.create).toHaveBeenCalled();
    expect(otpProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'test@example.com',
        code: '123456',
        purpose: 'VERIFY',
      }),
    );
  });

  it('returns 409 when the identifier is already taken', async () => {
    userRepository.exists.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ identifier: 'taken@example.com', password: 'password123', displayName: 'Dup' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDENTIFIER_TAKEN');
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('returns 422 for invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ identifier: 'a@b.com', password: 'short', displayName: '' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });
});

describe('POST /api/v1/auth/resend-otp', () => {
  // The shared module-level `app` routes /auth/resend-otp through an in-memory
  // OTP rate limiter (max = OTP_RATE_LIMIT_MAX) whose per-IP budget is consumed
  // by the register describe block above. Use a fresh app so this block has its
  // own limiter store and is independent of test ordering.
  const resendApp = createApp();

  it('silently no-ops a VERIFY resend for an already-verified email account (ADR 0002)', async () => {
    userRepository.findByIdentifier.mockResolvedValue(
      fakeUser({ isVerified: true, email: 'verified@example.com' }) as never,
    );

    const res = await request(resendApp)
      .post('/api/v1/auth/resend-otp')
      .send({ identifier: 'verified@example.com', purpose: 'VERIFY' });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
    expect(otpProvider.send).not.toHaveBeenCalled();
    expect(otpRepository.create).not.toHaveBeenCalled();
  });

  it('silently no-ops a VERIFY resend for an already-verified phone account (ADR 0002)', async () => {
    userRepository.findByIdentifier.mockResolvedValue(
      fakeUser({ isVerified: true, email: undefined, phone: '233201234567' }) as never,
    );

    const res = await request(resendApp)
      .post('/api/v1/auth/resend-otp')
      .send({ identifier: '0201234567', purpose: 'VERIFY' });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
    expect(otpProvider.send).not.toHaveBeenCalled();
    expect(otpRepository.create).not.toHaveBeenCalled();
  });

  it('re-issues a VERIFY OTP for an unverified email account', async () => {
    userRepository.findByIdentifier.mockResolvedValue(fakeUser({ isVerified: false }) as never);

    const res = await request(resendApp)
      .post('/api/v1/auth/resend-otp')
      .send({ identifier: 'test@example.com', purpose: 'VERIFY' });

    expect(res.status).toBe(200);
    expect(otpProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'test@example.com', purpose: 'VERIFY' }),
    );
  });
});

describe('POST /api/v1/auth/verify-otp', () => {
  it('verifies a code and returns tokens for a VERIFY purpose', async () => {
    otpRepository.findLatest.mockResolvedValue({
      _id: { toString: () => 'otp-1' },
      identifier: 'test@example.com',
      purpose: 'VERIFY',
      codeHash: 'hashed-123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    userRepository.findByIdentifier.mockResolvedValue(fakeUser());
    userRepository.markVerified.mockResolvedValue(fakeUser({ isVerified: true }));
    sessionRepository.create.mockResolvedValue({} as never);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        identifier: 'test@example.com',
        purpose: 'VERIFY',
        code: '123456',
        deviceId: 'device-1',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.isVerified).toBe(true);
    expect(res.body.data.accessToken).toBe('access-token');
    expect(res.body.data.refreshToken).toBe('refresh-token');
    expect(userRepository.markVerified).toHaveBeenCalled();
    expect(sessionRepository.create).toHaveBeenCalled();
  });

  it('returns 400 for an incorrect code', async () => {
    otpRepository.findLatest.mockResolvedValue({
      _id: { toString: () => 'otp-1' },
      identifier: 'test@example.com',
      purpose: 'VERIFY',
      codeHash: 'hashed-999999',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        identifier: 'test@example.com',
        purpose: 'VERIFY',
        code: '123456',
        deviceId: 'device-1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
    expect(otpRepository.incrementAttempts).toHaveBeenCalled();
  });

  it('returns 400 for an expired code', async () => {
    otpRepository.findLatest.mockResolvedValue({
      _id: { toString: () => 'otp-1' },
      identifier: 'test@example.com',
      purpose: 'VERIFY',
      codeHash: 'hashed-123456',
      attempts: 0,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        identifier: 'test@example.com',
        purpose: 'VERIFY',
        code: '123456',
        deviceId: 'device-1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in and returns tokens', async () => {
    userRepository.findByIdentifierWithPassword.mockResolvedValue(
      fakeUser({ isVerified: true }) as never,
    );
    sessionRepository.create.mockResolvedValue({} as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'test@example.com', password: 'password123', deviceId: 'device-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('access-token');
    expect(userRepository.touchLastLogin).toHaveBeenCalledWith('user-1');
  });

  it('returns 401 for an unknown user', async () => {
    userRepository.findByIdentifierWithPassword.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody@example.com', password: 'password123', deviceId: 'device-1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 403 for an unverified account', async () => {
    userRepository.findByIdentifierWithPassword.mockResolvedValue(fakeUser() as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'test@example.com', password: 'password123', deviceId: 'device-1' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_VERIFIED');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates a valid refresh token', async () => {
    vi.spyOn(tokenService, 'verifyRefreshToken').mockReturnValue({
      sub: 'user-1',
      deviceId: 'device-1',
      jti: 'jti-1',
    } as never);
    sessionRepository.findByJti.mockResolvedValue({
      userId: { toString: () => 'user-1' },
      deviceId: 'device-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as never);
    userRepository.findById.mockResolvedValue(fakeUser({ isVerified: true }) as never);
    sessionRepository.create.mockResolvedValue({} as never);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'some-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('access-token');
    expect(sessionRepository.revokeByJti).toHaveBeenCalledWith('jti-1');
    expect(sessionRepository.create).toHaveBeenCalled();
  });

  it('revokes the whole family on token reuse', async () => {
    vi.spyOn(tokenService, 'verifyRefreshToken').mockReturnValue({
      sub: 'user-1',
      deviceId: 'device-1',
      jti: 'jti-reused',
    } as never);
    sessionRepository.findByJti.mockResolvedValue({
      userId: { toString: () => 'user-1' },
      deviceId: 'device-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    } as never);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'reused-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    expect(sessionRepository.revokeFamily).toHaveBeenCalledWith('user-1', 'device-1');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session', async () => {
    vi.spyOn(tokenService, 'verifyRefreshToken').mockReturnValue({
      sub: 'user-1',
      deviceId: 'device-1',
      jti: 'jti-1',
    } as never);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'some-refresh-token' });

    expect(res.status).toBe(200);
    expect(sessionRepository.revokeByJti).toHaveBeenCalledWith('jti-1');
  });
});

describe('auth rate limiting', () => {
  it('limits repeated OTP requests', async () => {
    userRepository.exists.mockResolvedValue(false);
    userRepository.create.mockResolvedValue(fakeUser() as never);
    otpRepository.countRecent.mockResolvedValue(envOtpMax());

    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ identifier: `user${i}@example.com`, password: 'password123', displayName: 'Rate' });
      // The OTP service-level limit (3/hour/identifier) trips on the 4th request.
      if (i === 3) {
        expect(res.status).toBe(429);
      }
    }
  });

  function envOtpMax() {
    return Number(process.env.OTP_RATE_LIMIT_MAX) || 3;
  }
});
