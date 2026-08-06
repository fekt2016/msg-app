import {
  putRecoveryBackup,
  fetchRecoveryBackup,
  fetchRecoveryBackupStatus,
  deleteRecoveryBackup,
} from './recoveryApi';
import { apiClient } from '../api/client';

// Test-local mock: self-contained factory (CLAUDE.md §10).
jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPut = apiClient.put as jest.Mock;
const mockDelete = apiClient.delete as jest.Mock;

const blob = {
  ciphertext: 'Y2lwaGVy',
  iv: 'aXY=',
  salt: 'c2FsdA==',
  kdf: { algorithm: 'argon2id' as const, memoryKiB: 19456, iterations: 2, parallelism: 1 },
  version: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recoveryApi', () => {
  it('PUTs the backup blob to /e2ee/recovery', async () => {
    mockPut.mockResolvedValue({ data: { success: true, data: { updatedAt: 'x' } } });

    await putRecoveryBackup(blob);

    expect(mockPut).toHaveBeenCalledWith('/e2ee/recovery', blob);
  });

  it('GETs and unwraps the backup blob', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: blob } });

    const result = await fetchRecoveryBackup();

    expect(mockGet).toHaveBeenCalledWith('/e2ee/recovery');
    expect(result).toEqual(blob);
  });

  it('GETs and unwraps the status', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { exists: true, updatedAt: '2026-01-01' } },
    });

    const result = await fetchRecoveryBackupStatus();

    expect(mockGet).toHaveBeenCalledWith('/e2ee/recovery/status');
    expect(result).toEqual({ exists: true, updatedAt: '2026-01-01' });
  });

  it('DELETEs the backup', async () => {
    mockDelete.mockResolvedValue({ data: { success: true, data: { deleted: true } } });

    await deleteRecoveryBackup();

    expect(mockDelete).toHaveBeenCalledWith('/e2ee/recovery');
  });
});
