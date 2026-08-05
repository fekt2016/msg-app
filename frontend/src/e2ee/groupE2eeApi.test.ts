import * as groupE2eeApi from './groupE2eeApi';
import { apiClient } from '../api/client';

// ../api/client is not globally mocked; define the mock fns inline in the
// factory so they exist when babel-hoisted jest.mock runs, then take typed
// access to the real (now-mocked) apiClient binding for assertions.
jest.mock('../api/client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

describe('groupE2eeApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploadSenderKeys POSTs envelopes', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { envelopes: [] } },
    });

    await groupE2eeApi.uploadSenderKeys('g-1', []);

    expect(mockClient.post).toHaveBeenCalledWith('/e2ee/groups/g-1/sender-keys', { envelopes: [] });
  });

  it('fetchSenderKey GETs the caller envelope', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          recipientId: 'user-1',
          keyId: 1,
          ciphertext: 'x',
          iv: 'y',
          createdAt: '2026-01-01',
        },
      },
    });

    const result = await groupE2eeApi.fetchSenderKey('g-1', 'sender-1');

    expect(mockClient.get).toHaveBeenCalledWith('/e2ee/groups/g-1/sender-keys/sender-1');
    expect(result.recipientId).toBe('user-1');
  });

  it('listSenderKeys GETs the senders list', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ senderId: 'sender-1', keyId: 1, updatedAt: '2026-01-01' }],
      },
    });

    const result = await groupE2eeApi.listSenderKeys('g-1');

    expect(mockClient.get).toHaveBeenCalledWith('/e2ee/groups/g-1/sender-keys');
    expect(result).toHaveLength(1);
  });

  it('deleteSenderKey DELETEs the sender key', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: { deleted: true } } });

    await groupE2eeApi.deleteSenderKey('g-1', 'sender-1');

    expect(mockClient.delete).toHaveBeenCalledWith('/e2ee/groups/g-1/sender-keys/sender-1');
  });
});
