import * as SecureStore from 'expo-secure-store';
import { ensureE2eeKeysRegistered } from './ensureKeys';
import { keyStore } from './keyStore';
import { generateE2eeKeys } from './crypto';
import { uploadKeyBundle } from './e2eeApi';

jest.mock('./keyStore', () => ({
  keyStore: { getKeyBundle: jest.fn(), saveKeyBundle: jest.fn() },
}));
jest.mock('./crypto', () => ({
  generateE2eeKeys: jest.fn(),
  getPublicKeyBundle: jest.fn(() => ({ public: true })),
}));
jest.mock('./e2eeApi', () => ({ uploadKeyBundle: jest.fn() }));

const mockGetKeyBundle = keyStore.getKeyBundle as jest.Mock;
const mockSaveKeyBundle = keyStore.saveKeyBundle as jest.Mock;
const mockGenerate = generateE2eeKeys as jest.Mock;
const mockUpload = uploadKeyBundle as jest.Mock;
const mockSecure = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

const BUNDLE = { identityKey: {}, signedPreKey: {}, preKeys: [], oneTimePreKeys: [] };

const USER_ID = 'user-a';

beforeEach(() => {
  jest.clearAllMocks();
  mockSecure.getItemAsync.mockImplementation(async (key: string) => {
    if (key === 'e2ee_bundle_owner_user') return USER_ID;
    if (key === `e2ee_public_bundle_uploaded_${USER_ID}`) return null;
    return null;
  });
  mockSecure.setItemAsync.mockResolvedValue(undefined);
});

describe('ensureE2eeKeysRegistered', () => {
  it('generates, persists, and uploads a bundle when none exists', async () => {
    mockGetKeyBundle.mockResolvedValue(null);
    mockGenerate.mockResolvedValue(BUNDLE);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockSaveKeyBundle).toHaveBeenCalledWith(BUNDLE);
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(
      `e2ee_public_bundle_uploaded_${USER_ID}`,
      'true',
    );
  });

  it('uploads an existing local bundle that was never published (self-heals)', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
  });

  it('does nothing when the bundle already exists and was uploaded', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    mockSecure.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'e2ee_bundle_owner_user') return USER_ID;
      if (key === `e2ee_public_bundle_uploaded_${USER_ID}`) return 'true';
      return null;
    });

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('regenerates and uploads when the local bundle belongs to a different user', async () => {
    mockGetKeyBundle.mockResolvedValue(BUNDLE);
    mockSecure.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'e2ee_bundle_owner_user') return 'user-b';
      if (key === `e2ee_public_bundle_uploaded_${USER_ID}`) return null;
      return null;
    });
    mockGenerate.mockResolvedValue(BUNDLE);

    await ensureE2eeKeysRegistered(USER_ID);

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockSaveKeyBundle).toHaveBeenCalledWith(BUNDLE);
    expect(mockUpload).toHaveBeenCalledWith({ public: true });
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('e2ee_bundle_owner_user', USER_ID);
  });
});
