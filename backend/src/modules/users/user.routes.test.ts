import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as userDirectoryRepositoryModule from './user.repository.js';
import * as mediaStorageModule from './mediaStorage.js';

const userRepository = vi.mocked(userRepositoryModule.userRepository);
const userDirectoryRepository = vi.mocked(userDirectoryRepositoryModule.userDirectoryRepository);
const mediaStorage = vi.mocked(mediaStorageModule.mediaStorage);

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

vi.mock('../auth/user.repository.js', () => ({
  toSafeUser: vi.fn((user) => ({
    id: user._id.toString(),
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    bio: user.bio ?? '',
    avatar:
      user.avatar && user.avatar.publicId
        ? {
            publicId: user.avatar.publicId,
            url: user.avatar.url,
            width: user.avatar.width,
            height: user.avatar.height,
          }
        : null,
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
    updateProfile: vi.fn(),
    updateAvatar: vi.fn(),
  },
}));

vi.mock('./user.repository.js', () => ({
  userDirectoryRepository: {
    listChatUsers: vi.fn(),
    findVerifiedByPhoneNumbers: vi.fn(),
  },
}));

// Keep the real `isSupportedImage`/`sniffImageMimeType` implementations so
// the avatar-upload route tests genuinely exercise magic-byte content
// sniffing — only the Cloudinary-facing provider is mocked.
vi.mock('./mediaStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof mediaStorageModule>();
  return {
    ...actual,
    mediaStorage: {
      uploadAvatar: vi.fn(),
      deleteByPublicId: vi.fn(),
    },
  };
});

vi.mock('../../modules/auth/token.service.js', () => ({
  signAccessToken: vi.fn(() => 'access-token'),
  signRefreshToken: vi.fn(() => 'refresh-token'),
  generateJti: vi.fn(() => 'jti-1'),
  verifyAccessToken: vi.fn((token: string) => {
    if (token !== 'valid-token') {
      const err = new Error('jwt malformed') as Error & { name: string };
      err.name = 'JsonWebTokenError';
      throw err;
    }
    return {
      sub: 'user-1',
      role: 'USER',
      deviceId: 'device-1',
      type: 'access',
    };
  }),
  verifyRefreshToken: vi.fn(),
  hashToken: vi.fn((t: string) => `hashed-${t}`),
}));

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeUser(overrides: Partial<{ bio: string; avatar: unknown; displayName: string }> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'test@example.com',
    phone: undefined,
    displayName: 'Test User',
    bio: '',
    avatar: undefined,
    role: 'USER',
    status: 'VERIFIED',
    isVerified: true,
    deletedAt: null,
    ...overrides,
  } as never;
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('GET /api/v1/users/me', () => {
  it('returns the authenticated user profile', async () => {
    userRepository.findById.mockResolvedValue(fakeUser());

    const res = await request(app).get('/api/v1/users/me').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({ id: 'user-1', displayName: 'Test User', bio: '', avatar: null }),
    );
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 when the user was deleted', async () => {
    userRepository.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/me').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('GET /api/v1/users', () => {
  it('lists verified users to chat with, defaulting to page 1 / pageSize 20', async () => {
    userDirectoryRepository.listChatUsers.mockResolvedValue({
      items: [
        fakeUser({ _id: { toString: () => 'user-2' }, displayName: 'Kofi' }),
        fakeUser({ _id: { toString: () => 'user-3' }, displayName: 'Ama' }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const res = await request(app).get('/api/v1/users').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(userDirectoryRepository.listChatUsers).toHaveBeenCalledWith('user-1', 1, 20);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ id: 'user-2', displayName: 'Kofi' }),
    );
    expect(res.body.data[1]).toEqual(expect.objectContaining({ id: 'user-3', displayName: 'Ama' }));
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('honors explicit page/pageSize query params', async () => {
    userDirectoryRepository.listChatUsers.mockResolvedValue({
      items: [],
      total: 45,
      page: 2,
      pageSize: 30,
    });

    const res = await request(app).get('/api/v1/users?page=2&pageSize=30').set(AUTH);

    expect(res.status).toBe(200);
    expect(userDirectoryRepository.listChatUsers).toHaveBeenCalledWith('user-1', 2, 30);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 30, total: 45, totalPages: 2 });
  });

  it('caps pageSize at 100 and rejects an out-of-range value', async () => {
    const res = await request(app).get('/api/v1/users?pageSize=500').set(AUTH);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(userDirectoryRepository.listChatUsers).not.toHaveBeenCalled();
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/v1/users');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(userDirectoryRepository.listChatUsers).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/users/match-contacts', () => {
  it('returns registered users matching the contact phone numbers', async () => {
    userDirectoryRepository.findVerifiedByPhoneNumbers.mockResolvedValue([
      fakeUser({ _id: { toString: () => 'user-2' }, displayName: 'Kofi' }),
    ]);

    const res = await request(app)
      .post('/api/v1/users/match-contacts')
      .set(AUTH)
      .send({ phoneNumbers: ['+233 24 123 4567', '0240000000'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(userDirectoryRepository.findVerifiedByPhoneNumbers).toHaveBeenCalledWith([
      '233241234567',
      '233240000000',
    ]);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ id: 'user-2', displayName: 'Kofi' }),
    );
  });

  it('returns 422 for an empty phone list', async () => {
    const res = await request(app)
      .post('/api/v1/users/match-contacts')
      .set(AUTH)
      .send({ phoneNumbers: [] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(userDirectoryRepository.findVerifiedByPhoneNumbers).not.toHaveBeenCalled();
  });

  it('returns 422 for a non-array payload', async () => {
    const res = await request(app)
      .post('/api/v1/users/match-contacts')
      .set(AUTH)
      .send({ phoneNumbers: '+233241234567' });

    expect(res.status).toBe(422);
    expect(userDirectoryRepository.findVerifiedByPhoneNumbers).not.toHaveBeenCalled();
  });

  it('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/api/v1/users/match-contacts')
      .send({ phoneNumbers: ['0240000000'] });

    expect(res.status).toBe(401);
    expect(userDirectoryRepository.findVerifiedByPhoneNumbers).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates display name and bio', async () => {
    userRepository.updateProfile.mockResolvedValue(
      fakeUser({ displayName: 'New Name', bio: 'Hello, Ghana!' }),
    );

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(AUTH)
      .send({ displayName: 'New Name', bio: 'Hello, Ghana!' });

    expect(res.status).toBe(200);
    expect(userRepository.updateProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'New Name',
      bio: 'Hello, Ghana!',
    });
    expect(res.body.data).toEqual(expect.objectContaining({ displayName: 'New Name' }));
  });

  it('returns 422 when the body is empty', async () => {
    const res = await request(app).patch('/api/v1/users/me').set(AUTH).send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 422 for a bio longer than 160 characters', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(AUTH)
      .send({ bio: 'x'.repeat(161) });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 when the user no longer exists', async () => {
    userRepository.updateProfile.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(AUTH)
      .send({ displayName: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('POST /api/v1/users/me/avatar', () => {
  it('uploads an avatar and returns the updated profile', async () => {
    userRepository.findById.mockResolvedValue(fakeUser());
    userRepository.updateAvatar.mockResolvedValue(
      fakeUser({
        avatar: { publicId: 'abc', url: 'https://cdn.test/abc', width: 512, height: 512 },
      }),
    );
    mediaStorage.uploadAvatar.mockResolvedValue({
      publicId: 'abc',
      url: 'https://cdn.test/abc',
      width: 512,
      height: 512,
    });

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(AUTH)
      .attach('avatar', VALID_PNG_BYTES, {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(mediaStorage.uploadAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'avatar.png' }),
    );
    expect(res.body.data.avatar).toEqual(
      expect.objectContaining({ publicId: 'abc', url: 'https://cdn.test/abc' }),
    );
  });

  it('returns 422 for a non-image file (rejected by the Content-Type pre-filter)', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(AUTH)
      .attach('avatar', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(mediaStorage.uploadAvatar).not.toHaveBeenCalled();
  });

  it('returns 422 for a spoofed upload — a valid image/png Content-Type header on non-image bytes', async () => {
    userRepository.findById.mockResolvedValue(fakeUser());

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(AUTH)
      // Header claims PNG, but the byte content is plain text — the
      // Content-Type-only pre-filter in avatarUpload.ts would let this
      // through; the magic-byte sniff in the service must reject it.
      .attach('avatar', Buffer.from('totally a real png, trust me'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(mediaStorage.uploadAvatar).not.toHaveBeenCalled();
  });

  it('returns 422 when the avatar field is missing', async () => {
    const res = await request(app).post('/api/v1/users/me/avatar').set(AUTH);

    expect(res.status).toBe(422);
  });

  it('returns 404 when the user no longer exists', async () => {
    userRepository.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(AUTH)
      .attach('avatar', VALID_PNG_BYTES, {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});
