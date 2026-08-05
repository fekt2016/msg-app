import {
  ensureOwnSenderKeyDistributed,
  rotateOwnSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from './groupSession';
import { keyStore } from './keyStore';
import { groupKeyStore } from './groupKeyStore';
import {
  generateSenderKey,
  importSenderKey,
  wrapSenderKeyForRecipient,
  unwrapSenderKey,
} from './groupCrypto';
import { encryptMessage, decryptMessage } from './crypto';
import { fetchKeyBundle } from './e2eeApi';
import { uploadSenderKeys, fetchSenderKey } from './groupE2eeApi';

// Test-local mocks: factories are self-contained (no outer bindings) so Jest's
// hoisting cannot leave a method undefined — see CLAUDE.md §10.
jest.mock('./keyStore', () => ({ keyStore: { getKeyBundle: jest.fn() } }));
jest.mock('./groupKeyStore', () => ({
  groupKeyStore: {
    getOwnSenderKey: jest.fn(),
    saveOwnSenderKey: jest.fn(),
    getReceivedSenderKey: jest.fn(),
    saveReceivedSenderKey: jest.fn(),
    clearGroup: jest.fn(),
  },
}));
jest.mock('./groupCrypto', () => ({
  generateSenderKey: jest.fn(),
  importSenderKey: jest.fn(),
  wrapSenderKeyForRecipient: jest.fn(),
  unwrapSenderKey: jest.fn(),
}));
jest.mock('./crypto', () => ({ encryptMessage: jest.fn(), decryptMessage: jest.fn() }));
jest.mock('./e2eeApi', () => ({ fetchKeyBundle: jest.fn() }));
jest.mock('./groupE2eeApi', () => ({ uploadSenderKeys: jest.fn(), fetchSenderKey: jest.fn() }));

const mockGetKeyBundle = keyStore.getKeyBundle as jest.Mock;
const mockGetOwn = groupKeyStore.getOwnSenderKey as jest.Mock;
const mockSaveOwn = groupKeyStore.saveOwnSenderKey as jest.Mock;
const mockGetReceived = groupKeyStore.getReceivedSenderKey as jest.Mock;
const mockSaveReceived = groupKeyStore.saveReceivedSenderKey as jest.Mock;
const mockClearGroup = groupKeyStore.clearGroup as jest.Mock;
const mockGenerate = generateSenderKey as jest.Mock;
const mockImport = importSenderKey as jest.Mock;
const mockWrap = wrapSenderKeyForRecipient as jest.Mock;
const mockUnwrap = unwrapSenderKey as jest.Mock;
const mockEncrypt = encryptMessage as jest.Mock;
const mockDecrypt = decryptMessage as jest.Mock;
const mockFetchBundle = fetchKeyBundle as jest.Mock;
const mockUpload = uploadSenderKeys as jest.Mock;
const mockFetchSenderKey = fetchSenderKey as jest.Mock;

const OWN_BUNDLE = { identityKey: { privateKey: 'own-priv', publicKey: 'own-pub' } };
const GID = 'g-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetKeyBundle.mockResolvedValue(OWN_BUNDLE);
});

describe('ensureOwnSenderKeyDistributed', () => {
  it('generates a key when absent and wraps it for every other member', async () => {
    mockGetOwn.mockResolvedValue(null);
    mockGenerate.mockResolvedValue('AAAA'); // valid base64
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'peer-pub' } });
    mockWrap.mockResolvedValue({ keyId: 7, ciphertext: 'ct', iv: 'iv' });

    await ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me');

    expect(mockSaveOwn).toHaveBeenCalledWith(GID, 'AAAA');
    expect(mockWrap).toHaveBeenCalledTimes(1); // only u2, not self
    expect(mockUpload).toHaveBeenCalledWith(GID, [
      { recipientId: 'u2', keyId: 7, ciphertext: 'ct', iv: 'iv', createdAt: '' },
    ]);
  });

  it('reuses an existing sender key and skips members without a bundle', async () => {
    mockGetOwn.mockResolvedValue('BBBB');
    mockFetchBundle.mockResolvedValue(null);

    await ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me');

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('throws when there is no local key bundle', async () => {
    mockGetKeyBundle.mockResolvedValue(null);
    await expect(ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me')).rejects.toThrow();
  });
});

describe('encryptGroupMessage', () => {
  it('encrypts with the imported own sender key', async () => {
    mockGetOwn.mockResolvedValue('AAAA');
    mockImport.mockResolvedValue('cryptokey');
    mockEncrypt.mockResolvedValue({ ciphertext: 'ct', iv: 'iv' });

    const result = await encryptGroupMessage(GID, 'hello');
    expect(mockImport).toHaveBeenCalledWith('AAAA');
    expect(mockEncrypt).toHaveBeenCalledWith('cryptokey', 'hello');
    expect(result).toEqual({ ciphertext: 'ct', iv: 'iv' });
  });

  it('throws when no sender key is established', async () => {
    mockGetOwn.mockResolvedValue(null);
    await expect(encryptGroupMessage(GID, 'hello')).rejects.toThrow();
  });
});

describe('decryptGroupMessage', () => {
  it('fetches and unwraps a sender key the first time, then decrypts', async () => {
    mockGetReceived.mockResolvedValue(null);
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'sender-pub' } });
    mockFetchSenderKey.mockResolvedValue({ keyId: 5, ciphertext: 'wc', iv: 'wi' });
    mockUnwrap.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockImport.mockResolvedValue('cryptokey');
    mockDecrypt.mockResolvedValue('plain');

    const result = await decryptGroupMessage(GID, 'sender', 'ct', 'iv');

    expect(mockUnwrap).toHaveBeenCalledWith(
      { ciphertext: 'wc', iv: 'wi' },
      'own-priv',
      'sender-pub',
    );
    expect(mockSaveReceived).toHaveBeenCalledWith(GID, 'sender', 'AQID', 5); // btoa([1,2,3])
    expect(mockDecrypt).toHaveBeenCalledWith('cryptokey', 'ct', 'iv');
    expect(result).toBe('plain');
  });

  it('uses a cached sender key without re-fetching', async () => {
    mockGetReceived.mockResolvedValue('CCCC');
    mockImport.mockResolvedValue('cryptokey');
    mockDecrypt.mockResolvedValue('plain');

    await decryptGroupMessage(GID, 'sender', 'ct', 'iv');
    expect(mockFetchSenderKey).not.toHaveBeenCalled();
    expect(mockImport).toHaveBeenCalledWith('CCCC');
  });
});

describe('rotateOwnSenderKey', () => {
  it('clears the old key then redistributes a fresh one', async () => {
    mockGetOwn.mockResolvedValue(null);
    mockGenerate.mockResolvedValue('DDDD');
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'peer-pub' } });
    mockWrap.mockResolvedValue({ keyId: 9, ciphertext: 'ct', iv: 'iv' });

    await rotateOwnSenderKey(GID, ['me', 'u2'], 'me');

    expect(mockClearGroup).toHaveBeenCalledWith(GID);
    expect(mockUpload).toHaveBeenCalled();
  });
});
