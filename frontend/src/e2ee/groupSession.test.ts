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
    getOwnSenderKeyId: jest.fn(),
    saveOwnSenderKey: jest.fn(),
    getReceivedSenderKey: jest.fn(),
    getReceivedSenderKeyId: jest.fn(),
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
const mockGetOwnId = groupKeyStore.getOwnSenderKeyId as jest.Mock;
const mockSaveOwn = groupKeyStore.saveOwnSenderKey as jest.Mock;
const mockGetReceived = groupKeyStore.getReceivedSenderKey as jest.Mock;
const mockGetReceivedId = groupKeyStore.getReceivedSenderKeyId as jest.Mock;
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
  mockGetOwnId.mockResolvedValue(null);
  mockGetReceivedId.mockResolvedValue(null);
});

describe('ensureOwnSenderKeyDistributed', () => {
  it('generates a key + keyId when absent and wraps it for every other member with the same keyId', async () => {
    mockGetOwn.mockResolvedValue(null);
    mockGenerate.mockResolvedValue('AAAA'); // valid base64
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'peer-pub' } });
    mockWrap.mockResolvedValue({ ciphertext: 'ct', iv: 'iv' });

    await ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me');

    // A single stable keyId is minted for the new key, persisted, and reused for
    // every recipient envelope — never a fresh Date.now() per recipient.
    expect(mockSaveOwn).toHaveBeenCalledWith(GID, 'AAAA', expect.any(Number));
    const savedKeyId = mockSaveOwn.mock.calls[0][2] as number;
    expect(mockWrap).toHaveBeenCalledTimes(1); // only u2, not self
    expect(mockUpload).toHaveBeenCalledWith(GID, [
      { recipientId: 'u2', keyId: savedKeyId, ciphertext: 'ct', iv: 'iv', createdAt: '' },
    ]);
  });

  it('reuses an existing sender key + keyId and skips members without a bundle', async () => {
    mockGetOwn.mockResolvedValue('BBBB');
    mockGetOwnId.mockResolvedValue(11);
    mockFetchBundle.mockResolvedValue(null);

    await ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me');

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSaveOwn).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('throws when there is no local key bundle', async () => {
    mockGetKeyBundle.mockResolvedValue(null);
    await expect(ensureOwnSenderKeyDistributed(GID, ['me', 'u2'], 'me')).rejects.toThrow();
  });
});

describe('encryptGroupMessage', () => {
  it('encrypts with the imported own sender key and returns the current keyId', async () => {
    mockGetOwn.mockResolvedValue('AAAA');
    mockGetOwnId.mockResolvedValue(21);
    mockImport.mockResolvedValue('cryptokey');
    mockEncrypt.mockResolvedValue({ ciphertext: 'ct', iv: 'iv' });

    const result = await encryptGroupMessage(GID, 'hello');
    expect(mockImport).toHaveBeenCalledWith('AAAA');
    expect(mockEncrypt).toHaveBeenCalledWith('cryptokey', 'hello');
    expect(result).toEqual({ ciphertext: 'ct', iv: 'iv', keyId: 21 });
  });

  it('throws when no sender key is established', async () => {
    mockGetOwn.mockResolvedValue(null);
    await expect(encryptGroupMessage(GID, 'hello')).rejects.toThrow();
  });
});

describe('decryptGroupMessage', () => {
  it('fetches and unwraps a sender key the first time, then decrypts', async () => {
    mockGetReceived.mockResolvedValue(null);
    mockGetReceivedId.mockResolvedValue(null);
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'sender-pub' } });
    mockFetchSenderKey.mockResolvedValue({ keyId: 5, ciphertext: 'wc', iv: 'wi' });
    mockUnwrap.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockImport.mockResolvedValue('cryptokey');
    mockDecrypt.mockResolvedValue('plain');

    const result = await decryptGroupMessage(GID, 'sender', 5, 'ct', 'iv');

    expect(mockUnwrap).toHaveBeenCalledWith(
      { ciphertext: 'wc', iv: 'wi' },
      'own-priv',
      'sender-pub',
    );
    expect(mockSaveReceived).toHaveBeenCalledWith(GID, 'sender', 'AQID', 5); // btoa([1,2,3])
    expect(mockDecrypt).toHaveBeenCalledWith('cryptokey', 'ct', 'iv');
    expect(result).toBe('plain');
  });

  it('uses a cached sender key without re-fetching when the keyId matches', async () => {
    mockGetReceived.mockResolvedValue('CCCC');
    mockGetReceivedId.mockResolvedValue(9);
    mockImport.mockResolvedValue('cryptokey');
    mockDecrypt.mockResolvedValue('plain');

    await decryptGroupMessage(GID, 'sender', 9, 'ct', 'iv');
    expect(mockFetchSenderKey).not.toHaveBeenCalled();
    expect(mockImport).toHaveBeenCalledWith('CCCC');
  });

  // Regression (Bug 1 — BLOCKING): after a departure-triggered rotation a peer
  // sends with a NEW keyId while we still hold the OLD received key cached. The
  // decrypt path must notice keyId != cachedKeyId and re-fetch/unwrap the fresh
  // envelope instead of blindly using the stale key (which fails AES-GCM).
  it('re-fetches and overwrites the cached key when the incoming keyId is newer', async () => {
    mockGetReceived.mockResolvedValue('OLD-KEY'); // stale cached key present
    mockGetReceivedId.mockResolvedValue(9); // cached epoch
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'sender-pub' } });
    mockFetchSenderKey.mockResolvedValue({ keyId: 10, ciphertext: 'wc2', iv: 'wi2' });
    mockUnwrap.mockResolvedValue(new Uint8Array([9, 9, 9]));
    mockImport.mockResolvedValue('cryptokey');
    mockDecrypt.mockResolvedValue('plain-after-rotation');

    // Incoming message carries the rotated keyId (10), not the cached one (9).
    const result = await decryptGroupMessage(GID, 'sender', 10, 'ct', 'iv');

    expect(mockFetchSenderKey).toHaveBeenCalledWith(GID, 'sender');
    expect(mockSaveReceived).toHaveBeenCalledWith(GID, 'sender', expect.any(String), 10);
    expect(result).toBe('plain-after-rotation');
  });
});

describe('rotateOwnSenderKey', () => {
  it('generates a fresh key with a strictly-newer keyId and distributes it', async () => {
    mockGetOwnId.mockResolvedValue(100);
    mockGenerate.mockResolvedValue('DDDD');
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'peer-pub' } });
    mockWrap.mockResolvedValue({ ciphertext: 'ct', iv: 'iv' });

    await rotateOwnSenderKey(GID, ['me', 'u2'], 'me');

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalled();
    // Persisted only after a successful distribute, with a keyId strictly newer
    // than the previous one so receivers detect the change.
    expect(mockSaveOwn).toHaveBeenCalledWith(GID, 'DDDD', expect.any(Number));
    const newKeyId = mockSaveOwn.mock.calls[0][2] as number;
    expect(newKeyId).toBeGreaterThan(100);
  });

  // Regression (Bug 2 — HIGH): rotation must be failure-safe. The old code
  // cleared the key BEFORE redistributing, so a distribution failure left the
  // member with NO key (unable to send at all). Now the old key is never
  // discarded and the new key is only persisted after a successful distribute.
  it('does not discard or overwrite the old key when distribution fails', async () => {
    mockGetOwnId.mockResolvedValue(100);
    mockGenerate.mockResolvedValue('DDDD');
    mockFetchBundle.mockResolvedValue({ identityKey: { publicKey: 'peer-pub' } });
    mockWrap.mockResolvedValue({ ciphertext: 'ct', iv: 'iv' });
    mockUpload.mockRejectedValue(new Error('network down'));

    await expect(rotateOwnSenderKey(GID, ['me', 'u2'], 'me')).rejects.toThrow('network down');

    // The old key is left intact — never cleared, never overwritten.
    expect(mockClearGroup).not.toHaveBeenCalled();
    expect(mockSaveOwn).not.toHaveBeenCalled();
  });
});
