import { groupKeyStore } from './groupKeyStore';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store is globally mocked in frontend/jest.setup.ts; cast the
// mocked module for typed access rather than re-mocking it locally.
const mockStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

describe('groupKeyStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.getItemAsync.mockResolvedValue(null);
  });

  describe('saveOwnSenderKey / getOwnSenderKey', () => {
    it('saves and retrieves an own sender key', async () => {
      mockStore.getItemAsync.mockResolvedValue('my-sender-key');

      await groupKeyStore.saveOwnSenderKey('g-1', 'my-sender-key');
      const result = await groupKeyStore.getOwnSenderKey('g-1');

      expect(result).toBe('my-sender-key');
      expect(mockStore.setItemAsync).toHaveBeenCalledWith(
        'e2ee_group_own_sender_key_g-1',
        'my-sender-key',
      );
      expect(mockStore.getItemAsync).toHaveBeenCalledWith('e2ee_group_own_sender_key_g-1');
    });

    it('returns null when no key is stored', async () => {
      const result = await groupKeyStore.getOwnSenderKey('g-1');
      expect(result).toBeNull();
    });
  });

  describe('saveReceivedSenderKey / getReceivedSenderKey', () => {
    it('saves and retrieves a received sender key', async () => {
      mockStore.getItemAsync.mockResolvedValue('received-key');

      await groupKeyStore.saveReceivedSenderKey('g-1', 'sender-1', 'received-key', 5);
      const result = await groupKeyStore.getReceivedSenderKey('g-1', 'sender-1');

      expect(result).toBe('received-key');
      expect(mockStore.setItemAsync).toHaveBeenCalledWith(
        'e2ee_group_received_sender_key_g-1_sender-1',
        'received-key',
      );
    });

    it('returns null when no key is stored', async () => {
      const result = await groupKeyStore.getReceivedSenderKey('g-1', 'sender-1');
      expect(result).toBeNull();
    });
  });

  describe('getReceivedSenderKeyId', () => {
    it('returns the keyId as a number', async () => {
      mockStore.getItemAsync.mockResolvedValue('7');

      const result = await groupKeyStore.getReceivedSenderKeyId('g-1', 'sender-1');
      expect(result).toBe(7);
    });

    it('returns null when no keyId is stored', async () => {
      const result = await groupKeyStore.getReceivedSenderKeyId('g-1', 'sender-1');
      expect(result).toBeNull();
    });
  });

  describe('clearGroup', () => {
    it('deletes the own sender key for the group', async () => {
      await groupKeyStore.clearGroup('g-1');

      expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('e2ee_group_own_sender_key_g-1');
    });
  });
});
