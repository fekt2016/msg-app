import {
  enableRecoveryBackup,
  restoreFromRecoveryPhrase,
  getRecoveryBackupStatus,
  disableRecoveryBackup,
  newRecoveryPhrase,
  NoLocalIdentityError,
} from './recoverySession';
import { keyStore } from './keyStore';
import { restoreE2eeKeys } from './ensureKeys';
import { createRecoveryBackup, restoreRecoveryBackup, generateRecoveryPhrase } from './recovery';
import {
  putRecoveryBackup,
  fetchRecoveryBackup,
  fetchRecoveryBackupStatus,
  deleteRecoveryBackup,
} from './recoveryApi';

// Test-local mocks: self-contained factories (CLAUDE.md §10).
jest.mock('./keyStore', () => ({ keyStore: { getKeyBundle: jest.fn() } }));
jest.mock('./ensureKeys', () => ({ restoreE2eeKeys: jest.fn() }));
jest.mock('./recovery', () => ({
  createRecoveryBackup: jest.fn(),
  restoreRecoveryBackup: jest.fn(),
  generateRecoveryPhrase: jest.fn(),
}));
jest.mock('./recoveryApi', () => ({
  putRecoveryBackup: jest.fn(),
  fetchRecoveryBackup: jest.fn(),
  fetchRecoveryBackupStatus: jest.fn(),
  deleteRecoveryBackup: jest.fn(),
}));

const mockGetKeyBundle = keyStore.getKeyBundle as jest.Mock;
const mockRestoreKeys = restoreE2eeKeys as jest.Mock;
const mockCreateBackup = createRecoveryBackup as jest.Mock;
const mockRestoreBackup = restoreRecoveryBackup as jest.Mock;
const mockGeneratePhrase = generateRecoveryPhrase as jest.Mock;
const mockPut = putRecoveryBackup as jest.Mock;
const mockFetch = fetchRecoveryBackup as jest.Mock;
const mockStatus = fetchRecoveryBackupStatus as jest.Mock;
const mockDelete = deleteRecoveryBackup as jest.Mock;

const bundle = { identityKey: { privateKey: 'priv' } };
const blob = { ciphertext: 'ct', iv: 'iv', salt: 'salt', kdf: {}, version: 1 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enableRecoveryBackup', () => {
  it('encrypts the local bundle and uploads it', async () => {
    mockGetKeyBundle.mockResolvedValue(bundle);
    mockCreateBackup.mockReturnValue(blob);
    mockPut.mockResolvedValue(undefined);

    await enableRecoveryBackup('some phrase');

    expect(mockCreateBackup).toHaveBeenCalledWith(bundle, 'some phrase');
    expect(mockPut).toHaveBeenCalledWith(blob);
  });

  it('throws NoLocalIdentityError and never uploads when the device has no bundle', async () => {
    mockGetKeyBundle.mockResolvedValue(null);

    await expect(enableRecoveryBackup('some phrase')).rejects.toBeInstanceOf(NoLocalIdentityError);
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe('restoreFromRecoveryPhrase', () => {
  it('downloads, decrypts, and installs the recovered identity', async () => {
    mockFetch.mockResolvedValue(blob);
    mockRestoreBackup.mockReturnValue(bundle);
    mockRestoreKeys.mockResolvedValue(undefined);

    await restoreFromRecoveryPhrase('user-1', 'the phrase');

    expect(mockFetch).toHaveBeenCalled();
    expect(mockRestoreBackup).toHaveBeenCalledWith(blob, 'the phrase');
    expect(mockRestoreKeys).toHaveBeenCalledWith('user-1', bundle);
  });

  it('propagates a decrypt failure and never installs keys', async () => {
    mockFetch.mockResolvedValue(blob);
    mockRestoreBackup.mockImplementation(() => {
      throw new Error('bad phrase');
    });

    await expect(restoreFromRecoveryPhrase('user-1', 'wrong')).rejects.toThrow('bad phrase');
    expect(mockRestoreKeys).not.toHaveBeenCalled();
  });
});

describe('passthrough helpers', () => {
  it('newRecoveryPhrase delegates to the crypto module', () => {
    mockGeneratePhrase.mockReturnValue('a b c');
    expect(newRecoveryPhrase()).toBe('a b c');
  });

  it('getRecoveryBackupStatus delegates to the API', async () => {
    mockStatus.mockResolvedValue({ exists: true, updatedAt: '2026-01-01' });
    await expect(getRecoveryBackupStatus()).resolves.toEqual({
      exists: true,
      updatedAt: '2026-01-01',
    });
  });

  it('disableRecoveryBackup delegates to the API', async () => {
    mockDelete.mockResolvedValue(undefined);
    await disableRecoveryBackup();
    expect(mockDelete).toHaveBeenCalled();
  });
});
