import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./session.model.js', () => ({
  SessionModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

import { SessionModel } from './session.model.js';
import { sessionRepository } from './session.repository.js';

const mockModel = vi.mocked(SessionModel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sessionRepository', () => {
  it('creates a session', async () => {
    mockModel.create.mockResolvedValue({});
    await sessionRepository.create({
      userId: 'user-1',
      deviceId: 'd1',
      jti: 'j1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(),
    });
    expect(mockModel.create).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'd1',
      jti: 'j1',
      refreshTokenHash: 'hash',
      expiresAt: expect.any(Date),
    });
  });

  it('finds by jti', async () => {
    mockModel.findOne.mockResolvedValue({});
    await sessionRepository.findByJti('j1');
    expect(mockModel.findOne).toHaveBeenCalledWith({ jti: 'j1' });
  });

  it('revokes by jti', async () => {
    await sessionRepository.revokeByJti('j1');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { jti: 'j1' },
      { revokedAt: expect.any(Date) },
    );
  });

  it('revokes an entire device family', async () => {
    await sessionRepository.revokeFamily('user-1', 'd1');
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', deviceId: 'd1', revokedAt: null },
      { revokedAt: expect.any(Date) },
    );
  });

  it('touches last used', async () => {
    await sessionRepository.touch('j1');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { jti: 'j1' },
      { lastUsedAt: expect.any(Date) },
    );
  });
});
