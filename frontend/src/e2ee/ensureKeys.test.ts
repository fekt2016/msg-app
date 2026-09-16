import * as SecureStore from 'expo-secure-store';
import { ensureE2eeKeysRegistered } from './ensureKeys';
import { keyStore } from './keyStore';
import { generateE2eeKeys } from './crypto';
import { uploadKeyBundle, fetchKeyBundle } from './e2eeApi';
import { isApiError } from '../api/client';

jest.mock('./keyStore', () => ({
  keyStore: { getKeyBundle: jest.fn(), saveKeyBundle: jest.fn() },
}));
jest.mock('./crypto', () => ({
  generateE2eeKeys: jest.fn(),
  getPublicKeyBundle: jest.fn(() => ({ public: true })),
}));
jest.mock('./e2eeApi', () => ({ uploadKeyBundle: jest.fn(), fetchKeyBundle: jest.fn() }));
// isApiError is the only thing pulled from the api client here; the reconcile
// path uses it to distinguish a 404 (absent directory bundle) from a transient
// network failure. Default to false; the 404 test overrides it.
jest.mock('../api/client', () => ({ isApiError: jest.fn(() => false) }));

const mockGetKeyBundle = keyStore.getKeyBundle as jest.Mock;
const mockSaveKeyBundle = keyStore.saveKeyBundle as jest.Mock;
const mockGenerate = generateE2eeKeys as jest.Mock;
const mockUpload = uploadKeyBundle as jest.Mock;
const mockFetch = fetchKeyBundle as jest.Mock;
const mockIsApiError = isApiError as unknown as jest.Mock;
const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

// Local bundle carries the CURRENT device identity public key. Reconciliation
// compares this against whatever the directory currently serves for us.
const LOCAL_PUB = 'PUB_LOCAL';
const BUNDLE = {
  identityKey: { publicKey: LOCAL_PUB },
  signedPreKey: {},
  preKeys: [],
  oneTimePreKeys: [],
};

const USER_ID = 'user-a';
const uploadedFlag = `e2ee_public_bundle_uploaded_${USER_ID}`;

function setStored({ owner, uploaded }: { owner: string | null; uploaded: boolean }) {
  mockSecure.getItemAsync.mockImplementation(async (key: string) => {
    if (key === 'e2ee_bundle_owner_user') return owner;
    if (key === uploadedFlag) return uploaded ? 'true' : null;
    return null;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setStored({ owner: USER_ID, uploaded: false });
  mockSecure.setItemAsync.mockResolvedValue(undefined);
  mockIsApiError.mockReturnValue(false);
  // Default: server is unreachable (indeterminate). Individual tests override to
  // simulate a matching, differing, or absent directory entry.
  mockFetch.mockRejectedValue(new Error('offline'));
});

describe('ensureE2eeKeysRegistered', () => {
  it('generates, persists, and uploads a bundle when none exists', async () => {
    mockGetKeyBundle.mockResolvedValue(null);
    mockGenerate.mockResolvedValue(BUNDLE);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockSaveKeyBundle).toHaveBeenCalledWith(BUNDLE);
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
    // A freshly generated identity is published unconditionally — no need to
    // ask the directory what it currently holds.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(uploadedFlag, 'true');
  });

  it('re-uploads when the server holds a DIFFERENT identity key even if the local flag is set', async () => {
    // The exact bug: a second/re-provisioned device overwrote the directory, so
    // it serves a key this device does not hold. The stale local "uploaded" flag
    // must not suppress the corrective re-publish.
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: true });
    mockFetch.mockResolvedValue({ identityKey: { publicKey: 'PUB_SERVER_STALE' } });

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(USER_ID);
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
  });

  it('re-uploads when the server has NO bundle (404) even if the local flag is set', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: true });
    mockFetch.mockRejectedValue({ response: { status: 404 } });
    mockIsApiError.mockReturnValue(true);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
  });

  it('does NOT re-upload when the server already holds our current identity key', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: true });
    mockFetch.mockResolvedValue({ identityKey: { publicKey: LOCAL_PUB } });

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(USER_ID);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('records the upload flag (without a redundant upload) when the server matches but the flag was lost', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: false });
    mockFetch.mockResolvedValue({ identityKey: { publicKey: LOCAL_PUB } });

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(uploadedFlag, 'true');
  });

  it('self-heals a never-published bundle when the directory is unreachable (indeterminate + no flag)', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: false });
    // mockFetch rejects with a generic (non-404) error → indeterminate.

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
  });

  it('does not upload on an indeterminate check when we have already published before', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: USER_ID, uploaded: true });
    // mockFetch rejects with a generic (non-404) error → indeterminate; the flag
    // says we published, so avoid hammering uploads while offline.

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('regenerates and uploads when the local bundle belongs to a different user', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    setStored({ owner: 'user-b', uploaded: false });
    mockGenerate.mockResolvedValue(BUNDLE);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockSaveKeyBundle).toHaveBeenCalledWith(BUNDLE);
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
    // Regeneration is a fresh identity → published unconditionally, no fetch.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('e2ee_bundle_owner_user', USER_ID);
  });
});
