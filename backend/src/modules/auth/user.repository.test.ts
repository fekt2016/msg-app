import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./user.model.js', () => ({
  UserModel: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    exists: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import { UserModel } from './user.model.js';
import { toSafeUser, userRepository } from './user.repository.js';

function doc(overrides = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'test@example.com',
    phone: undefined,
    displayName: 'Test User',
    role: 'USER',
    status: 'PENDING',
    isVerified: false,
    ...overrides,
  } as never;
}

const mockModel = vi.mocked(UserModel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toSafeUser', () => {
  it('maps a user document without exposing the password hash', () => {
    const safe = toSafeUser(doc());
    expect(safe).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      phone: undefined,
      displayName: 'Test User',
      bio: '',
      avatar: null,
      role: 'USER',
      status: 'PENDING',
      isVerified: false,
    });
    expect(safe).not.toHaveProperty('passwordHash');
  });

  it('maps an avatar when present', () => {
    const safe = toSafeUser(
      doc({ avatar: { publicId: 'abc', url: 'https://cdn/abc', width: 512, height: 512 } }),
    );
    expect(safe.avatar).toEqual({
      publicId: 'abc',
      url: 'https://cdn/abc',
      width: 512,
      height: 512,
    });
  });
});

describe('userRepository', () => {
  it('creates a user', async () => {
    mockModel.create.mockResolvedValue(doc());
    await userRepository.create({
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hash',
    });
    expect(mockModel.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hash',
    });
  });

  it('finds by id', async () => {
    mockModel.findById.mockResolvedValue(doc());
    const found = await userRepository.findById('user-1');
    expect(found).not.toBeNull();
    expect(mockModel.findById).toHaveBeenCalledWith('user-1');
  });

  it('finds by email identifier', async () => {
    mockModel.findOne.mockResolvedValue(doc());
    await userRepository.findByIdentifier('a@b.com');
    expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('finds by phone identifier', async () => {
    mockModel.findOne.mockResolvedValue(doc());
    await userRepository.findByIdentifier('+254700000000');
    expect(mockModel.findOne).toHaveBeenCalledWith({ phone: '+254700000000' });
  });

  it('selects the password hash when authenticating', async () => {
    const chain = vi.fn();
    mockModel.findOne.mockReturnValue({ select: chain });
    chain.mockResolvedValue(doc());
    await userRepository.findByIdentifierWithPassword('a@b.com');
    expect(chain).toHaveBeenCalledWith('+passwordHash');
  });

  it('checks existence by email', async () => {
    mockModel.exists.mockResolvedValue({ _id: 'x' } as never);
    const exists = await userRepository.exists('a@b.com');
    expect(exists).toBe(true);
    expect(mockModel.exists).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('checks existence by phone and returns false when absent', async () => {
    mockModel.exists.mockResolvedValue(null);
    const exists = await userRepository.exists('+254700000000');
    expect(exists).toBe(false);
  });

  it('marks a user verified', async () => {
    mockModel.findByIdAndUpdate.mockResolvedValue(doc({ isVerified: true, status: 'VERIFIED' }));
    await userRepository.markVerified('user-1');
    expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      { isVerified: true, status: 'VERIFIED' },
      { new: true },
    );
  });

  it('touches last login', async () => {
    mockModel.findByIdAndUpdate.mockResolvedValue(doc());
    await userRepository.touchLastLogin('user-1');
    expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    );
  });
});
