import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoveryBackupService } from './recoveryBackup.service.js';
import * as repoModule from './recoveryBackup.repository.js';
import { AppError } from '../../errors/AppError.js';

vi.mock('./recoveryBackup.repository.js', () => ({
  recoveryBackupRepository: {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    softDelete: vi.fn(),
  },
}));

const repo = vi.mocked(repoModule.recoveryBackupRepository);

const data = {
  ciphertext: 'Y2lwaGVy',
  iv: 'aXY=',
  salt: 'c2FsdA==',
  kdf: { algorithm: 'argon2id' as const, memoryKiB: 65536, iterations: 3, parallelism: 1 },
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recoveryBackupService.put', () => {
  it('upserts and returns updatedAt', async () => {
    const updatedAt = new Date('2026-02-02');
    repo.upsert.mockResolvedValue({ updatedAt } as never);

    const result = await recoveryBackupService.put('user-1', data);

    expect(repo.upsert).toHaveBeenCalledWith('user-1', data);
    expect(result).toEqual({ updatedAt });
  });
});

describe('recoveryBackupService.get', () => {
  it('returns the backup blob when present', async () => {
    const updatedAt = new Date('2026-02-02');
    repo.findByUserId.mockResolvedValue({ ...data, updatedAt } as never);

    const result = await recoveryBackupService.get('user-1');

    expect(result).toEqual({ ...data, updatedAt });
  });

  it('throws 404 when no backup exists', async () => {
    repo.findByUserId.mockResolvedValue(null);

    await expect(recoveryBackupService.get('user-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'RECOVERY_BACKUP_NOT_FOUND',
    });
    await expect(recoveryBackupService.get('user-1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('recoveryBackupService.status', () => {
  it('reports existence + updatedAt without returning ciphertext', async () => {
    const updatedAt = new Date('2026-02-02');
    repo.findByUserId.mockResolvedValue({ ...data, updatedAt } as never);

    const result = await recoveryBackupService.status('user-1');

    expect(result).toEqual({ exists: true, updatedAt });
  });

  it('reports exists=false when there is no backup', async () => {
    repo.findByUserId.mockResolvedValue(null);

    const result = await recoveryBackupService.status('user-1');

    expect(result).toEqual({ exists: false, updatedAt: null });
  });
});

describe('recoveryBackupService.remove', () => {
  it('soft-deletes via the repository', async () => {
    repo.softDelete.mockResolvedValue(true);

    await recoveryBackupService.remove('user-1');

    expect(repo.softDelete).toHaveBeenCalledWith('user-1');
  });
});
