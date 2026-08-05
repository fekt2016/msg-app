import {
  uploadKeyBundle,
  fetchKeyBundle,
  rotateSignedPreKey,
  rotateOneTimePreKeys,
  consumeOneTimePreKeys,
  sendEncryptedMessage,
  deleteKeyBundle,
} from './e2eeApi';
import { apiClient } from '../api/client';
import { generateE2eeKeys, getPublicKeyBundle } from './crypto';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

describe('e2eeApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads only public key material to /e2ee/keys', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: undefined } });

    // Build a REAL local bundle, then upload only its public projection.
    const local = await generateE2eeKeys(1, 1);
    const publicBundle = getPublicKeyBundle(local);

    await uploadKeyBundle(publicBundle);

    expect(mockClient.post).toHaveBeenCalledWith('/e2ee/keys', publicBundle);
    const sentBody = JSON.stringify(mockClient.post.mock.calls[0][1]);
    // The wire payload must not contain any private key material.
    expect(sentBody).not.toContain(local.identityKey.privateKey);
    expect(sentBody).not.toContain(local.identityKey.signingPrivateKey);
    expect(sentBody).not.toContain(local.signedPreKey.privateKey);
    expect(sentBody).not.toMatch(/privateKey|signingPrivateKey/);
  }, 20000);

  it('fetches a peer public bundle', async () => {
    const bundle = {
      identityKey: { publicKey: 'p', signingPublicKey: 's' },
      signedPreKey: { keyId: 1, publicKey: 'spk', signature: 'sig' },
      preKeys: [],
      oneTimePreKeys: [],
    };
    mockClient.get.mockResolvedValue({ data: { success: true, data: bundle } });

    await expect(fetchKeyBundle('user-2')).resolves.toEqual(bundle);
    expect(mockClient.get).toHaveBeenCalledWith('/e2ee/keys/user-2');
  });

  it('rotates the signed pre-key with a signature body', async () => {
    mockClient.put.mockResolvedValue({ data: { success: true, data: undefined } });
    await rotateSignedPreKey({ keyId: 2, publicKey: 'spk2', signature: 'sig2' });
    expect(mockClient.put).toHaveBeenCalledWith('/e2ee/keys/signed-pre-key', {
      signedPreKey: { keyId: 2, publicKey: 'spk2', signature: 'sig2' },
    });
  });

  it('rotates one-time pre-keys', async () => {
    mockClient.put.mockResolvedValue({ data: { success: true, data: undefined } });
    await rotateOneTimePreKeys([{ keyId: 1002, publicKey: 'otk2' }]);
    expect(mockClient.put).toHaveBeenCalledWith('/e2ee/keys/one-time-pre-keys', {
      oneTimePreKeys: [{ keyId: 1002, publicKey: 'otk2' }],
    });
  });

  it('consumes one-time pre-keys', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: undefined } });
    await consumeOneTimePreKeys([1001, 1002]);
    expect(mockClient.post).toHaveBeenCalledWith('/e2ee/keys/one-time-pre-keys/consume', {
      keyIds: [1001, 1002],
    });
  });

  it('sends an encrypted message envelope', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: undefined } });
    const msg = { senderId: 'u1', recipientId: 'u2', ciphertext: 'ct', timestamp: 1 };
    await sendEncryptedMessage(msg);
    expect(mockClient.post).toHaveBeenCalledWith('/e2ee/messages', msg);
  });

  it('deletes the key bundle', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: undefined } });
    await deleteKeyBundle();
    expect(mockClient.delete).toHaveBeenCalledWith('/e2ee/keys');
  });
});
