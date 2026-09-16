import { resolveRecoveryPrompt } from './recoveryPrompt';
import { getRecoveryBackupStatus } from './recoverySession';

jest.mock('./recoverySession', () => ({
  getRecoveryBackupStatus: jest.fn(),
}));

const mockStatus = getRecoveryBackupStatus as jest.Mock;

describe('resolveRecoveryPrompt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns "none" for an existing identity without ever checking the server', async () => {
    expect(await resolveRecoveryPrompt(false)).toBe('none');
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('returns "restore" when a fresh identity was created and a server backup exists', async () => {
    mockStatus.mockResolvedValue({ exists: true });
    expect(await resolveRecoveryPrompt(true)).toBe('restore');
  });

  it('returns "backup" when a fresh identity was created and no server backup exists', async () => {
    mockStatus.mockResolvedValue({ exists: false });
    expect(await resolveRecoveryPrompt(true)).toBe('backup');
  });

  it('degrades to "none" when the status lookup fails (never spams/blocks the user)', async () => {
    mockStatus.mockRejectedValue(new Error('offline'));
    expect(await resolveRecoveryPrompt(true)).toBe('none');
  });
});
