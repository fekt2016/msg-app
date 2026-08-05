import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as userDirectoryRepositoryModule from './user.repository.js';
import * as mediaStorageModule from './mediaStorage.js';
import { userService, normalizePhoneNumber } from './user.service.js';

vi.mock('../auth/user.repository.js', () => ({
  toSafeUser: vi.fn((user) => ({ id: user._id.toString(), displayName: user.displayName })),
  userRepository: {
    findById: vi.fn(),
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

// Keep the real `isSupportedImage`/`sniffImageMimeType` implementations —
// only the Cloudinary-facing provider is mocked — so avatar-upload tests
// genuinely exercise the magic-byte content-sniffing logic rather than a
// mimetype-only stand-in.
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

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const userRepositoryMock = vi.mocked(userRepositoryModule.userRepository);
const userDirectoryRepositoryMock = vi.mocked(
  userDirectoryRepositoryModule.userDirectoryRepository,
);
const mediaStorageMock = vi.mocked(mediaStorageModule.mediaStorage);

function fakeUser(overrides: Record<string, unknown> = {}) {
  return { _id: { toString: () => 'user-1' }, displayName: 'Test User', ...overrides } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mediaStorageMock.uploadAvatar.mockResolvedValue({
    publicId: 'default-id',
    url: 'https://default',
    width: 512,
    height: 512,
  });
  mediaStorageMock.deleteByPublicId.mockResolvedValue(undefined);
});

describe('userService', () => {
  it('returns the profile for a known user', async () => {
    userRepositoryMock.findById.mockResolvedValue(fakeUser());

    const profile = await userService.getProfile('user-1');

    expect(profile.id).toBe('user-1');
    expect(userRepositoryMock.findById).toHaveBeenCalledWith('user-1');
  });

  it('lists chat users excluding the current user, paginated', async () => {
    userDirectoryRepositoryMock.listChatUsers.mockResolvedValue({
      items: [
        fakeUser({ _id: { toString: () => 'user-2' } }),
        fakeUser({ _id: { toString: () => 'user-3' } }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const result = await userService.listChatUsers('user-1', 1, 20);

    expect(userDirectoryRepositoryMock.listChatUsers).toHaveBeenCalledWith('user-1', 1, 20);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('user-2');
    expect(result.items[1].id).toBe('user-3');
  });

  it('forwards the requested page/pageSize to the repository, capped by validation upstream', async () => {
    userDirectoryRepositoryMock.listChatUsers.mockResolvedValue({
      items: [],
      total: 0,
      page: 3,
      pageSize: 100,
    });

    const result = await userService.listChatUsers('user-1', 3, 100);

    expect(userDirectoryRepositoryMock.listChatUsers).toHaveBeenCalledWith('user-1', 3, 100);
    expect(result).toEqual({ items: [], total: 0, page: 3, pageSize: 100 });
  });

  it('matches contacts by normalized phone numbers', async () => {
    userDirectoryRepositoryMock.findVerifiedByPhoneNumbers.mockResolvedValue([
      fakeUser({ _id: { toString: () => 'user-2' }, displayName: 'Kofi' }),
    ]);

    const users = await userService.matchContacts([
      '+233 24 123 4567',
      '0240000000',
      '+233 24 123 4567',
    ]);

    expect(userDirectoryRepositoryMock.findVerifiedByPhoneNumbers).toHaveBeenCalledWith([
      '233241234567',
      '233240000000',
    ]);
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('user-2');
  });

  it('returns an empty list when every contact phone is blank', async () => {
    const users = await userService.matchContacts(['   ', '+++']);

    expect(userDirectoryRepositoryMock.findVerifiedByPhoneNumbers).not.toHaveBeenCalled();
    expect(users).toEqual([]);
  });

  it('normalizes phone numbers with and without a leading zero', () => {
    expect(normalizePhoneNumber('+233 24 123 4567')).toBe('233241234567');
    expect(normalizePhoneNumber('0241234567')).toBe('233241234567');
    expect(normalizePhoneNumber('024 123 4567')).toBe('233241234567');
    expect(normalizePhoneNumber('055 555 1234')).toBe('233555551234');
  });

  it('throws USER_NOT_FOUND when getting an unknown user', async () => {
    userRepositoryMock.findById.mockResolvedValue(null);

    await expect(userService.getProfile('user-x')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('updates the profile', async () => {
    userRepositoryMock.updateProfile.mockResolvedValue(fakeUser({ displayName: 'New' }));

    await userService.updateProfile('user-1', { displayName: 'New' });

    expect(userRepositoryMock.updateProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'New',
    });
  });

  it('rejects unsupported image types for avatar upload', async () => {
    await expect(
      userService.updateAvatar('user-1', {
        buffer: Buffer.from('x'),
        mimetype: 'text/plain',
        originalname: 'a.txt',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE', statusCode: 422 });

    expect(mediaStorageMock.uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a spoofed upload — Content-Type: image/png header but non-image bytes', async () => {
    await expect(
      userService.updateAvatar('user-1', {
        buffer: Buffer.from('this is not a png, just plain text pretending to be one'),
        mimetype: 'image/png',
        originalname: 'totally-a-photo.png',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE', statusCode: 422 });

    expect(mediaStorageMock.uploadAvatar).not.toHaveBeenCalled();
    expect(userRepositoryMock.updateAvatar).not.toHaveBeenCalled();
  });

  it('rejects a spoofed upload — Content-Type: image/jpeg header with a truncated/invalid signature', async () => {
    await expect(
      userService.updateAvatar('user-1', {
        buffer: Buffer.from([0x00, 0x00, 0x00]),
        mimetype: 'image/jpeg',
        originalname: 'fake.jpg',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE', statusCode: 422 });

    expect(mediaStorageMock.uploadAvatar).not.toHaveBeenCalled();
  });

  it('uploads an avatar and cleans up the previous one', async () => {
    userRepositoryMock.findById.mockResolvedValue(
      fakeUser({ avatar: { publicId: 'old-id', url: 'https://old', width: 1, height: 1 } }),
    );
    userRepositoryMock.updateAvatar.mockResolvedValue(fakeUser({ avatar: { publicId: 'new-id' } }));
    mediaStorageMock.uploadAvatar.mockResolvedValue({
      publicId: 'new-id',
      url: 'https://new',
      width: 512,
      height: 512,
    });

    await userService.updateAvatar('user-1', {
      buffer: VALID_PNG,
      mimetype: 'image/png',
      originalname: 'avatar.png',
    });

    expect(mediaStorageMock.uploadAvatar).toHaveBeenCalled();
    expect(mediaStorageMock.deleteByPublicId).toHaveBeenCalledWith('old-id');
    expect(userRepositoryMock.updateAvatar).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ publicId: 'new-id' }),
    );
  });

  it('accepts a genuine JPEG whose bytes match the declared mimetype', async () => {
    userRepositoryMock.findById.mockResolvedValue(fakeUser());
    userRepositoryMock.updateAvatar.mockResolvedValue(fakeUser({ avatar: { publicId: 'new-id' } }));
    mediaStorageMock.uploadAvatar.mockResolvedValue({
      publicId: 'new-id',
      url: 'https://new',
      width: 512,
      height: 512,
    });

    await userService.updateAvatar('user-1', {
      buffer: VALID_JPEG,
      mimetype: 'image/jpeg',
      originalname: 'avatar.jpg',
    });

    expect(mediaStorageMock.uploadAvatar).toHaveBeenCalled();
  });

  it('does not fail when previous avatar cleanup errors', async () => {
    userRepositoryMock.findById.mockResolvedValue(
      fakeUser({ avatar: { publicId: 'old-id', url: 'https://old', width: 1, height: 1 } }),
    );
    userRepositoryMock.updateAvatar.mockResolvedValue(fakeUser({ avatar: { publicId: 'new-id' } }));
    mediaStorageMock.uploadAvatar.mockResolvedValue({
      publicId: 'new-id',
      url: 'https://new',
      width: 512,
      height: 512,
    });
    mediaStorageMock.deleteByPublicId.mockRejectedValue(new Error('network'));

    await expect(
      userService.updateAvatar('user-1', {
        buffer: VALID_JPEG,
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg',
      }),
    ).resolves.toBeTruthy();
  });

  it('throws USER_NOT_FOUND when the user disappears mid-upload', async () => {
    userRepositoryMock.findById.mockResolvedValue(fakeUser());
    mediaStorageMock.uploadAvatar.mockResolvedValue({
      publicId: 'new-id',
      url: 'https://new',
      width: 512,
      height: 512,
    });
    userRepositoryMock.updateAvatar.mockResolvedValue(null);

    await expect(
      userService.updateAvatar('user-1', {
        buffer: VALID_PNG,
        mimetype: 'image/png',
        originalname: 'avatar.png',
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
