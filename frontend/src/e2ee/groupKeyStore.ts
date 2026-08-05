import * as SecureStore from 'expo-secure-store';

const OWN_KEY_PREFIX = 'e2ee_group_own_sender_key_';
const RECEIVED_KEY_PREFIX = 'e2ee_group_received_sender_key_';
const RECEIVED_KEY_ID_PREFIX = 'e2ee_group_received_key_id_';

export const groupKeyStore = {
  async saveOwnSenderKey(groupId: string, keyBase64: string): Promise<void> {
    await SecureStore.setItemAsync(`${OWN_KEY_PREFIX}${groupId}`, keyBase64);
  },

  async getOwnSenderKey(groupId: string): Promise<string | null> {
    return SecureStore.getItemAsync(`${OWN_KEY_PREFIX}${groupId}`);
  },

  async saveReceivedSenderKey(
    groupId: string,
    senderId: string,
    keyBase64: string,
    keyId: number,
  ): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(`${RECEIVED_KEY_PREFIX}${groupId}_${senderId}`, keyBase64),
      SecureStore.setItemAsync(`${RECEIVED_KEY_ID_PREFIX}${groupId}_${senderId}`, String(keyId)),
    ]);
  },

  async getReceivedSenderKey(groupId: string, senderId: string): Promise<string | null> {
    return SecureStore.getItemAsync(`${RECEIVED_KEY_PREFIX}${groupId}_${senderId}`);
  },

  async getReceivedSenderKeyId(groupId: string, senderId: string): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(`${RECEIVED_KEY_ID_PREFIX}${groupId}_${senderId}`);
    return raw ? Number(raw) : null;
  },

  async clearGroup(groupId: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${OWN_KEY_PREFIX}${groupId}`);
  },
};
